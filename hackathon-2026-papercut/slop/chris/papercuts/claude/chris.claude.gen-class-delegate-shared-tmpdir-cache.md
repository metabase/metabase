---
title: Quartz secure-delegate gen-class is compiled into one fixed java.io.tmpdir folder shared by every checkout; moving the namespace loads a stale class
slug: gen-class-delegate-shared-tmpdir-cache
kind: codebase-trap
impact: wasted-time
severity: medium
status: open
area: src/metabase/task/secure_delegate.clj (dev-compile-delegate!), Quartz DriverDelegate shims, dev/test classpath
occurrences:
  - transcript: /Users/christruter/.claude/projects/-Users-christruter-workspace-metabase-metabase-nested-modules-infrastructure-master/89a35c24-7164-4f4d-a95a-33b5cdfde927.jsonl
    lines: 4927-5013
    date: 2026-09-17
    jev: {self_inflicted_bug: 0.91, tool_misuse: 0.94, misleading_signal: 0.66, user_correction: 0.63, codebase_trap: 0.76, flailing: 0.27, env_friction: 0.87}
---
## Summary
In dev and test, `metabase.task.secure-delegate/dev-compile-delegate!` AOT-compiles the gen-class Quartz
delegates (`metabase.task.SecureStdDelegate`, `metabase.task.SecurePostgresDelegate`) into
`(System/getProperty "java.io.tmpdir")/mb-quartz-secure-delegate` and adds that folder to the classpath.
The folder name is fixed. It does not depend on the checkout, the branch, or a hash of the source. Every
worktree on the machine shares it, and it survives JVM restarts. When an agent moved the namespaces
(`metabase.task.secure-delegate` → `metabase.task.secure-delegate.core`, `-std` → `.std`) and kept the
Java class names, the tests loaded the stale `SecureStdDelegate.class` from the shared folder. That
class's static initializer tries to load the old namespace `metabase.task.secure_delegate__init`, which
no longer exists.

## Symptom
A cold `./bin/test-agent` run fails with an error that points at the classpath, not at the cache:
```
ERROR in metabase.task.secure-delegate.core-test/getObjectFromBlob-reads-through-allow-list-test (Class.java:-2)
java.lang.ExceptionInInitializerError:
  java.io.FileNotFoundException: Could not locate metabase/task/secure_delegate__init.class,
  metabase/task/secure_delegate.clj or metabase/task/secure_delegate.cljc on classpath.
...
java.lang.NoClassDefFoundError: Could not initialize class metabase.task.SecurePostgresDelegate
7 assertions, 0 failures, 3 errors.
```

## Timeline
- L4910 user: "i think it belongs in task still - but maybe it can be its own submodule?"
- L4927-4935 agent checks AOT build config (deps.edn:679 comment on the gen-class shims) and concludes "Moving files is safe since the build AOT-compiles every namespace and Java class names remain fixed via `:gen-class :name`."
- L4936-4950 `git mv` of the three namespaces and a perl rename of requires.
- L4988 `./bin/test-agent :only '[metabase.task.secure-delegate.core-test]'` → 3 errors.
- L4990 agent lists `/var/folders/*/*/T/mb-quartz-secure-delegate/metabase/task`: it finds `SecurePostgresDelegate.class`, `SecureStdDelegate.class` and many `secure_delegate_postgres$fn__NNNN.class` files from earlier runs.
- L4994 THINKING: "The test errors stem from stale cached classes in the shared dev compile cache — the old `SecureStdDelegate` still points to the outdated namespace. I'll rename the classes so they compile fresh."
- L4995-5008 agent renames the Java classes to `metabase.task.secure_delegate.Secure{Std,Postgres}Delegate`, and the tests pass (12 assertions).
- L5012 commit message and PR text explain the rename: "a class compiled from source under the old name would still point at the old namespace."

## Root cause
`dev-compile-delegate!` writes to a fixed, machine-global folder, and `compile` only writes what it is asked
to compile. Old `.class` files from other branches or worktrees stay in the folder and are first on that
classpath entry. The class name is the only key. When the class name stays the same and its backing
namespace changes, the stale class wins.

## Why agents fall for it
- The AOT build is the documented path, and it is correct. Nothing near the gen-class names or the
  move mentions the dev-time cache.
- The error names the old namespace file, so it looks like a leftover `require` in the source, not a
  class cache.
- The folder is outside the repo (`$TMPDIR`), so `git status`, `git clean` and a fresh worktree do not
  reset it.
- Two worktrees on different branches can also shadow each other's delegate classes. The same trap
  applies without any rename.

## Current state
Still present on master: `src/metabase/task/secure_delegate.clj:76`
`(let [dir (io/file (System/getProperty "java.io.tmpdir") "mb-quartz-secure-delegate")] ...)`. The
class names are still `metabase.task.SecureStdDelegate` / `SecurePostgresDelegate`
(`secure_delegate.clj:61-62`, `secure_delegate_std.clj:6`). The rename to the `metabase.task.secure_delegate`
package was on branch `untangle-util-knots` (#77954) only. No CLAUDE.md, skill or memory mentions the
folder.

## Suggested fix
- Key the folder on the checkout or on a hash of the delegate sources, e.g.
  `mb-quartz-secure-delegate/<sha1 of project root + source contents>`. Or clear the folder in
  `dev-compile-delegate!` before `compile`.
- Or compile into a `target/`-style folder inside the repo, so a clean worktree is really clean.
- Add a docstring line: "classes compiled here persist across JVMs and checkouts".

## Detection signal
- `ExceptionInInitializerError` / `Could not locate <ns>__init.class` for a namespace that was just
  renamed, in a test that touches a `gen-class`.
- A tool call that lists `$TMPDIR/mb-quartz-secure-delegate`.
- A lint or test could assert that every `:gen-class :name` maps to its current `:ns` (the `delegate`
  map in `secure_delegate.clj`). That catches a rename that forgets the class side.

## Raw excerpts
```
L4990 [TOOL Bash] ./bin/test-agent :only '[metabase.task.secure-delegate.core-test]' 2>&1 | grep -A12 "^ERROR" | head -30; ls /var/folders/*/*/T/mb-quartz-secure-delegate/metabase/task 2>/dev/null | head; echo $TMPDIR
L4991 [RESULT] ... java.lang.ExceptionInInitializerError:
        java.io.FileNotFoundException: Could not locate metabase/task/secure_delegate__init.class, ...
       java.lang.NoClassDefFoundError: Could not initialize class metabase.task.SecurePostgresDelegate
SecurePostgresDelegate.class
SecureStdDelegate.class
secure_delegate
secure_delegate_postgres$_getObjectFromBlob.class
secure_delegate_postgres$fn__263370.class ...
/var/folders/hv/wl60kh8j3g7flrsw648cfy_00000gn/T/
L4995 perl -pi -e 's/metabase\.task\.Secure(Std|Postgres)Delegate/metabase.task.secure_delegate.Secure$1Delegate/g' ...
L5008 [RESULT] 12 assertions, 0 failures, 0 errors.
```
Current source (src/metabase/task/secure_delegate.clj:70-80):
```clojure
  "SOURCE-ONLY. Compile the gen-class `ns-sym` to a temp dir and add that dir to the classpath so
  `the-classloader` can find the class by name. ..."
  [ns-sym]
  (assert (not (config/jar?)) "dev-compile-delegate! must not run from a jar")
  (let [dir (io/file (System/getProperty "java.io.tmpdir") "mb-quartz-secure-delegate")]
    (.mkdirs dir)
    (classloader/add-url-to-classpath! ^URL (-> dir .toURI .toURL))
    (binding [*compile-path* (str dir)]
      (compile ns-sym))))
```
