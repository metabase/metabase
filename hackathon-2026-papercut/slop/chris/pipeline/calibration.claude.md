# Papercut mining: calibration notes (Claude transcripts, 2026-09-23)

The pipeline lives in this directory, and its outputs are in `output/`:

1. `prep.py` renders every `~/.claude/projects/**/*.jsonl` (674 files) into 60k-char chunks (1,096 chunks) and redacts secrets.
2. `filter.py` drops embargoed sessions: 77 files, leaving 941 chunks.
3. `classify.py` asks Jev (`jev-latest`, jev-1.13.0) 7 noul questions per chunk. That covered 914 chunks and 12.7M input tokens, about $0.53.
4. The ranking weights self_inflicted_bug, user_correction, misleading_signal, codebase_trap and flailing above tool_misuse and env_friction, and only counts the part of each score above its median. The top 110 chunks (52 sessions) went to 10 Claude drill-down agents (`drill-prompt.md`, `output/batches/`).

## Score distributions (914 chunks)

| question | median | p90 | >0.8 |
|---|---|---|---|
| self_inflicted_bug | 0.14 | 0.89 | 132 |
| tool_misuse | 0.72 | 0.93 | 360 |
| misleading_signal | 0.41 | 0.72 | 56 |
| user_correction | 0.09 | 0.76 | 70 |
| codebase_trap | 0.47 | 0.78 | 70 |
| flailing | 0.24 | 0.56 | 6 |
| env_friction | 0.60 | 0.91 | 265 |

Observations:
- tool_misuse and env_friction are near-saturated. On their own they don't discriminate: almost every long agent session has some command retry or sandbox friction. Either tighten their criteria (for example "…and the cause was the tool's interface or docs, not a typo") or drop them in favour of more specific questions.
- flailing almost never fires above 0.8. Its median is low, yet the drill-downs found plenty of flailing, so the criteria are probably too strict ("many steps").
- user_correction had the most precision problems. It fires on style and voice feedback, prose rewording and design-taste back-and-forth, none of which has an environmental cause. It needs a companion question: "was the correction about a factual/technical error vs. a preference?"
- self_inflicted_bug + codebase_trap together was the best predictor of a real codebase papercut.
- Many real papercuts came from **env/tooling that is not in the Metabase repo**: the zsh/BSD/ugrep shell environment of the Bash tool, git-spice, roborev, kata, the linear CLI, codex, gh. A useful tool should classify the *owner* of the papercut (repo code / repo tooling / personal dotfiles and ~/bin / third-party CLI / harness / agent behaviour).
- `agent-behaviour` papercuts (git add -A sweeping concurrent edits, amending pushed commits, Python edits on Clojure, `--no-verify` reflexes, review-fix churn) recur across many sessions. Several of them happen *despite* an existing memory entry, which is a signal in itself: memory-as-documentation doesn't stop the behaviour. These want hooks or lints rather than notes.

## False positives reported by drill-down agents

Each is a flagged region that turned out to have no environmental cause:

- Style/voice/tone corrections on prose (several sessions: 1212e408, cfa33e63, 4ba7971f, 06df2484): user_correction fired.
- Design-taste back-and-forth (584db19f:2142-2710, 55e589b9, slackbot 1843e5b3): user_correction fired.
- Ordinary logic bugs caught by the agent's own tests or by roborev (89a35c24:6156, 80fed4ae, aa87adef, a4d08ba6:1598, 608c9180 rebase slip): self_inflicted_bug fired. It's correct that a bug happened, but no trap caused it.
- Reasoning slips: `awk NR` vs `FNR`, two-dot vs three-dot diff, squash-merge detection via `diff A...B`, overclaimed security finding, deploy-timing inference stated as fact, grep only for picomatch.
- Already-documented, correctly-handled local-env failures: warm-REPL `:reload` (584db19f:3230), master-also-fails tests (584db19f:540, bc72fc8d:276).
- A benchmark that looked worse but was correct after narrowing scope (bc72fc8d:1229).
- One-off GitHub config learning (CodeQL default vs advanced setup; 21d274f9).

## Chunks Jev refused (HTTP 403, HTML body — looks like a WAF on api.typesafe.ai)

None of these were classified. Most are the kondo-ratchets workflow subagents, so the WAF may be tripping on a content pattern there. Worth a retry once the cause is known.

- evals-bot-2165-expand-provider-matrix/253f6689 chunk 5
- evals-golden-nlq-unwinnable/579fe04e chunk 0
- evals/2bb079e3 chunk 0; evals/3bdfd417 chunk 2
- metabase-boost-metabot-library-selection/83b14905 chunk 1
- metabase-kondo-ratchets/4ba7971f workflow wf_6ab3a85d-38f: 18 subagents, chunk 0 each
- metabase-metabot-gpt-6-astra/4f1bcc48 chunk 1
- metabase-search-delete-00-memoize-model-hooks/bc72fc8d chunk 5
- metabase-slackbot-uploads-cleanup/8473e9da chunk 1

## Coverage gaps

- Only the top 110 of 914 classified chunks were drilled into. Ranks 110-300 probably hold more.
- Two 80394-metabot-tennant sessions (b31b1fd7, f6535e97) were deleted from `~/.claude/projects` between preprocessing and drill-down. They were drilled from the redacted chunk text instead.
- Codex transcripts (`~/.codex/sessions`) were not mined here. The `chris.codex.*` files come from a separate effort.
