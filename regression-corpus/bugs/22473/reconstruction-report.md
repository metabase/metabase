# Reconstruction report — metabase#22473

_Verbatim final report from the worktree-isolated reconstruction agent (ad6853de11589aa56)._

---

Working tree is clean. Here's the full reconstruction report.

## Summary: `reconstruction_failed`

**Bug:** metabase#22473 / fix commit `d02fef97bbd2af0fe2a5e41af4077b107fa73a39` ("Show all subscriptions on /account/notifications page")
**Product file:** `/Users/fraser/Documents/code/metabase/.claude/worktrees/agent-ad6853de11589aa56/src/metabase/pulse/api/pulse.clj` (was `src/metabase/api/pulse.clj` at the time of the commit; the file moved but the logic is intact)

### (1) git diff
None — I reverted all edits after determining no valid oracle exists. (Working tree is clean, verified via `git status --short`.)

### (2) Oracle resolution
- Test namespace today: `metabase.pulse.api.pulse-test` (moved from `test/metabase/api/pulse_test.clj`), file `/Users/fraser/Documents/code/metabase/.claude/worktrees/agent-ad6853de11589aa56/test/metabase/pulse/api/pulse_test.clj`
- Both `list-test` (line 868) and `get-pulse-test` (line 960) are modified (not new) deftests carrying fix-added assertions.
- Localized the fix in `api/pulse.clj` to one seam: the addition of `maybe-strip-sensitive-metadata` (dissoc `:cards` / channel `:recipients` when the user lacks full collection-read perms but can still read the pulse as creator/recipient). Everything else in that commit's diff is either a pure rename (`filter-pulses-recipients` → `maybe-filter-pulses-recipients`) or a refactor with identical runtime effect (`api/read-check` → `let-404` + `check-403`, both gated on `mi/can-read?`).

### (3) Why neither test discriminates on this file, after empirical verification (debug prints via `./bin/test-agent`, then reverted)

**`list-test`** — the only assertions that actually exercise `maybe-strip-sensitive-metadata` are in the newly-added block:
```clojure
(with-pulses-in-nonreadable-collection! [pulse-3]
  (testing "... cards and recipients are not included in results ..."
    (let [result (-> (mt/user-http-request :rasta :get 200 "pulse?creator_or_recipient=true")
                     (filter-pulse-results :id #{pulse-3-id})
                     first)]
      (is (nil? (:cards result)))
      (is (nil? (get-in result [:channels 0 :recipients]))))))
```
This block is a **sibling** of the preceding `(with-pulses-in-writeable-collection! [pulse-1 pulse-2 pulse-3] ...)` block, both inside the same outer `mt/with-temp`. I instrumented both the endpoint and the test with `println` and confirmed: by the time this block runs, `pulse-3` (and in fact all three pulses) no longer exist in the DB — `(t2/select-one :model/Pulse :id pulse-3-id)` returns `nil`, and the endpoint's own `retrieve-pulses` call returns `()`. This happens because `with-pulses-in-writeable-collection!` points all three pulses at one temp `Collection`, and when that collection is torn down at the end of the sibling block, the FK from `pulse.collection_id` cascade-deletes the pulses that still reference it. So `result` is always `nil`, and `(is (nil? (:cards result)))` / `(is (nil? (get-in result [:channels 0 :recipients])))` pass **vacuously** — true on unmodified HEAD, and still true after fully neutering `maybe-strip-sensitive-metadata` (I verified both: 28/28 assertions pass either way, identical debug output). This is a pre-existing fixture-ordering defect in the test itself, unrelated to the production code, and it predates this investigation.
- The other "new" content in that testing block (`expected-pulse-shape` doing `(dissoc :cards)`) doesn't discriminate either: it's compared via `partial=` (`mb.hawk.assert-exprs`), which only compares keys present in `expected` — dropping `:cards` from `expected` means `:cards` in `actual` is ignored entirely, stripped or not.

**`get-pulse-test`** — its fix-added assertions only check HTTP status (403 vs 200) for creator/recipient/non-recipient access without collection perms. That gate is `(api/check-403 (mi/can-read? pulse))`, and `mi/can-read?` lives in `src/metabase/pulse/models/pulse.clj` (also touched by the original commit, but explicitly out of scope per the task's product-file designation, and unmodified by our revert). The pre-fix `api/read-check` and post-fix `let-404`+`check-403` are behaviorally identical wrappers around the same `mi/can-read?` call, so this test cannot discriminate anything specific to `api/pulse.clj`.

### (4) Confidence and adversarial self-check
High confidence in the negative result. I verified empirically (not just by reading) that:
- Baseline (unmodified HEAD) passes 28/28 for both tests.
- With `maybe-strip-sensitive-metadata` reduced to `identity` (full semantic revert of the only behavior localizable to `api/pulse.clj`), both tests **still** pass 28/28 — zero change in outcome.
- Root cause traced directly: `DEBUG-PULSE-3-EXISTS-BEFORE nil` and `DEBUG-RAW-PULSES ()` printed from inside the endpoint and test, confirming the row-level cascade-delete before the assertion runs, independent of any code path in `api/pulse.clj`.
- Considered and rejected reverting the `can_read`→`creator_or_recipient` param rename or the `user-id`-conditional query-building instead — that would flip outcomes on the earlier (pre-existing, non-fix-added) count assertions too, over-reverting beyond the localized fix.

### (5) Category
Not a clean fit for "deletion/arity-only/neutralizing-setting," but closest to **target moved/deleted**: the specific data (`pulse-3`'s row) the discriminating assertion depends on is gone (cascade-deleted) by the time the assertion runs, for reasons entirely orthogonal to the product-code fix. No production-code semantic revert confined to `src/metabase/pulse/api/pulse.clj` can make either oracle deftest fail as a genuine assertion failure.

**Reconstructable?** No, not within the given file/oracle constraints. It would require also touching `src/metabase/pulse/models/pulse.clj` (out of scope) and/or fixing the test's fixture-sharing bug (rewriting the test, not a "minimal semantic revert" of product code) — both of which exceed the localization contract for this task.
