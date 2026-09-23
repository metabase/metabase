# Andrei's papercut data

Papercuts mined from Andrei's Claude Code transcripts on 2026-09-23, and the pipeline that found them.

| Path | Contents |
| --- | --- |
| `papercuts/claude/` | One write-up per papercut, and `andrei.claude.INDEX.md` |
| `pipeline/` | Scripts, the drill-down and review briefs, and [calibration notes](pipeline/calibration.md) |

Filenames follow `andrei.<agent>.<slug>.md`, same as Chris's. When a papercut is one Chris already wrote up, the write-up reuses his slug, so the importer files both reports under one papercut and the count goes up.

Import into a running server:

```sh
python3 import_local.py slop/andrei/papercuts/claude
```

Only papercuts about Metabase and public tooling are published. Write-ups about other repositories, internal services, personal setup or anything security-related stay on the laptop, and so does the raw mining output (scores and chunk text).
