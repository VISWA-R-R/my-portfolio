# Character videos (optional, 4K ready)

The landing page plays a looping video for the selected character. If a file is missing, the
still image is shown instead, so nothing breaks while you prepare them.

Drop these files in this folder (names must match exactly):

| Character            | 4K file                   | 1080p fallback            |
| -------------------- | ------------------------- | ------------------------- |
| The Builder          | `builder-2160.mp4`        | `builder-1080.mp4`        |
| The Interface Artist | `interface-2160.mp4`      | `interface-1080.mp4`      |
| The Tinkerer         | `tinkerer-2160.mp4`       | `tinkerer-1080.mp4`       |

Screens at 2560 physical pixels wide or more (and not on Data Saver) load the `-2160` file.
Everything else loads `-1080`.

## Recommended export

- 3840 x 2160, 24 or 30 fps, 6 to 10 second seamless loop, no audio.
- H.264 (widest support). Keep each 4K file under about 12 MB.

```bash
# 4K
ffmpeg -i source.mov -vf scale=3840:2160 -c:v libx264 -crf 24 -preset slow -pix_fmt yuv420p -an -movflags +faststart builder-2160.mp4
# 1080p
ffmpeg -i source.mov -vf scale=1920:1080 -c:v libx264 -crf 25 -preset slow -pix_fmt yuv420p -an -movflags +faststart builder-1080.mp4
```
