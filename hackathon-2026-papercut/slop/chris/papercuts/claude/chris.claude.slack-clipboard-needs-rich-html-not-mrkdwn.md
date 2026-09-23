---
title: "Copy a Slack message to my clipboard": plain text with mrkdwn `<url|text>` pastes literally; Slack needs public.html on the pasteboard
slug: slack-clipboard-needs-rich-html-not-mrkdwn
kind: doc-gap
impact: wasted-time
severity: low
status: open
area: macOS pasteboard + Slack composer; agent drafting under Chris's name
occurrences:
  - transcript: /Users/christruter/.claude/projects/-Users-christruter-workspace-metabase-evals-bot-2165-expand-provider-matrix/253f6689-2454-43e0-b1df-dece373b153a.jsonl
    lines: 2822-2845
    date: 2026-09 (after Sep 17)
    jev: {self_inflicted_bug: 0.40, tool_misuse: 0.94, misleading_signal: 0.76, user_correction: 0.94, codebase_trap: 0.64, flailing: 0.36, env_friction: 0.72}
---
## Summary
Asked to "draft a slack message ... and copy it to my clipboard in slack format", the agent used
`pbcopy` on text with Slack mrkdwn link syntax (`<https://...|#142>`), backticks, and `•` bullets. The
Slack composer does not render mrkdwn in pasted plain text, so links and code showed up as literal
characters. The user corrected: "that isn't formatting code and links etc right - make sure its in the
format slack can paste". The agent then used JXA/NSPasteboard to put both `public.html` (with real `<a>`,
`<code>`, and `<ul>`) and a plain-text fallback on the pasteboard.

## Symptom
```
L2826 cat <<'EOF' | pbcopy && pbpaste
... The `SCHEMA_VERSION` bump to 7 in <https://github.com/metabase/evals/pull/142|#142> ...
L2837 [USER] that isn't formatting code and links etc right - make sure its in the format slack can paste
L2841 [ASSISTANT] Slack's message box doesn't interpret `<url|text>` or markdown when you paste plain text ... It does keep formatting from pasted rich text. So I'll put the message on the clipboard as HTML
L2842 osascript -l JavaScript -e "ObjC.import('AppKit'); ... pb.setStringForType(html, 'public.html'); pb.setStringForType(txt, 'public.utf8-plain-text'); ..."
```

## Root cause
"Slack format" usually means mrkdwn, which is the API or bot message syntax. The composer's paste path
reads rich text instead. The working recipe already exists in the user's own tool (`~/bin/slack-prs`
lines 22 and 350-373: "Copies an HTML flavor (public.html) so refs paste into Slack as real links"),
but no memory entry or skill generalizes it.

## Why agents fall for it
mrkdwn is the documented "Slack format". `pbcopy` can only write plain text.

## Current state
Open. `user_tools.md` mentions that `slack-prs` produces a "Slack-ready update" but does not describe the
HTML pasteboard technique. No skill covers clipboard output for Slack.

## Suggested fix
Add a memory or skill snippet: "For Slack paste, put HTML on the pasteboard (JXA NSPasteboard
`public.html` plus `public.utf8-plain-text`), as `~/bin/slack-prs` does." Or add a small `~/bin/slack-clip`
that reads markdown and writes HTML plus plain text to the pasteboard.

## Detection signal
The user message mentions "slack" and "clipboard", and the next tool call is `pbcopy` on text that contains `<http...|...>`.

## Raw excerpts
See Symptom.
