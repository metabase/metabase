---
title: A Slack file dropped with no text became an empty user turn in the Slackbot's rebuilt history, so every later request in that DM was rejected by the model API and a live replication gave identical wrong replies for two different tests
slug: slackbot-file-share-without-text-poisons-thread
kind: test-harness
impact: wasted-time
severity: medium
status: fixed # master's thread->history now names a text-less message's attachments or drops it (user-msg-content)
area: src/metabase/slackbot/streaming.clj (thread->history, ignore-msg?, user-msg-content); manual Slack testing (one bot DM reused for every run); Anthropic messages API
occurrences:
  - transcript: ~/.claude/projects/-Users-andrei-src-mb/9c731f52-2492-475c-9f41-ba4fae7b695a.jsonl
    lines: 625-842
    date: 2026-09-09
    jev: {any_papercut: 0.88, env_toolchain: 0.80, stale_state: 0.40, verify_mismatch: 0.86, misleading_code: 0.25, hidden_coupling: 0.61, stale_docs: 0.42, tool_footgun: 0.79, flaky: 0.91, agent_bug: 0.37, wasted_effort: 0.76, user_correction: 0.32}
---
## Summary
Verifying an upload-error PR in a real Slack workspace, the user dropped CSVs into the bot's DM as the agent instructed, with no message text. The Slackbot rebuilds history from the Slack thread, and a text-less file share became a user message with empty content; from then on every request in that DM failed with `user messages must have non-empty content`, so the next test (warehouse stopped) returned the same generic failure as the previous one. After deleting those messages, 40 messages of accumulated DM history still drowned the injected upload error. A clean test needed a new public channel, because private channels are not subscribed and threads are unavailable in the app DM.

## Symptom
L677: the user reports that both runs produced exactly the same reply. L693: log shows `Agent loop API error: Anthropic API error (HTTP 400) - messages.28: user messages must have non-empty content`. L744: after deletion, `Starting agent {:msgs 40}` and the model greeted instead of relaying the failure.

## Timeline
- L621-L625 (21:39 UTC): first ragged-CSV run answered a greeting, not the upload error.
- L658-L673: backend verified correct; next run requested with no message text.
- L677-L693 (21:42): second test returns the same reply; log shows the empty-content 400 from the poisoned history.
- L712-L727: user deletes text-less messages; the next run works but with 40 messages of history.
- L760-L797: DM threads unavailable; a private channel gets no events; a public channel is needed.
- L826-L842 (21:53): clean 2-message run passes.
- Cost: about 14 minutes and five user round trips of manual Slack testing, plus a misleading identical-failure signal.

## Root cause
At the time, `thread->history` mapped every non-bot Slack message to `{:role :user :content text}`, and a file shared on its own arrives with empty text, which the Anthropic API rejects for the whole request. The manual tests reused one bot DM, so the poisoned message and all earlier test turns ride along in every later run.

## Why agents fall for it
Dropping a file with no text is the harshest and most natural test case, and nothing in the product or the test setup warns that it breaks the thread. The failure appears on the next, unrelated test, which reads as a problem with the change under test.

## Current state
Checked origin/master: `thread->history` now calls `user-msg-content`, which returns the text without the bot mention, or names the attachments when the text is blank, or contributes nothing (comment: "The model rejects an empty user message, and a file shared on its own arrives with empty text.").

## Suggested fix
- Keep the master fix and add a regression test for a history containing a file-only message.
- For manual Slack testing, start each replication in a fresh public channel thread (or clear the DM) so runs are independent and history is small.

## Detection signal
`user messages must have non-empty content` in dev logs; two different Slack replication cases producing the identical reply; `Starting agent {:msgs N}` with large N during manual tests.

## Raw excerpts
```
L838 [RESULT] 5:[backend] 2026-09-09 21:52:41,853 WARN slackbot.uploads :: [slackbot] File upload failed: error=Connections could not be acquired from the underlying database! | 101:[backend] 2026-09-09 21:52:42,363 INFO agent.core :: Starting agent {:profile :slackbot, :tools 8, :max-iter 15, :msgs 2}
```
