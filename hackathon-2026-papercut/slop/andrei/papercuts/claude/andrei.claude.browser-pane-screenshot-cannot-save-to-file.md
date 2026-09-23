---
title: The Browser pane `screenshot` action returns an 800-pixel JPEG only inline, with no way to write it to disk, so an agent asked for PNG files searched ~/.claude, /tmp and /var/folders and finally base64-decoded the image out of its own transcript JSONL
slug: browser-pane-screenshot-cannot-save-to-file
kind: tool-quirk
impact: wasted-time
severity: low
status: unknown
area: mcp__Claude_Browser__computer screenshot; tasks whose deliverable is an image file
occurrences:
  - transcript: ~/.claude/projects/-Users-andrei-src-mb/ea892f4f-4e3c-479f-b370-880a3afe35e8/subagents/agent-a9924bd44e17652e1.jsonl
    lines: 221-269
    date: 2026-09-03
    jev: {any_papercut: 0.89, env_toolchain: 0.92, stale_state: 0.34, verify_mismatch: 0.08, misleading_code: 0.20, hidden_coupling: 0.52, stale_docs: 0.54, tool_footgun: 0.74, flaky: 0.84, agent_bug: 0.30, wasted_effort: 0.78, user_correction: 0.74}
---
## Summary
The task was to save two live screenshots to ~/Downloads. The Browser pane tools only return images into the model context, and ToolSearch found no save-to-file option. The agent spent about ten calls searching caches and temp directories for the image, then located the screenshot's tool_result in its own subagent JSONL with jq, base64-decoded it, found it was an 800x500 JPEG and converted it with `sips`. An earlier subagent in the same session gave up on the pane and used headless Chrome instead.

## Symptom
L221: the agent looks for a way to persist the live screenshot to a file path; L222-L238: `ls` and `find` over ~/.claude, ~/Library/Caches, $TMPDIR, /private/tmp and /var/folders; L262: jq over the transcript; L263: "JPEG image data … 800x500".

## Timeline
- L221-L231: filesystem hunt for cached screenshot files, nothing found.
- L234-L235: ToolSearch for a save option, none.
- L238-L262: finds its own transcript, extracts the image block by tool_use_id and decodes it.
- L266-L269: converts JPEG to PNG with `sips`.
- Cost: about 15 tool calls per shot workflow; output capped at the pane's 800-pixel JPEG.

## Root cause
The Browser pane screenshot API has no path or format parameter; images exist only as tool_result content.

## Why agents fall for it
"Take a screenshot and save it" is a normal request, and the tool is called screenshot, so agents assume a file exists somewhere and go looking.

## Current state
not checked; the Browser pane tool schema in this session still has no save or path option for `screenshot`.

## Suggested fix
- Add `save_to` (path) and `format` (png/jpeg) to the screenshot action, returning the path.
- Until then, document the headless Chrome route (`--headless --screenshot=<path>`) for agents.

## Detection signal
`find … -iname "*.png"` hunts right after a Browser pane screenshot, or jq extraction of `.source.data` from a transcript JSONL.

## Raw excerpts
```
L225 [CALL Bash] find ~/.claude -newer <reference-file> \( -iname "*.png" -o -iname "*.jpg" -o -iname "*.jpeg" \) 2>/dev/null | head -30; … find ~/Library/Caches -newermt "-30 minutes" -iname "*.png" …
L228 [CALL Bash] echo "TMPDIR=$TMPDIR"; find "${TMPDIR:-/tmp}" -newermt "-10 minutes" -iname "*.png" …; find /var/folders -maxdepth 6 -newermt "-15 minutes" -iname "*.png" …
L235 [CALL ToolSearch] {"query": "screenshot save file path", "max_results": 10}
L262 [CALL Bash] cd ~/.claude/projects/<workspace>/<session>/subagents ⏎ jq -r 'select(.message.content? != null) | .message.content[]? | select(.type=="tool_result" and .tool_use_id=="toolu_…") | .content[] | select(.type=="image") | .source.data' agent-<id>.jsonl | base64 -d > ~/Downloads/<shot>-before.png
L263 [RESULT] ~/Downloads/<shot>-before.png: JPEG image data, JFIF standard 1.01, … 800x500, components 3
L268 [CALL Bash] sips -s format png ~/Downloads/<shot>-before.png --out ~/Downloads/<shot>-before.png 2>&1
```
