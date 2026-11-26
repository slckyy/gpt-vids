# Making a video with this checkout

When a user requests a launch or demo video, use the named project as the subject. If the request names a website, use the browser and session the user has authorized for that job. Keep customer data out of publicly shareable examples.

- For `/brag`, read [skills/brag/SKILL.md](skills/brag/SKILL.md) and the references it calls for. The canonical paths here also work on Windows clones where Git checks out discovery symlinks as text.
- For `/brag-slim`, read [skills/brag-slim/SKILL.md](skills/brag-slim/SKILL.md). For a browser-free render, compose timed PNG frames from project assets and use the frame encoder below.
- Put the plan, composition, rendered MP4, poster, credits and share copy in the subject project's output directory as directed by the chosen workflow. Keep renders local unless publication was requested. Credit bundled music according to [its license](skills/brag/assets/music/README.md).

## Render tools

From this checkout, use `npm ci` to install the locked toolchain. Windows x64 includes FFmpeg and FFprobe as optional dependencies. Other platforms can provide both executables on PATH. The Hyperframes authoring and CLI references installed with this version are under `node_modules/hyperframes/dist/skills/`. The CLI's `catalog` command lists available effects and components.

```sh
npm run check
node scripts/hyperframes.mjs check "/path/to/composition"
node scripts/hyperframes.mjs render "/path/to/composition" --output "/path/to/brag.mp4"
```

To encode already-composed PNGs and a mixed audio track, use a numbered sequence and specify its exact frame count. At 30 fps, 600 frames make a 20-second video. Supply `--start 0` for zero-based filenames or omit `--audio` for a silent video.

```sh
node scripts/render-frames.mjs --frames "work/frames/frame-%06d.png" --fps 30 --count 600 --audio "work/mix.wav" --out "brag.mp4"
```

The frame encoder decodes the result and checks the frame count and audio duration. Review a settled frame from each scene and a frame from each transition before delivery.
