---
title: The evals bucket's appdb/stats_copy_dwhs_adjusted.dump sits outside every Store key scheme and looks like an orphan; it is the registered source of dwhs-adjusted, and an agent deleted its local copy as "obsolete"
slug: evals-root-dump-looks-orphaned
kind: codebase-trap
impact: both
severity: high
status: open
area: metabase/evals repo — appdb/artifacts.py (INPUT_KIND dwhs-adjusted), stats/fetch.py (split_location/object_key), stats/source.py, S3 evals bucket appdb/ prefix, .appdb/ local cache
occurrences:
  - transcript: /Users/christruter/.claude/projects/-Users-christruter-workspace-metabase-evals/40577984-dcbb-4011-adcc-83edaa79924d.jsonl
    lines: 1003-1262
    date: 2026-08-26
    jev: {self_inflicted_bug: 0.84, tool_misuse: 0.38, misleading_signal: 0.46, user_correction: 0.97, codebase_trap: 0.88, flailing: 0.49, env_friction: 0.90}
---
## Summary
The user asked the agent to "GC the old snapshot outputs" because unsanitized data should not lie
around. To decide what was dead, the agent checked what current code can address. The S3 object
`appdb/stats_copy_dwhs_adjusted.dump` sits at the `appdb/` root, outside the `<kind>/<version>/` layout
that `Store.key()` builds. The agent called it "Stray at bucket root ... no `Store.key()` can address
it". It then deleted the local 1.9 GB `.appdb/2026-07-31-pg-custom-fd5a6cfe2506.dump` as
"pre-sanitation, obsolete". The user corrected it: "we need that root dump to do future outputs".
That object is the registered source of the `dwhs-adjusted` artifact: the artifact's manifest says
`"source_version": "legacy:appdb/stats_copy_dwhs_adjusted.dump"`. It is also reachable through a second
key scheme (`STATS_DUMPS_BUCKET=<bucket>/appdb` + `STATS_DUMP_FILE=...`, via `stats/fetch.py
split_location`/`object_key`). The local copy was byte-identical and was re-downloaded. The S3
deletions made in the same GC (the `appdb/sanitized/` prefix, six Aug-03 `redacted-remapped`
versions) are permanent. The bucket has no versioning, on purpose, so that redaction is real.

## Symptom
- L1106 agent table: "`appdb/stats_copy_dwhs_adjusted.dump` | 2.09 GB | Stray at bucket root, outside `<kind>/<version>/` — no `Store.key()` can address it. Pre-sanitation."
- L1095 local deletion: `removed 2026-07-31-pg-custom-fd5a6cfe2506.dump (1.9G, pre-sanitation dwhs-adjusted)`.
- L1127 USER: "we need that root dump to do future outputs".
- L1130 agent: "I claimed nothing in the repo could reach it because no `Store.key()` addresses it. That was the wrong lookup — the app-DB `Store` isn't what reads it."
- L1189 USER: "download everything you shouldn't have deleted" → L1208: "almost none of it can be downloaded ... The bucket has no versioning".

## Timeline
- L1022 agent finds 48.7 GB of orphaned build scratch in `.appdb/` and offers to remove it. It proposes to *keep* the loose `.dump` files, "since those look like deliberate local inputs".
- L1025 USER: "can you GC the old snapshot outputs? not great to leave not-fully-sanitized data lying around". The agent reframes this as data exposure (L1029).
- L1045-1050 agent reads `docs/appdb.md` and `appdb/artifacts.py:17 INPUT_KIND = "dwhs-adjusted"` and concludes adjusted = pre-sanitation input.
- L1073 bulk `rm -rf` loop blocked by the auto-mode classifier; L1078-1095 one target at a time, including the local dwhs-adjusted dump and `build-remap.env` (which held three passwords in plain text).
- L1106-1122 S3 inventory; the user approves "only obsolete sanitized stuff"; `aws s3 rm s3://.../appdb/sanitized/ --recursive`.
- L1127-1153 correction; ETag/size match proves local dump == root object.
- L1172-1216 re-download of the versioned `appdb/dwhs-adjusted/2026-07-31-pg-custom-fd5a6cfe2506/appdb.dump`, sha256 verified against the manifest.
- L1136 then L1257 the agent first suggests wiring `--fetch-raw` at the root dump, then withdraws it: `source.py` would stamp adjusted bytes as `source_kind: "raw-cloud"`.

## Root cause
- The bucket has two addressing schemes. `Store` builds `<kind>/<version>/...`. The legacy raw-fetch path builds `<STATS_DUMPS_BUCKET prefix>/<STATS_DUMP_FILE>`. The root object belongs to neither in code; only data (a manifest's `source_version`) points at it.
- The object's name says "copy" and "adjusted", not "source". The repo does not document it: `grep -rn stats_copy_dwhs_adjusted` in the evals repo finds nothing.
- `artifacts.py:268` says the input kind "is published by another pipeline", so the provenance lives outside this repo.

## Why agents fall for it
- "Can current code address it?" is the natural GC test, and here it gives the wrong answer.
- The user's framing ("not great to leave not-fully-sanitized data lying around") pushes toward deleting anything pre-sanitation, and this object *is* pre-sanitation data.
- Size/ETag lineage (`fd5a6cfe2506` in the local file name == the root object's ETag prefix) is visible only if you look for it.

## Current state
- Not documented in the evals repo (`docs/appdb.md:36-49` explains `--fetch-raw`, `STATS_DUMPS_BUCKET` and `dwhs-adjusted`, but never names the root object). The evals memory `evals-appdb-publish-runbook-traps.md` covers `--fetch-raw` being unconfigured, not this object.
- Checked 2026-09-23: `grep -rn "stats_copy_dwhs_adjusted\|legacy:appdb"` over the evals checkout (b9ed9e7) → no hits.

## Suggested fix
- Record in `docs/appdb.md` (or a README in the bucket prefix) that `appdb/stats_copy_dwhs_adjusted.dump` is the source of `dwhs-adjusted` and must not be deleted. Or move it under a `<kind>/<version>/` key with a manifest.
- Give GC a fixed keep-list: any object named in any manifest's `source_version` / `source_identity`.
- Agent side: before deleting data, search manifests and provenance fields for the object key, not only code.

## Detection signal
- An `aws s3 rm` or `rm` of a `.dump` whose name or ETag prefix appears in a `manifest.json` `source_version` / `source_sha256`.
- Agent prose like "no code references it" or "orphan" followed by deletion of data files.

## Raw excerpts
```
L1106 [ASSISTANT] ## The three pre-sanitation items left in S3
| `appdb/stats_copy_dwhs_adjusted.dump` | 2.09 GB | Stray at bucket root, outside `<kind>/<version>/` — no `Store.key()` can address it. Pre-sanitation. |
| `appdb/dwhs-adjusted/` | 1.99 GB | The build's **input** kind — pre-sanitation by definition. But `artifacts.py` notes it is *"published by another pipeline"*. |
L1136 [ASSISTANT] ... `split_location` accepts `bucket/prefix` and `object_key` joins them, so that object is reachable through a *different* env pair than the Store's key scheme:
STATS_DUMPS_BUCKET=evals-...-an/appdb
STATS_DUMP_FILE=stats_copy_dwhs_adjusted.dump
L1173 [RESULT] ... "source_sha256": null,
  "source_version": "legacy:appdb/stats_copy_dwhs_adjusted.dump",
  "version": "2026-07-31-pg-custom-fd5a6cfe2506"
L1214 [RESULT] sha256=fa45b0a9...  expect=fa45b0a9...
L1228 [USER] i don't want bucket versioning because i want to be able to really redact files when necessary
```
