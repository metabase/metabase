---
title: search/appdb/index_test.clj contains raw NUL and control bytes, so grep treats it as binary and prints nothing, and awk editing truncates it
slug: index-test-nul-bytes-hide-from-grep
kind: codebase-trap
impact: both
severity: medium
status: open
area: test/metabase/search/appdb/index_test.clj (strip-junk-chars-test); Claude Code grep shim (-I), awk/sed edits
occurrences:
  - transcript: /Users/christruter/.claude/projects/-Users-christruter-workspace-metabase-metabase/025e8586-a280-4a50-ae6c-ed98e5b728af.jsonl
    lines: 665-677, 749-771
    date: 2026-09-20
    jev: {self_inflicted_bug: 0.91, tool_misuse: 0.95, misleading_signal: 0.76, user_correction: 0.29, codebase_trap: 0.81, flailing: 0.49, env_friction: 0.81}
---
## Summary
`strip-junk-chars-test` embeds literal NUL (0x00), BEL, BS, VT, FF and US characters in string literals. `file` reports
the whole test namespace as `data`. The Bash tool's `grep` is a ugrep shim that passes `-I` (skip binary files), so
`grep -n` and `grep -c` on this file print **nothing** and exit 1. The same happens with a fixed string that appears 18
times. An agent reads that as "the file has no such code". An awk-based insertion also silently truncated the NUL byte
in the test literal and corrupted an unrelated test.

## Symptom
```
L665 grep -rn "create-table!\|gen-table-name\|SearchIndexMetadata" test/metabase/search/appdb/index_test.clj | head -20
L666 [RESULT] (Bash completed with no output)
L668 ls test/metabase/search/appdb/; ... "=== where did index_test go? ==="
L672 wc -l ... && grep -c "create-table" ...   -> 832 (grep -c printed nothing)
L676 file test/metabase/search/appdb/index_test.clj; grep -ac "create-table" ...
L677 [RESULT] test/metabase/search/appdb/index_test.clj: data
8
```
and
```
L754 [RESULT] git diff ... | cat -v
     (testing "NUL byte (0x00) is replaced with a space ..."
-      (is (= "a b" (strip "a^@b"))))
+      (is (= "a b" (strip "a
L757 [ASSISTANT] Caught a problem: awk truncated a NUL byte in the junk-chars test. Reverting and redoing with perl.
```

## Timeline
- L665-666: grep finds nothing in a file the agent knows has orphan-table tests. It suspects the file moved ("where
  did index_test go?").
- L668-677: `ls` and `git log` confirm the file exists. `file` says `data`. `grep -a` finds 8 matches.
- L749-750: the agent inserts a new deftest with an awk script. The diff shows 19 insertions and 3 deletions instead
  of pure insertions.
- L753-757: `cat -v` shows the NUL literal cut off. The agent reverts with `git checkout` and redoes the insertion
  with `perl -i` reading the block `"<:raw"` (L767-771), which took two tries because of an env-var quoting slip.

## Root cause
The test inputs are raw control characters in the source instead of escapes such as `"a\u0000b"` or
`(str "a" (char 0) "b")`. Text tools treat NUL as end-of-string or binary.

## Why agents fall for it
Nothing about a `.clj` file suggests it is binary. The shim's `-I` hides the file silently: no "Binary file matches"
line, just empty output. Agents trust an empty grep as a negative result.

## Current state
Still present at HEAD (2026-09-23): `file test/metabase/search/appdb/index_test.clj` -> `data`. Plain
`grep -n "deftest" test/metabase/search/appdb/index_test.clj` prints nothing (rc=1). `rg -c strip` finds 18 lines.
`grep -an` shows raw NULs at lines 673, 689 and 691 (`(strip "a^@b")`, `(strip "^@a^G")`, `(strip "a^@^G^_b")`).
No memory or CLAUDE.md note mentions it.

## Suggested fix
Rewrite the literals with Clojure escapes (`"a\u0000b"`, `"\u0000a\u0007"`, `"a\u0000\u0007\u001fb"`) so the file is
plain text. Optionally add a repo check (in `mage` or a ratchet) that fails when any `.clj`/`.cljc` file contains
bytes below 0x09.

## Detection signal
- In a transcript: an empty grep on a file followed by `file ...: data` or `grep -a`.
- Static: `rg -l --binary '\x00' -g '*.clj'` over the repo.

## Raw excerpts
```
L767 perl -i -pe 'BEGIN { local $/; open my $fh, "<:raw", $ENV{"NEWTEST"} or die; $ins = <$fh>; } print $ins if $. == 643' NEWTEST=$SP/newtest.clj test/metabase/search/appdb/index_test.clj ...
L768 [RESULT] Can't open NEWTEST=/private/tmp/.../newtest.clj: No such file or directory.
L771 [RESULT]  test/metabase/search/appdb/index_test.clj | 16 ++++++++++++++++
 1 file changed, 16 insertions(+)
```
