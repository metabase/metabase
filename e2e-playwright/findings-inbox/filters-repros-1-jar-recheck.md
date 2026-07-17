# dashboard-filters-reproductions-1 — the 6 fixmes, re-checked against the CI uberjar

Open thread #3 (RESUME.md). Written incrementally as the work proceeded.

## Why this re-check exists

The 6 `test.fixme`s in `tests/dashboard-filters-reproductions-1.spec.ts` rest on
one argument: *"the original Cypress spec fails the same 6 tests at the same
assertions on the same backend, so the port is faithful and something real is
behind them."*

The first clause is fine. **The second does not follow, and has since been
falsified three times** (FINDINGS #2, #22, #24 — all retracted). Both harnesses
shared **one source-mode backend and one rspack hot bundle**, so a shared
environmental cause fails both identically while the app is fine. That is not
hypothetical: `dashboard-parameters`' field-61 test failed in *both* harnesses
on a freshly booted backend and **passes on the CI uberjar**. The original
cross-check here also ran **Electron**, predating the `--browser chrome` rule.

Decider used here: a different **artifact** — the CI EE uberjar at
`target/uberjar/metabase.jar` (COMMIT-ID `751c2a98`, run 29569211972), booted on
slot 11 / :4111 via `JAR_PATH`. Jar mode serves the jar's *static* FE assets, so
it tests BE **and** FE free of the local dev build.

## The 6 tests under test

| # | Test | Stated justification in the spec |
|---|---|---|
| 1 | `metabase#12720` — QB question on dashboard w/ filter, card without data-permission | dashcard title drill-through doesn't carry the filter value into the question URL; search string stays empty. Cypress fails identically ("expected '' to include '2029-01-01~'"). Cause not established. |
| 2 | `metabase#47172` — specific (before\|after) filter on native question w/ field filter | same describe, same claim: drill-through drops the parameter. |
| 3 | `21528` — dashboard ID filter values w/ native FK field filter | FK-remapped values ("Rustic Paper Wallet - 1") never render in the dropdown. Cypress fails identically. Cause not established. |
| 4 | `metabase#25374-1` — comma-separated values down to connected question | drill-through produces no result table (`table-header`). Cypress fails identically. |
| 5 | `metabase#25374-3` — retain comma-separated values reverting to default | same, at `cell-data`. |
| 6 | `metabase#25374-4` — retain … via "Reset all filters" | same, at `table-header`. |

Note 25374-**2**, which only reloads the dashboard rather than drilling through,
**passes**. Every other fixme in the set involves a drill-through.

## Result: all 6 pass on the CI uberjar

```
JAR_PATH=…/target/uberjar/metabase.jar PW_PER_WORKER_BACKEND=1 \
  PW_KEEP_SLOT_BACKENDS=1 PW_SLOT_OFFSET=11 PW_ACTION_TIMEOUT=30000 \
  bunx playwright test tests/dashboard-filters-reproductions-1.spec.ts \
  --grep "12720|47172|foreign key field filter|25374-1|25374-3|25374-4" --workers=1
→ 6 passed (4.0m)
```

Backend identity verified rather than assumed (the point of the exercise is the
*artifact*, so "I set JAR_PATH" is not good enough):

- process on :4111 → `java -jar /Users/fraser/…/target/uberjar/metabase.jar`
- `/api/session/properties` → `version.hash = 751c2a9`, date 2026-07-17 —
  matches `target/uberjar/COMMIT-ID` (`751c2a98`)
- `/` serves **static hashed assets** (`app/dist/app-main.2968ba045c7df524.js`),
  not the `:8080` rspack hot bundle — so the FE under test is the jar's, not the
  local dev build.

The 6 tests were changed **only** `test.fixme(` → `test(` — no assertion was
touched, so they cannot have passed vacuously; every one ends in a positive
`toBeVisible` / `toHaveText` / URL assertion.

Stable, not a one-off: **12/12 under `--repeat-each=2`** on the same jar backend.

## The control that turns this into evidence

"Passes on the jar" alone leaves an alternative open: maybe the original failure
was transient state that has since evaporated, and the jar is incidental. So the
same 6 tests were re-run on **the same slot, same box, same spec**, with the jar
backend killed and a **source-mode** backend booted in its place:

```
# jar killed, $TMPDIR/mb-pw-slot-11 wiped, no JAR_PATH → source mode
PW_PER_WORKER_BACKEND=1 PW_SLOT_OFFSET=11 … bunx playwright test … --grep …
→ 6 failed
```

Backend identity again verified, not assumed: `-Dmb.run.mode=dev`,
`version.hash = 6c67bb8`, `tag v1.0.5-SNAPSHOT`, serving
`http://localhost:8080/app/dist/*.hot.bundle.js`.

| Artifact (same slot 11, same box, same spec) | Result |
|---|---|
| CI EE uberjar `751c2a9` + jar's static FE assets | **6/6 pass**, 12/12 under `--repeat-each=2` |
| Local source-mode backend `6c67bb8` + rspack hot bundle | **6/6 fail**, at the originally-reported assertions |

The failures reproduce exactly where 2026-07-17 said they did (e.g. 25374-4 at
`getByTestId('table-header').getByText('COUNT(*)')`, element not found). So the
observation was always real — the *inference* from it was wrong. The differing
variable is the **artifact**, not the app. This is the `dashboard-parameters`
field-61 pattern (open thread #2) reproduced on a second, independent spec.

Cypress cross-check (step 3 of the brief) is **moot for all 6**: it is the
procedure for tests that still *fail* on the jar. Nothing failed. (Had any
failed, it would have needed `--browser chrome` **and** the sample-DB re-point —
the trap that produced the #22 retraction.)

## Per-test verdict — all six are (a), local-environment artifact

| # | Test | Verdict |
|---|---|---|
| 1 | `metabase#12720` | **(a)** passes on jar → re-enabled |
| 2 | `metabase#47172` | **(a)** passes on jar → re-enabled |
| 3 | `21528` FK-remapped dropdown | **(a)** passes on jar → re-enabled |
| 4 | `metabase#25374-1` | **(a)** passes on jar → re-enabled |
| 5 | `metabase#25374-3` | **(a)** passes on jar → re-enabled |
| 6 | `metabase#25374-4` | **(a)** passes on jar → re-enabled |

They were classified independently and happened to land together — which is
itself consistent, since 5 of the 6 share a drill-through and `25374-2` (reload,
no drill-through) always passed.

**No product bug here. Nothing in this spec should be cited as a migration
dividend of the "we found a real bug" kind.** The 6 fixmes are removed and the
tests run.

## What is NOT established (scope caveats — read before quoting this)

- **Root cause is not identified.** Jar mode changes *two* variables at once —
  the backend artifact and the FE bundle. This run does not isolate which.
  Thread #2's evidence (byte-equivalent backend payloads across the split)
  points at the **rspack hot bundle**, and that is the best available
  hypothesis, but it is not independently confirmed here.
- **Why the hot bundle misbehaves is unknown.** The rspack server had been up
  ~3h (started 21:58, run at ~00:55) and HEAD moved under it; PORTING.md
  already warns that long-lived `--hot` builds degrade. Suggestive, not proven —
  I did not restart rspack and re-test, which is the cheap experiment that would
  confirm or kill it.
- **Consequence of re-enabling:** these 6 now pass in CI (jar) and **fail on a
  local source-mode run**. That trade was already accepted for #24's and #22's
  re-enabled tests. Anyone running this spec locally against `--hot` should
  expect 6 red and not treat it as a regression.
- Only this branch, this jar (`751c2a98`), this box were tested.

## What would change my mind

- The 6 failing on **CI's own Playwright leg** (jar + static assets) — that
  would contradict my jar run and reopen the question.
- The 6 passing on a **freshly restarted rspack** source-mode backend — that
  would kill the "hot bundle" hypothesis and mean the original 2026-07-17
  failure was transient state, changing the caveat above (though not the
  verdict: still not a product bug).
- A **user-visible** reproduction on a released build (drill-through dropping a
  filter value would be a serious, obvious bug — nobody has shown one, and the
  jar says otherwise).

## Incidental finding — a sibling agent committed my uncommitted edit

Worth a PORTING.md gotcha; this is a sharper form of the known "parallel agents
share one worktree" hazard.

Mid-task, my working-tree edit (the 6 `test.fixme(` → `test(` flips) was
**committed by another agent** as part of `c9105405ada` *"playwright spike: land
documents-comments"* — a commit about an unrelated spec, whose diffstat
nonetheless carries `dashboard-filters-reproductions-1.spec.ts | 12 ++++----`.
The sibling evidently used `git commit -a` / `git add -A`.

Symptom to recognise: `git diff` on **your own** in-progress file comes back
**empty** and `git status` is clean, while the file on disk plainly holds your
changes. It reads as "my edit vanished" or "the tool lied"; in fact it was
committed under someone else's message.

Harmless here only by luck — the swept-up state happens to be the state this
investigation concluded was correct. Had the jar disagreed, the branch would now
carry 6 silently-un-fixme'd tests under a commit message that never mentions
them. **Agents sharing a worktree must stage explicit paths, never `-a`/`-A`.**
