import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";

const require = createRequire(import.meta.url);
const env = { ...process.env };
env.HYPERFRAMES_NO_TELEMETRY ??= "1";
try {
  const home = path.dirname(require.resolve("hyperframes/package.json"));
  env.HYPERFRAMES_CACHE_DIR ??= path.resolve(home, "..", ".cache", "hyperframes");
  if (process.platform === "win32" && process.arch === "x64") {
    const dirs = [];
    for (const name of ["ffmpeg", "ffprobe"]) {
      const binary = path.resolve(home, "..", `@${name}-installer`, "win32-x64", name + ".exe");
      const setting = `HYPERFRAMES_${name.toUpperCase()}_PATH`;
      if (existsSync(binary)) env[setting] ??= binary;
      if (env[setting]) dirs.push(path.dirname(env[setting]));
    }
    const key = Object.keys(env).find(key => key.toLowerCase() === "path") || "PATH";
    env[key] = [...dirs, env[key]].filter(Boolean).join(path.delimiter);
  }
  const cli = path.join(home, "bin", "hyperframes.mjs");
  const result = spawnSync(process.execPath, [cli, ...process.argv.slice(2)], { env, stdio: "inherit", windowsHide: true });
  if (result.error) throw result.error;
  process.exitCode = result.status ?? 1;
} catch (error) {
  console.error(error.code === "MODULE_NOT_FOUND" ? "Run npm ci in the gpt-vids checkout to install Hyperframes." : error.message);
  process.exitCode = 1;
}
