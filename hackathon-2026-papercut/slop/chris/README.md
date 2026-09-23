# Chris's papercut data

Papercuts mined from Chris's Claude and Codex transcripts on 2026-09-23, plus the pipeline that found them and reviews of the results.

| Path | Contents |
| --- | --- |
| `papercuts/claude/` | One writeup per papercut from the Claude transcripts, and `chris.claude.INDEX.md` |
| `papercuts/codex/` | One writeup per papercut from the Codex transcripts, `chris.codex.index.md`, and Codex's Jev screening output |
| `pipeline/` | Scripts and prompt for the Claude mining pipeline, and its calibration notes |
| `pipeline/output/` | Jev scores, the ranking, and the drill-down batches |
| `reports/` | Reviews: how the two collections compare, and the server schema |

Filenames follow `chris.<agent>.<slug>.md`.
`import_local.py` reads the agent and slug from the name, and the slug is the grouping key, so don't rename writeups.

Import both collections into a running server:

```sh
python3 import_local.py slop/chris/papercuts/claude slop/chris/papercuts/codex
```
