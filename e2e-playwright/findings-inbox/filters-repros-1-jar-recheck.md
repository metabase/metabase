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

## Status log

- [x] Read background (RESUME #3, PORTING fidelity cross-check, FINDINGS #2/#22/#24 retractions).
- [x] Identified the 6 tests + justifications (above).
- [x] Boot jar-mode backend on slot 11 (:4111) — verified jar mode, 207s boot.
- [x] Run the 6 with fixmes lifted against the jar → **6/6 pass**.
- [ ] Stability under `--repeat-each=2`.
- [ ] Source-mode control on the same slot (does the original failure still reproduce?).
- [ ] Per-test verdict.

Cypress cross-check (step 3 of the brief) is **moot for all 6**: it is the
procedure for tests that still *fail* on the jar. Nothing failed.
