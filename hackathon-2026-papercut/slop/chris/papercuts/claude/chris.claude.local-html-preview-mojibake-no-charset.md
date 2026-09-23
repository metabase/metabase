---
title: Artifact HTML previewed via `python3 -m http.server` (or a mermaid render page) shows mojibake for · and — because the page has no <meta charset> and the server sends none
slug: local-html-preview-mojibake-no-charset
kind: env-friction
impact: wasted-time
severity: low
status: open
area: artifact authoring workflow (scratchpad HTML + local http.server + claude-in-chrome screenshots)
occurrences:
  - transcript: /Users/christruter/.claude/projects/-Users-christruter-workspace-metabase-evals/3bdfd417-14a3-46c9-84f9-28a801ebd34e.jsonl
    lines: 440-511, 829-841
    date: 2026-09-02
    jev: {self_inflicted_bug: 0.91, tool_misuse: 0.90, misleading_signal: 0.37, user_correction: 0.97, codebase_trap: 0.56, flailing: 0.52, env_friction: 0.91}
---
## Summary
To check the layout of a diagram artifact, the agent served the scratchpad with `python3 -m http.server 8731` and screenshotted it in Chrome. Every `·` and `—` rendered as mojibake. `http.server` sends `text/html` with no charset, and the page (written to the artifact contract, which starts at `<title>`) had no `<meta charset="utf-8">`, so Chrome fell back to a legacy encoding. The agent "fixed" it by making the whole file ASCII (`LC_ALL=C grep -n '[^ -~	]'`), losing the typography. It hit the same thing again with the mermaid render page (L829: "the middot mojibakes again without a declared charset").

Also in the same window: the agent created files at mangled scratchpad paths (`.../3bdfd417-14a3-46c9-84f9-28a481ceff.html`, `.../3bdfd417-14a3-46c9-84f9-28a49c1f7b3e/scratchpad/...`). These were typos of the session UUID, written as "placeholder" and then `rm`'d (L468-490). Long UUID paths are easy to garble.

## Symptom
- L467 ASSISTANT: "Three real problems: labels floating ~70px above 26px arrow stubs, everything scaled down to ~7px because the viewBox is wider than its container, and mojibake on every `·` and `—`."
- L510: `sed -i '' 's/#33१c14/#331c14/'` (a Devanagari digit had slipped into a hex colour) then `LC_ALL=C grep -n '[^ -~	]'` to make sure the file was all ASCII.
- L829: same mojibake in the mermaid preview.
- L435 USER (the trigger for viewing at all): "some really bad layout in a few places ... try view it".

## Root cause
The published Artifact host serves with a proper charset, so the page is fine in production. A local preview doesn't match, and the agent then changes the content to suit the preview.

## Why agents fall for it
The preview is the only visual check available. Mojibake looks like a content bug, so the agent strips characters rather than adding a charset.

## Current state
Open. The artifact-design guidance doesn't mention local previews or `<meta charset>`.

## Suggested fix
- Include `<meta charset="utf-8">` in every artifact page (harmless when published), or preview with a server that sends `charset=utf-8` (e.g. `python3 -c` with a handler setting `Content-Type: text/html; charset=utf-8`).
- Note in the diagramming/design skill: "local previews: declare charset".

## Detection signal
- Assistant text mentions "mojibake" after a `http.server` launch.
- `LC_ALL=C grep '[^ -~]'` sweeps on an HTML artifact.

## Raw excerpts
```
L440 [TOOL Bash] cd .../scratchpad && (python3 -m http.server 8731 >/dev/null 2>&1 &) ; sleep 1; curl -s -o /dev/null -w "%{http_code}\n" http://localhost:8731/eval-pipeline.html
L467 [ASSISTANT] Now I can see it. Three real problems: ... and mojibake on every `·` and `—`. Rebuilding the diagrams.
L829 [ASSISTANT] Renders, but two problems: the middot mojibakes again without a declared charset, and Stage A sprawls.
```
