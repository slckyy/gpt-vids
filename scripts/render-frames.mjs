#!/usr/bin/env node

// Encode an already-composed PNG sequence with local FFmpeg, then decode it for verification.
import { spawn, spawnSync } from "node:child_process";
import { constants } from "node:fs";
import { copyFile, link, lstat, mkdtemp, rm, stat } from "node:fs/promises";
import path from "node:path";
import { createInterface } from "node:readline";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";

const usage = `Usage: node scripts/render-frames.mjs --frames "frames/frame-%06d.png" --count 600 --out launch.mp4 [--fps 30] [--start 1] [--audio music.wav]

Use %d or %0Nd in the filename. Frame numbers start at 1 by default.
FPS is a positive whole number. Audio loops or trims to the video length.
The output directory must exist. Existing files are never overwritten.
Set FFMPEG_PATH to select a particular FFmpeg executable.`;

function integer(label, value, min) {
  const result = Number(value);
  if (!/^\d+$/.test(value ?? "") || !Number.isSafeInteger(result) || result < min) {
    throw new Error(`--${label} must be a whole number of at least ${min}.`);
  }
  return result;
}

function chooseEncoder() {
  const bundled = path.join(process.env.ProgramFiles || "C:/Program Files", "Softdeluxe", "Free Download Manager", "ffmpeg.exe");
  const projectFFmpeg = fileURLToPath(new URL("../node_modules/@ffmpeg-installer/win32-x64/ffmpeg.exe", import.meta.url));
  const windows = process.platform === "win32";
  const paths = process.env.FFMPEG_PATH ? [process.env.FFMPEG_PATH] : [
    ...(windows && process.arch === "x64" ? [projectFFmpeg] : []), "ffmpeg", ...(windows ? [bundled] : []),
  ];
  for (const executable of paths) {
    const probe = spawnSync(executable, ["-hide_banner", "-encoders"], { encoding: "utf8", windowsHide: true });
    if (probe.error?.code === "ENOENT") continue;
    if (probe.error || probe.status !== 0) throw new Error(`Cannot run FFmpeg at ${executable}: ${probe.error?.message || probe.stderr}`);
    if (/\blibx264\s/.test(probe.stdout)) return { executable, name: "libx264", flags: ["-pix_fmt", "yuv420p", "-preset", "medium", "-crf", "18"] };
    if (/\bh264_mf\s/.test(probe.stdout)) return { executable, name: "h264_mf", flags: ["-pix_fmt", "nv12", "-b:v", "8M"] };
  }
  throw new Error("A local FFmpeg with libx264 or h264_mf is required. Set FFMPEG_PATH to its executable.");
}

function run(executable, args, onLine) {
  return new Promise((resolve, reject) => {
    const child = spawn(executable, ["-nostdin", "-hide_banner", "-loglevel", "error", "-xerror", ...args], {
      windowsHide: true, stdio: ["ignore", onLine ? "pipe" : "ignore", "pipe"],
    });
    let message = "";
    child.stderr.setEncoding("utf8").on("data", chunk => { message = (message + chunk).slice(-6000); });
    if (onLine) createInterface({ input: child.stdout, crlfDelay: Infinity }).on("line", onLine);
    child.once("error", reject);
    child.once("close", code => code === 0 ? resolve() : reject(new Error(message.trim() || `FFmpeg exited with status ${code}.`)));
  });
}

async function verify(executable, file, count, fps, audio) {
  let frames = 0;
  let samples = 0;
  // This decodes both tracks. Wrapped frames avoid making another full-sized movie in memory.
  await run(executable, ["-i", file, "-map", "0:v:0", ...(audio ? ["-map", "0:a:0"] : []),
    "-c:v", "wrapped_avframe", "-vsync", "0", ...(audio ? ["-c:a", "pcm_s16le", "-ar", "48000"] : []),
    "-f", "framecrc", "pipe:1"], line => {
    if (line.startsWith("0,")) frames++;
    if (line.startsWith("1,")) samples += Number(line.split(",")[3]);
  });
  if (frames !== count) throw new Error(`Decoded ${frames} frames. Expected ${count}.`);
  // AAC can include up to one trailing padded packet.
  if (audio && (!samples || Math.abs(samples - count / fps * 48000) > 1025)) {
    throw new Error(`Audio verification failed: decoded ${samples} samples for ${count} frames at ${fps} fps.`);
  }
}

async function main() {
  const { values: args } = parseArgs({ options: {
    frames: { type: "string" }, out: { type: "string" }, count: { type: "string" },
    fps: { type: "string", default: "30" }, start: { type: "string", default: "1" },
    audio: { type: "string" }, help: { type: "boolean", short: "h" },
  } });
  if (args.help) { console.log(usage); return; }
  if (!args.frames || !args.out) throw new Error(usage);
  const fps = integer("fps", args.fps, 1);
  const count = integer("count", args.count, 1);
  const start = integer("start", args.start, 0);
  const frames = path.resolve(args.frames);
  const pattern = /%(?:0([1-9]\d?))?d/;
  const match = path.basename(frames).match(pattern);
  if (!match || frames.replace(match[0], "").includes("%") || path.extname(frames).toLowerCase() !== ".png") {
    throw new Error("--frames must contain one %d or %0Nd sequence number in a PNG filename.");
  }
  const output = path.resolve(args.out);
  if (path.extname(output).toLowerCase() !== ".mp4") throw new Error("--out must end in .mp4.");
  if (await lstat(output).catch(e => { if (e.code !== "ENOENT") throw e; })) throw new Error(`Output already exists: ${output}`);
  const audio = args.audio && path.resolve(args.audio);
  if (audio && !(await stat(audio)).isFile()) throw new Error(`Expected an audio file: ${audio}`);
  for (let i = 0; i < count; i++) {
    const file = frames.replace(match[0], String(start + i).padStart(Number(match[1] || 0), "0"));
    if (!(await stat(file)).isFile()) throw new Error(`Expected a PNG file: ${file}`);
  }

  const { executable, name, flags } = chooseEncoder();
  const temp = await mkdtemp(path.join(path.dirname(output), ".brag-render-"));
  const movie = path.join(temp, "encoded.mp4");
  try {
    await run(executable, ["-framerate", String(fps), "-start_number", String(start), "-i", frames,
      ...(audio ? ["-stream_loop", "-1", "-i", audio] : []), "-map", "0:v:0", ...(audio ? ["-map", "1:a:0"] : []),
      "-t", (count / fps).toFixed(9), "-vf", "pad=ceil(iw/2)*2:ceil(ih/2)*2", "-c:v", name, ...flags,
      ...(audio ? ["-c:a", "aac", "-ar", "48000", "-b:a", "192k"] : []), "-movflags", "+faststart", movie]);
    await verify(executable, movie, count, fps, audio);
    try {
      await link(movie, output);
    } catch (e) {
      if (!["EPERM", "ENOSYS", "ENOTSUP", "EOPNOTSUPP", "EXDEV"].includes(e.code)) throw e;
      await copyFile(movie, output, constants.COPYFILE_EXCL);
    }
    console.log(`Verified ${count} frames at ${fps} fps with ${name}${audio ? " and AAC audio" : ""}: ${output}`);
  } finally {
    await rm(temp, { recursive: true, force: true });
  }
}

main().catch(error => { console.error(error.message); process.exitCode = 1; });
