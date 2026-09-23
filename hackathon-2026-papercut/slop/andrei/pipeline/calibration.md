# Calibration notes

How the Claude-transcript run on 2026-09-23 went, for whoever tunes the next one.

## Corpus

Every Claude Code transcript on the laptop: 775 files (154 sessions and 621 subagent runs), rendered by `render.py` into 1,684 chunks of about 60k characters with 6k of overlap. System reminders are stripped, tool output is cut to a few hundred characters (errors keep about 1.5k), and thinking blocks are kept short. Only the Metabase workspace (568 chunks) went on to the drill-down; the rest is another project.

`sanitize.py` scrubs every chunk before it leaves the laptop: exact values read from local env and credential files, common token patterns, URL credentials, emails, names from a local list, IPs and private hostnames.

## Jev screening

`jev.py` asks twelve `noul` questions per chunk. One is overall (`any_papercut`), eight are causes (`env_toolchain`, `stale_state`, `verify_mismatch`, `misleading_code`, `hidden_coupling`, `stale_docs`, `tool_footgun`, `flaky`) and three are symptoms (`agent_bug`, `wasted_effort`, `user_correction`). The whole corpus took 28M input tokens, about $1.19, and roughly a quarter of an hour at 16 concurrent requests.

Jev over-flags long agent sessions. On the Metabase chunks `any_papercut` is at least 0.5 on 68% of them and at least 0.85 on 8%. `env_toolchain`, `tool_footgun` and `agent_bug` sit above 0.5 on about half the chunks, while `stale_state`, `misleading_code` and `stale_docs` rarely clear 0.5 at all, so they need their own lower bars. The flag rule used:

- `any_papercut` ≥ 0.85, or ≥ 0.7 with any cause ≥ 0.8
- or `user_correction` ≥ 0.7, `stale_state` ≥ 0.7, `misleading_code` ≥ 0.65, `stale_docs` ≥ 0.6

That flagged 158 of 568 chunks across 51 sessions. The drill-down found at least one papercut in 141 of them. Agents asked to find papercuts tend to find one, so treat that as an upper bound on precision.

## Localization

`loc.py` sends each flagged chunk back to Jev split into segments of about 6k characters, with one `choice` question over the segments. The drill-down agents read the top one to three segments first and widen from there, which is roughly a fifth of each chunk.

## API behaviour worth knowing

- TypeSafe's edge answers some transcript content with a 403 HTML page. Retrying doesn't help; halving the chunk usually does. 142 first attempts hit it, and 14 chunks stayed unscorable even at an eighth of their size.
- Dense code chunks can exceed the 32k-token request limit (2 chunks). Halving fixes it.
- Connection resets under load (16). The error body read can throw too, so it needs its own guard.

## Drill-down

Eight Claude agents, about 20 flagged chunks each, took 35 to 45 minutes and produced 219 findings. Merging by slug (`render_md.py`, with a hand-written alias map for near-duplicate slugs) left 115 papercuts. A second set of agents then reviewed every write-up for publication (`review_brief.md`): 97 were published, after edits to most of them, and the other 18 stay local.
