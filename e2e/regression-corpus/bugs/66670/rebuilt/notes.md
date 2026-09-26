# 66670: reverting a dashboard keeps filter sources that point at dead questions

Status: live. Base `8317274709c`. Oracle on master, shipped with the fix.

## Where the code is now
Same file as July: `src/metabase/revisions/impl/dashboard.clj`, in `revert-to-revision! :model/Dashboard`. `clean-invalid-parameter-card-references` still exists, but two later changes broke July's inverse patch: #81824 moved its query into `revisions.db/active-card-ids`, and #80003 added `queries/check-new-parameter-source-card-permissions` inside the same `let`, fed with `cleaned-parameters`.

## The mutant
Deletes the one binding that puts the cleaned parameters back on the dashboard: `serialized-dashboard (assoc serialized-dashboard :parameters cleaned-parameters)`. The cleaning still runs and the permission check still sees the cleaned list, but the default revert now writes the revision's raw parameters. That is exactly the pre-fix write: a parameter whose `values_source_config.card_id` points at an archived or deleted card goes back onto the dashboard unchanged. In the e2e steps, question B is in the trash at revert time and permanently deleted afterwards; the dashboard JSON keeps `card_id` B and the next save returns a 500.

Making the whole cleaning function a no-op was avoided, because the permission check would then see raw parameters and a deleted card would 404 during the revert itself, a different symptom from the pre-fix code.

## Oracle
`metabase.revisions.impl.dashboard-test/revert-dashboard-with-archived-parameter-card-source-test`, run with the `-deleted-` sibling via `./bin/test-agent :only`.

Clean: 2 tests, 11 assertions, 0 failures, 0 errors. Mutant: `FAIL ... (dashboard_test.clj:760) expected: (nil? (:values_source_type archived-source-param)) actual: (not (nil? :card))`, plus line 761 on `:values_source_config`; the `-deleted-` sibling errors with an FK violation on `FK_PARAMETER_CARD_REF_CARD_ID`. Same 2 failures and 1 error July recorded.

## Adversarial check
The archived test fails on assertions, not a crash: the revert completes and the test reads back the stored parameters. An archived card still exists, so the parameter_card insert has no FK problem and the permission check (as crowberto) passes. The `-deleted-` sibling is not usable as the oracle: the FK rejects the insert, so it errors instead of failing. The oracle is the exact user path from the e2e (archived at revert time, deleted later).

## Variants
1. `revisions.db/active-card-ids` drops `[:= :archived false]`: **kill**.
2. Cleaning dissocs only `:values_source_config`: **kill** at line 760.
3. Permission check moved before the cleaning, on raw parameters: **survive** (admin can read the archived card; the deleted sibling 404s instead of asserting).

## Gotchas
- The fix-era test name tags `metabase#UXW-2494`, not 66670.
- `(:parameters serialized-dashboard)` inside the `let` is already the cleaned list because of shadowing; a variant using it is equivalent.
- A test-agent run takes about a minute; most of the 42 minutes went to waiting for other agents' JVMs.
