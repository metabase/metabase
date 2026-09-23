---
title: `vector-strategy-matrix-test/distance-recall-matrix-test` asserts a naive HNSW query returns exactly `[]` ("structural, not graph luck"), but HNSW is approximate and returned a rare-band doc, failing semantic-search CI on an unrelated PR
slug: semantic-search-hnsw-recall-test-asserts-exact-empty
kind: test-harness
impact: wasted-time
severity: low
status: open # assertion and comment unchanged on origin/master
area: enterprise/backend/test/metabase_enterprise/semantic_search/vector_strategy_matrix_test.clj (line ~397)
occurrences:
  - transcript: ~/.claude/projects/-Users-andrei-src-mb/c9e08d36-c34d-4cc5-8d80-81c8c80b1f99.jsonl
    lines: 1665-1709
    date: 2026-09-11
    jev: {any_papercut: 0.88, env_toolchain: 0.89, stale_state: 0.34, verify_mismatch: 0.88, misleading_code: 0.18, hidden_coupling: 0.50, stale_docs: 0.29, tool_footgun: 0.78, flaky: 0.95, agent_bug: 0.84, wasted_effort: 0.38, user_correction: 0.35}
---
## Summary
The pgvector semantic-search job failed on a PR that only touched the Slack bot. The failing assertion expects the naive `:hnsw` strategy with an adversarial filter to find nothing, with a comment calling that "structural, not graph luck"; the run returned `[276]`, a doc from the rare band the test itself places at distance ranks 269-280. Master was green on eight recent commits and a rerun passed.

## Symptom
L1690: "asserting `expected: []` but getting `[276]`"; L1697 quotes the test and its "structural, not graph luck" comment.

## Timeline
- L1665: failing job identified.
- L1669-L1686: log download, JUnit summary and ci-conductor line locate the test.
- L1690-L1705: reads the assertion, checks master (green on 8 commits).
- L1709: verdict flake, rerun.
- Cost: about eight calls and a rerun, with the user asking whether master was broken.

## Root cause
The test assumes the naive HNSW top-k pool can never include a rare-band document; HNSW recall depends on graph build order and parallelism, so the pool is not deterministic.

## Why agents fall for it
The comment asserts determinism, so a failure reads as a real regression that needs chasing.

## Current state
origin/master vector_strategy_matrix_test.clj:397-398: `(testing "naive :hnsw post-filters the same global pool, so the adversarial filter finds nothing"` / `;; structural, not graph luck: …`; last changes predate this session.

## Suggested fix
- Assert a bound (for example at most N rare-band ids) or build the index deterministically for this case; drop the "not graph luck" claim.

## Detection signal
`distance-recall-matrix-test` failing with `expected: []` and a non-empty id list.
