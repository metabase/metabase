---
name: metabase-data-app-migrate
description: Migrate an existing Metabase data app that Metabase marks Outdated (its `data_app.yaml` `version` is below the data-app contract version the installed skills and SDK target) to the current version, one upgrade at a time, with a resumable procedure. Use when Metabase shows an app as Outdated, `npm run typecheck` or `npm run build` fails after an SDK upgrade, or an existing app's `version` is behind the one the installed skills target. Not for creating an app.
---

# Migrate a data app to the current contract version

A data app declares the contract version its code targets in `data_app.yaml`
(`version: N`; a manifest without the field is version 1). Metabase bumps the
version it serves only on a breaking change to that contract: the
`@metabase/embedding-sdk-react/data-app` API, the bundle factory, the manifest,
the `queries/` and `actions/` conventions, or what an app may declare. An app on
an older version is marked _Outdated_ in the admin list, hidden from every other
user, and refuses to open until it is migrated.

Migration is a walk over **upgrades**: `N -> N+1 -> ... -> M`, one upgrade at a time,
each described by a guide in `references/upgrades/`. Nothing is skipped and nothing
is remembered between sessions: the app's own files and git history carry all
the state.

## Four invariants

Every step below follows from these. Never break them.

1. **`version` is written last.** An upgrade's `version: N+1` goes into
   `data_app.yaml` only after every check of that upgrade passes.
2. **One commit per upgrade, locally.** Push only after the final gates at the
   target version pass. The version line never moves by more than one per commit.
3. **Compiler and build gates run only at the target version.** The installed
   SDK is the target, so an app halfway through several upgrades cannot type-check
   or build. Do not run them earlier and do not "fix" their failures earlier.
4. **Nothing generated is edited by hand.** `savedQuestionSourceId`,
   `copiedActionId`, `resources_metadata.json`, and `dist/` are written by
   `npm run build` (`sync-resources`), never by you.

## Step 0 - Locate the app and read its state

Work from the app directory, `<repo>/data_apps/<slug>/`. Resolve the repo root
with `ROOT="$(git rev-parse --show-toplevel)"`. The final build needs the
repo-root `.env.local` credentials (`DATA_APP_MB_URL`, `DATA_APP_MB_API_KEY`).
Check them by sourcing the file in a subshell and printing only whether both are
set; never print the file or its variables.

Read three numbers:

```bash
# version committed at HEAD (absent line means 1)
git show HEAD:data_apps/<slug>/data_app.yaml | grep -E '^version:' || echo "version: 1"
# version in the working tree
grep -E '^version:' data_app.yaml || echo "version: 1"
# target: the highest upgrade guide shipped with this skill (no guides means 1)
ls <skill-dir>/references/upgrades/ | grep -E '^v[0-9]+-to-v[0-9]+\.md$' | sed -E 's/.*-to-v([0-9]+)\.md/\1/' | sort -n | tail -1
```

`<skill-dir>` is the directory this SKILL.md was loaded from. The target must
equal the `version:` in the data-app scaffolding template installed alongside
this skill (`<skills-dir>/*/template/data_app.yaml`), when one is present; if
they differ, the skills come from different Metabase releases. **Stop** and tell
the user to reinstall all data-app skills with the command shown under
Admin > Data apps. Wait for the answer.

Then decide:

| HEAD version  | working tree                   | do                                                                                                                                                                                                                                |
| ------------- | ------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| equals target | clean                          | Nothing to migrate. Say so; run the final gates only if the user asked to verify.                                                                                                                                                 |
| above target  | any                            | **Stop.** There is no downgrade. Either Metabase, the SDK, and the skills are older than the app, or a bump was committed against the wrong instance (`git log -- data_apps/<slug>/data_app.yaml` shows it). Wait for the answer. |
| below target  | clean                          | Start at _Step 1_.                                                                                                                                                                                                                |
| any           | dirty under `data_apps/<slug>` | A previous session was interrupted. Go to _Resuming_ first.                                                                                                                                                                       |

## Step 1 - Preflight, once

1. Install the SDK that matches the target Metabase release
   (`npm install @metabase/embedding-sdk-react@<tag>`); each upgrade guide names
   the dist-tag it was written against. The lockfile change is committed with
   the final upgrade.
2. Confirm the app is template-shaped at its current version: `vite.config.ts`
   is the one-liner `export default dataAppConfig()` and `src/index.tsx`
   default-exports a `DataAppFactory`. If not, **Stop**: this is not a version
   migration but structural drift. Offer to scaffold a fresh app under the same
   slug (a separate task: use skill discovery for creating a data app) and port
   `src/`, `queries/`, and `actions/` over, or to proceed at the user's risk.
   Wait for the answer.
3. Read every upgrade guide from the current version to the target before editing
   anything, so a later upgrade cannot surprise you halfway through an earlier one.

## Step 2 - The upgrade loop

For each `N` from the HEAD version up to `target - 1`:

1. Open `references/upgrades/v<N>-to-v<N+1>.md` and run its _Preconditions_.
2. Apply the guide's _Steps_ in order. Each step is mechanical and ends with a
   **Done when** command. Run the command first: if it already passes, skip the
   step; if not, apply the edit and run it again. A step's command is the only
   proof it happened; never mark a step done by reading.
3. Apply the _Instance steps_, if any. Their **Done when** is an API response
   from the connected Metabase, fetched with the credentials from `.env.local`:
   ```bash
   ( source "$ROOT/.env.local"; curl -s -H "x-api-key: $DATA_APP_MB_API_KEY" "$DATA_APP_MB_URL/api/apps/<slug>" )
   ```
4. Run the guide's _Done-check summary_. Every line must print `ok`.
5. Only now set `version: N+1` in `data_app.yaml`. This is the one edit to that line.
6. If `N+1 < target`: from the repo root,
   `git add data_apps/<slug> && git commit -m "Migrate <slug> data app to data-app version N+1"`.
   No push, no typecheck, no build. If the user asks why, say the app cannot
   compile until the last upgrade.
7. If `N+1 == target`: run _Step 3_ before committing.

Do not batch steps across upgrades. Do not touch `version` before item 5.

## Step 3 - Final gates, at the target version only

1. `npm run typecheck`. Fix failures inside the app's own source. A failure that
   names an SDK symbol no upgrade guide mentions is a gap in the guides, not a user
   problem: surface the exact error, say which guide should have covered it, and
   stop. Otherwise, at most three fix rounds, then stop and ask.
2. `npm run build`. It runs `sync-resources` and refuses to bundle when
   definitions and `resources_metadata.json` disagree; follow its message.
3. `npm run dev`, open `http://localhost:5174`, then read the diagnostics feed
   once:
   ```bash
   curl -s "http://localhost:5174/__data-app/diagnostics?startEventId=0"
   ```
   Expect `clients: 1` and no entry with `"alert": true`. `clients: 0` means no
   preview tab is open, so an empty feed proves nothing.
4. `git status` from the repo root must show only: the upgrade edits,
   `data_app.yaml`, the built bundle, `resources_metadata.json` if resources
   changed, and the package lockfile if the SDK was re-pinned. Anything else
   inside the app directory is a user edit; say so before committing.
5. Commit `"Migrate <slug> data app to data-app version M"`, push, and tell the
   user to **Pull changes** under Admin > Data apps.
6. Prove it. After the pull:
   ```bash
   ( source "$ROOT/.env.local"; curl -s -H "x-api-key: $DATA_APP_MB_API_KEY" "$DATA_APP_MB_URL/api/apps/<slug>" )
   ```
   must show `"version": M`, `"outdated": false`, and `"sync_error": null`.
   Report the command and the result. Do not claim the migration is done
   without it.

## Resuming an interrupted migration

A fresh session has no memory of the previous one and needs none. Read the
three numbers from _Step 0_ and `git status --porcelain -- data_apps/<slug>`,
then:

| tree  | working-tree version              | meaning                                                                                                          | do                                                                                                                                                                       |
| ----- | --------------------------------- | ---------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| clean | equals HEAD                       | every finished upgrade is a commit; nothing half done                                                            | continue the loop from the HEAD version                                                                                                                                  |
| dirty | equals HEAD                       | upgrade `HEAD -> HEAD+1` was in progress and its checks had not all passed                                       | re-run every **Done when** of that upgrade; apply only the steps whose command fails; continue from loop item 4                                                          |
| dirty | equals HEAD + 1                   | all checks passed and the bump was written, but the commit is missing (or the final gates failed after the bump) | re-run that upgrade's _Done-check summary_ (all `ok`, or someone edited after the bump: stop and show `git diff`); if it is the target, run the final gates; commit      |
| any   | more than HEAD + 1, or below HEAD | an invariant was broken                                                                                          | **Stop.** Show `git diff -- data_apps/<slug>/data_app.yaml` and ask whether to take that one file back to HEAD and re-derive, or to stash the tree. Wait for the answer. |

Files dirty outside `data_apps/<slug>` are not yours: never `git add` them.

## Reporting

One line per upgrade, in order: `v1 -> v2: done (commit abc1234)` or
`v2 -> v3: blocked - <the exact Done-when command that fails and its output>`.
Never soften a failing check. Keep `tsc` output grouped by root cause with a
few representative diagnostics rather than pasting it whole.

## Never do

- Set or edit `version` before the upgrade's checks pass, or by more than one at a time.
- Skip an upgrade, or apply two upgrades' steps at once.
- Run `npm run typecheck` or `npm run build` before the last upgrade, or push before the final gates pass.
- Hand-edit `savedQuestionSourceId`, `copiedActionId`, `resources_metadata.json`, or `dist/`.
- Copy a step's outcome from the previous session's chat instead of re-running its **Done when**.
- Migrate with a checklist of your own when an upgrade guide exists; when one does not exist for an upgrade you need, stop and say so.

## Upgrade guides

Guides live in `references/upgrades/`, one per upgrade, named `v<N>-to-v<N+1>.md`. They
are written by Metabase when the contract version is bumped, from the template
in `references/upgrade-guide-template.md`; `references/maintainer-checklist.md`
describes that process. A missing guide for an upgrade you need is a bug in the
skill install, not something to improvise around.
