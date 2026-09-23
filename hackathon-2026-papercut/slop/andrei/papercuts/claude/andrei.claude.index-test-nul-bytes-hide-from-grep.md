---
title: `test/metabase/search/appdb/index_test.clj` contains NUL and control bytes, so the agent shell's grep prints nothing for it (even `grep -c ''`), and an agent resolving a backport concluded the cherry-picked test was missing
slug: index-test-nul-bytes-hide-from-grep
kind: codebase-trap
impact: wasted-time
severity: medium
status: open # the file on master still has 3 NUL bytes and 11 other control characters
area: test/metabase/search/appdb/index_test.clj; the Bash tool's grep shell function
occurrences:
  - transcript: ~/.claude/projects/-Users-andrei-src-mb/43c18504-de2f-4b9e-999c-99fbc7a01bbc.jsonl
    lines: 76-476
    date: 2026-09-04
    jev: {any_papercut: 0.78, env_toolchain: 0.86, stale_state: 0.29, verify_mismatch: 0.62, misleading_code: 0.20, hidden_coupling: 0.39, stale_docs: 0.38, tool_footgun: 0.66, flaky: 0.90, agent_bug: 0.70, wasted_effort: 0.33, user_correction: 0.08}
---
## Summary
Twice in one session bare `grep` returned nothing for `index_test.clj`. First, while addressing review comments, `grep -n 'delete-obsolete-tables' index_test.clj` and `grep -c 'obsolete'` printed nothing although `git grep` found four call sites (L81-L88). Later, resolving a backport, `grep -n 'deftest failed-reindex-drops-orphaned-tables-test'` printed nothing for the 63 worktree, and the agent set out to find why the new test was missing from the 63 working file (L457) until `type grep` and `/usr/bin/grep` showed the test at line 623 and conflict markers at 811-834, with `file` reporting the test file as `data` (L475-L476).

## Symptom
L88: `grep -c 'obsolete' test/metabase/search/appdb/index_test.clj` printed an empty line while `git grep` on the same file listed four matches. L476: `grep is a shell function from ~/.claude/shell-snapshots/...`, `/usr/bin/grep` finds line 623 and markers at 811/834, `file`: `data`.

## Timeline
- L76-L77: first lookup also trips a zsh glob error; L81-L82: bare grep empty.
- L87-L88: `git grep` finds the four call sites; bare `grep -c` still empty.
- L450-L451: in the 63 backport worktree, bare grep shows no new test.
- L457-L470: agent sets out to find why the test is 'missing'; more empty greps, `grep -c ''` empty.
- L475-L476: `type grep`, `/usr/bin/grep` and `file` reveal the cause.
- Cost: about 8 tool calls in two episodes and a near-miss on re-adding a test that was already there.

## Root cause
The test file embeds raw NUL and control characters (checked on master: 3 NULs, 11 other control characters), so grep implementations treat it as binary; the Bash tool's grep shell function then prints nothing and exits 0 instead of 'Binary file matches'.

## Why agents fall for it
An empty grep result looks like 'not present', especially mid-conflict resolution where a missing hunk is plausible, and nothing flags the file as binary unless the agent runs `file`.

## Current state
Checked origin/master: `index_test.clj` still contains 3 NUL bytes and 11 other control characters.

## Suggested fix
- Replace the raw bytes in the test with escaped string literals (`\u0000`, `(char 7)`) so the file is plain text.
- Add a lint that rejects NUL bytes in source and test files.
- Make the grep shim fall back to `-a` or print 'binary file' instead of empty output.

## Detection signal
Bare `grep` on index_test.clj returning nothing while `git grep` or `/usr/bin/grep -a` matches; `file` reporting a .clj as `data`.

## Raw excerpts
```
L81 [CALL] Bash: grep -n 'delete-obsolete-tables' test/metabase/search/appdb/index_test.clj; echo ---OTHER---; grep -rn 'delete-obsolete-tables' test enterprise -l; echo ---HELPERS---; grep -rn 'defma
L82 [RESULT] ---OTHER---
    ---HELPERS---
L87 [CALL] Bash: git grep -n 'delete-obsolete-tables' HEAD -- test | cat; echo ---WC---; wc -l test/metabase/search/appdb/index_test.clj; grep -c 'obsolete' test/metabase/search/appdb/index_test.clj; 
L88 [RESULT] HEAD:test/metabase/search/appdb/index_test.clj:589:          (#'search.index/delete-obsolete-tables!))))))
    HEAD:test/metabase/search/appdb/index_test.clj:621:          (#'search.index/delete-obsolete-tables!))))))
    HEAD:test/metabase/search/appdb/index_test.clj:641:          (search.index/delete-obsolete-tables!))))))
    HEAD:test/metabase/search/appdb/index_test.clj:810:          (#'search.index/dele [...4188 chars...] pace         (if (symbol? a-namespace)
L475 [CALL] Bash: type grep; /usr/bin/grep -c '' test/metabase/search/appdb/index_test.clj; echo "rc=$?"; /usr/bin/grep -n '<<<<<<<\|>>>>>>>\|failed-reindex-drops' test/metabase/search/appdb/index_test.clj; echo "rc=$?"; wc -l tes
L476 [RESULT] grep is a shell function from ~/.claude/shell-snapshots/snapshot-zsh-1788555973073-ak4msp.sh
    834
    rc=0
    623:(deftest failed-reindex-drops-orphaned-tables-test
    811:<<<<<<< HEAD
    834:>>>>>>> 70a3d8cb4a7 (<ticket>: sweep orphaned search index tables when a reindex starts (#81944))
    rc=0
         834 test/metabase/search/appdb/index_test.clj
```

## Additional occurrence
- transcript: ~/.claude/projects/-Users-andrei-src-mb/8c776c72-ae8d-4ded-9d94-9661894ad0b6/subagents/agent-ac3e6b2d811e099e8.jsonl
  lines: 54-91
  date: 2026-09-04
  jev: {any_papercut: 0.92, env_toolchain: 0.95, stale_state: 0.57, verify_mismatch: 0.82, misleading_code: 0.36, hidden_coupling: 0.68, stale_docs: 0.25, tool_footgun: 0.89, flaky: 0.54, agent_bug: 0.52, wasted_effort: 0.80, user_correction: 0.06}

- L55: `--- deftests ---` and nothing else; L65: `809 test/metabase/search/appdb/index_test.clj` then `--- relevant terms ---` with no matches.

- L54-L55: `grep -n "^(deftest" $F` and a helper-name grep print nothing.
- L64-L65: re-run with `wc -l` and `grep -c`: file has 809 lines, grep prints nothing.
- L71-L73: `type grep` shows a shell function; `command grep` lists the deftests.
- L91: the NUL byte is identified as the cause; the edit is done with a binary-safe splice.
- Cost: 3 wasted calls and a detour into release-branch diffs based on the empty result.

```
L54 [CALL] Bash: cd ~/src/mb/metabase && F=test/metabase/search/appdb/index_test.clj && echo "--- deftests ---" && grep -n "^(deftest" $F && echo "--- relevant terms ---" && grep -n "mocking-tables\|maybe-create-pending\|..." $F
L55 [RESULT] --- deftests ---
L65 [RESULT] 809 test/metabase/search/appdb/index_test.clj | --- relevant terms ---
L72 [CALL] Bash: cd ~/src/mb/metabase && type grep; alias grep 2>/dev/null; ... command grep -n "deftest" $F | head -60; ...
L73 [RESULT] grep is a shell function from ~/.claude/shell-snapshots/snapshot-zsh-...sh | GREP_OPTIONS= | --- deftests --- | 69:(deftest idempotent-test | 76:(deftest incremental-update-test ...
```
