---
name: adversarial-tests
description: Adversarial testing of a PR, run locally. Ranks the risky changes, writes tests against them from the diff and, separately, blind from the PR's stated intent, runs them on the PR head and its merge-base, and reports findings and tests worth keeping. Use for /adversarial-tests (current branch) or /adversarial-tests --pr <number>.
argument-hint: "[--pr <number>]"
---

# Adversarial tests

Run adversarial tests against: $ARGUMENTS

This skill looks for bugs in a PR by writing tests that try to break it. Two generators write the tests. The diff-informed generator reads the diff and attacks the risks you name in step 4. The blind generator never sees the diff or any function body, only the PR's description, linked issues and the public surface of what changed, and writes tests the way a user or API consumer would. Both sets of tests then go through one runner and one triage step, which runs them on the PR head and on its merge-base with the base branch.

The output is a report with two lists: findings (tests that fail on the PR head and pass on the parent commit) and candidates to keep (tests that pass on the PR head and fail on the parent commit, so they pin the PR's behaviour). Folding candidates into the PR is manual in this version.

## Rules for every run

These hold for the whole run, including any agent or `claude -p` process the run starts:

- Everything stays local. No commits, pushes, PR comments, reviews, Linear posts or CI dispatches. `gh` is used only to read.
- One test process at a time on this machine. Jest always runs with `--maxWorkers=2 --testTimeout=10000`. Backend tests run through `./bin/test-agent`, one invocation at a time, and never alongside a Jest run.
- Nothing generated lands in your checkout. Tests are written into temporary worktrees, and copies are kept in the run directory as `.txt` files.
- No generator changes an assertion or an expected value because the code disagreed with it. That would turn the test into a description of whatever the code does. Step 8 says what may be repaired.

## Where things go

The run uses three locations:

| What | Where |
| --- | --- |
| Run directory: risks, context, results, test copies, report | `local/adversarial-tests/<run-id>/` at the repo root (gitignored by `/local`) |
| Worktrees at the PR head and at the merge-base | `${TMPDIR:-/tmp}/metabase-adversarial-tests/<run-id>/head` and `.../parent` |
| Sandbox for the blind generator | `${TMPDIR:-/tmp}/metabase-adversarial-tests/<run-id>/blind-sandbox` |

The worktrees live outside the repo because Jest's `testMatch` is `<rootDir>/**/*.unit.spec.*`, so a checkout nested under the repo gets crawled and its specs picked up by the next full run. For the same reason the run directory keeps test copies with a `.txt` suffix.

`<run-id>` is `YYYYMMDD-HHMMSS-pr<number>` or `YYYYMMDD-HHMMSS-<branch-name>` with slashes replaced by dashes. The run directory ends up with this layout:

```
local/adversarial-tests/<run-id>/
  context/pr.json, context/issues/*.md   what the author says, from gh
  risks.md                               the ranked risk list from step 4
  blind/context.md                       the only input the blind generator sees
  blind/prompt.md, blind/SCENARIOS.md    its prompt and its scenario list
  manifest.tsv                           every generated file: generator, path, risk or scenario
  repairs.md                             every harness repair from step 8
  runs/*.json, runs/*.txt, runs/*.tsv    raw Jest results, raw test-agent output, and summaries
  triage.tsv                             one line per test with its verdict
  tests/diff-informed/..., tests/blind/...   copies of every generated file, as .txt
  report.md
```

## Steps

### 1. Parse the arguments and create the run directory

With no arguments, the target is the current branch. With `--pr <number>`, the target is that PR's head commit, which can be someone else's PR. Set `REPO` to the repo root (`git rev-parse --show-toplevel`), pick the run id, and create `RUN_DIR=$REPO/local/adversarial-tests/<run-id>` with `context/issues/` and `runs/` inside it. Every command below runs from `$REPO`. A command that needs another directory changes into it inside a subshell, so the session's working directory stays at `$REPO`.

### 2. Set up the head and parent worktrees

For the current branch:

```bash
git fetch origin master
HEAD_SHA=$(git rev-parse HEAD)
MERGE_BASE=$(git merge-base origin/master HEAD)
git status --porcelain   # uncommitted changes are not tested; say so if this prints anything
```

For `--pr <number>`:

```bash
gh pr view <number> --repo metabase/metabase \
  --json number,title,body,url,baseRefName,headRefName,headRefOid,closingIssuesReferences,isDraft \
  > "$RUN_DIR/context/pr.json"
git fetch origin "pull/<number>/head"
HEAD_SHA=$(git rev-parse FETCH_HEAD)    # must equal .headRefOid in pr.json
BASE=$(jq -r .baseRefName "$RUN_DIR/context/pr.json")
git fetch origin "$BASE"
MERGE_BASE=$(git merge-base "origin/$BASE" "$HEAD_SHA")
```

A stacked PR has a base other than master, and its merge-base is taken against that base. Then create both worktrees and prepare them:

```bash
WT="${TMPDIR:-/tmp}/metabase-adversarial-tests/<run-id>"
git worktree add --detach --quiet "$WT/head" "$HEAD_SHA"
git worktree add --detach --quiet "$WT/parent" "$MERGE_BASE"
for side in head parent; do
  (cd "$WT/$side" && HUSKY=0 bun install --frozen-lockfile && bun run build-pure:cljs)
done
```

The install takes a few seconds with a warm cache, and the ClojureScript build about 30 seconds. Skip the build when only backend tests will run.

Each worktree gets its own install. A symlink to the main checkout's `node_modules` fails whenever the main checkout has different dependencies installed, for example when Jest cannot find `jest-circus/runner`. Use `build-pure:cljs`, not `build:cljs`, because `build:cljs` runs `bun install` without `--frozen-lockfile` first. Backend tests need no preparation.

### 3. Gather the author's intent

For a PR, `context/pr.json` already holds the title and body. When you target the current branch, look for its PR with `gh pr view --json number,title,body,url,baseRefName,closingIssuesReferences` and save it to the same path if one exists.

For each entry in `closingIssuesReferences`, and for any `#<number>` or `metabase/metabase/issues/<number>` link in the body, save the issue:

```bash
gh issue view <n> --repo metabase/metabase --json number,title,body \
  --jq '"Issue #\(.number): \(.title)\n\n\(.body)"' > "$RUN_DIR/context/issues/<n>.md"
```

`gh issue view` also returns pull requests, and a `#<number>` in a PR body is often a related PR. Skip any number whose `gh issue view <n> --json url` URL contains `/pull/`, because another PR's description says nothing about what this one intends.

For Linear issue ids in the body or branch name, match `[A-Za-z]{2,5}-[0-9]+` and uppercase the result, because branch names are usually lowercase (`sec-1343-model-metadata-positional-names`). Then run `./bin/mage -bot-fetch-issue <ID> > "$RUN_DIR/context/issues/<ID>.md"` when `LINEAR_API_KEY` is set. Without it, note in the report that the Linear issue was not read.

### 4. Name the risks

Read `reference/risk-identification.md` and follow it. It reads the diff between `MERGE_BASE` and `HEAD_SHA`, ranks each changed function, and names an oracle for every risk before any test is written. Write the result to `risks.md`. You do this step yourself, because every later step uses the risk list.

### 5. Start the blind generator

Build its context file with the script. The script reads only `context/` and the two worktrees:

```bash
.claude/skills/adversarial-tests/scripts/build-blind-context.sh "$RUN_DIR" "$WT/head" "$WT/parent"
```

Read `blind/context.md` once before you go on. Check it holds the PR text, the issues, the surfaces (signatures, prop types, endpoint schemas, with bodies shown as `{ … }` or `…`) and the harness reference, and no diff hunks or function bodies. If something leaked, fix the extractor and rebuild. Do not edit the context file by hand, because anything you add comes from a context that has seen the diff.

Then set up the sandbox and start the generator in the background:

```bash
SANDBOX="$WT/blind-sandbox"
mkdir -p "$SANDBOX/out"
cp "$RUN_DIR/blind/context.md" "$SANDBOX/context.md"
cp .claude/skills/adversarial-tests/reference/blind-generator.md "$SANDBOX/prompt.md"
cp "$SANDBOX/prompt.md" "$RUN_DIR/blind/prompt.md"
(cd "$SANDBOX" && claude -p --restricted --strict-mcp-config --tools "Read,Write" \
  --permission-mode acceptEdits --permission-prompts none \
  --model opus --no-session-persistence \
  "Read prompt.md and context.md in the current directory, then do what prompt.md says." \
  > "$RUN_DIR/blind/transcript.txt" 2>&1)
```

Blindness is enforced by what the process can reach, not by asking it to look away. `--restricted` drops Bash and every other code-running tool, ignores user and project settings, and confines the file tools to the working directory. `--strict-mcp-config` with no `--mcp-config` loads no MCP servers, so connectors such as GitHub or Linear cannot fetch the PR. `--tools "Read,Write"` leaves it nothing else. The working directory is a fresh directory outside every git checkout, so the only files it can open are `prompt.md` and `context.md`, and the only place it can write is `out/`. The context file in turn is built by a script whose extractors drop function bodies and diff hunks.

The blind generator does not run anything, so you can carry on with step 6 while it works. If the `claude` CLI is not available, run the blind generator as an Agent call whose brief is the prompt file and the context file, and state in the report that blindness was by instruction only for this run.

### 6. Write the diff-informed tests

Read `reference/diff-informed-generator.md` and write the tests yourself into the head worktree, at the paths it gives. Record each file in `manifest.tsv` with the generator name `diff-informed` and the risk ids it covers. Do not run any generated test yet, apart from the parent-commit calibration that the file describes for tests whose oracle is the parent's behaviour.

### 7. Collect the blind tests

When the `claude -p` process exits, copy `$SANDBOX/out/SCENARIOS.md` to `blind/SCENARIOS.md`. Copy each test file from `$SANDBOX/out/<repo-relative path>` into the head worktree at the same path. Every blind file must have `.adversarial-blind.` (frontend) or `_adversarial_blind_test` (backend) in its name, so rename any that do not, and fix the `ns` form to match the file name. Record each file in `manifest.tsv` with the generator name `blind` and the scenario numbers it covers.

If `out/` is empty, read the transcript, fix the cause (usually the prompt) and run the generator again once.

### 8. Run and triage

Read `reference/triage.md` and follow it. It runs every generated test on the head worktree, repairs harness errors within fixed rules, reruns each failure once to drop flakes, runs the survivors on the parent worktree, and gives every test one verdict in `triage.tsv`.

Frontend runs go one process at a time, with `<side>` either `head` or `parent`:

```bash
(cd "$WT/<side>" && bun run test-unit-keep-cljs --ci --reporters=default --maxWorkers=2 --testTimeout=10000 \
  --json --outputFile="$RUN_DIR/runs/<label>.json" --runTestsByPath <spec> [<spec> ...])
node .claude/skills/adversarial-tests/scripts/jest-summary.mjs "$RUN_DIR/runs/<label>.json" "$WT/<side>" \
  > "$RUN_DIR/runs/<label>.tsv"
```

`--reporters=default` keeps `jest-junit` from writing `junit.xml` into the worktree, and `--ci` stops Jest from writing snapshot files. Paths go after `--runTestsByPath`, because a bare path can be swallowed by the script's `--ignoreProjects` flag and start a much wider run.

Backend runs also go one process at a time:

```bash
(cd "$WT/<side>" && ./bin/test-agent :only '[metabase.foo.bar-adversarial-diff-test metabase.foo.bar-adversarial-blind-test]') \
  > "$RUN_DIR/runs/<label>.txt" 2>&1
(cd "${TMPDIR:-/tmp}" && bb "$REPO/.claude/skills/adversarial-tests/scripts/test-agent-summary.bb" \
  "$RUN_DIR/runs/<label>.txt" "$WT/<side>" <test file> [<test file> ...]) > "$RUN_DIR/runs/<label>.tsv"
```

`:only` takes namespaces, or `<namespace>/<test name>` to pick single tests. The summary prints one line per selected `deftest` with status `PASSED`, `FAILED`, `ERROR` (the test threw) or `LOAD_ERROR`, and skips the Liquibase `Running Changeset:` lines that make up most of the output. Hawk loads every namespace before it runs any test, so one generated file that does not compile stops the whole run, and every test then shows `LOAD_ERROR`. The last column of a `LOAD_ERROR` line quotes the compiler error, which names the file and line. `bb` runs from `$TMPDIR` because the repo's `bb.edn` would make it resolve the project's dependencies first. In a fresh worktree one invocation took about 70 seconds.

A running REPL is attached to one checkout, so it cannot run the parent commit's code. Use `./bin/test-agent` in both worktrees, so both sides run the same way.

### 9. Report and clean up

Fill in `reference/report-template.md` and write it to `report.md`. Then:

1. Copy every generated file to `tests/<generator>/<repo-relative path>.txt`.
2. Remove both worktrees with `git worktree remove --force <path>`, then run `git worktree prune`.
3. Delete the sandbox directory.
4. Run `git status --porcelain --untracked-files=all` in your checkout. Nothing outside `local/` may show up from this run.

Tell the user where `report.md` is, give the count table, and list the findings in one line each. If a finding looks like a real bug, say so plainly and give the repro. Do not tell the PR author or post anything, because that decision belongs to the person who ran the skill.
