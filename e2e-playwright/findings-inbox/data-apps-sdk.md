# data-apps SDK runtime (sdk.cy.spec.ts)

Port of `e2e/test/scenarios/data-apps/sdk.cy.spec.ts` (203 lines, 7 tests)
→ `tests/data-apps-sdk.spec.ts`. Slot 3 / port 4103. Jar verified **by
identity**: `/api/session/properties` `version.hash = 1d91fb2` (matches the
task's `1d91fb2b` prefix), `date 2026-07-21`; a genuinely fresh boot
(`ready in 35s`, not `(reused)`), so `JAR_PATH` was honoured.

## Same blocker as the sibling data-apps ports (see findings-inbox/data-apps.md)

The `data-apps` feature IS present and unlocked on the CI jar, but the spec
**cannot be run to green locally** because `e2e/snapshots/default.sql` (07-17)
predates `resources/migrations/064/20260717_data_app.yaml`. `restore("default")`
drops the `data_app` table the boot migrations created, so `/embed/apps/:slug`
— the iframe entrypoint, which Cypress never mocked and `mockDataApp` therefore
does not stub — 500s with `Table "DATA_APP" not found`, and the embed iframe
never loads. **CI is unaffected** (snapshots regenerated against the migrated
schema at run time). This is the documented "snapshots go stale after schema
migrations" gotcha, confirmed independently on slot 3.

I did **not** regenerate snapshots: sibling data-apps ports were live on slots
1/2/4/5 (a `data-apps-sync` Cypress-free run was executing on slot 1), and
regenerating the shared, gitignored `e2e/snapshots/*` would corrupt their
`restore()`s. Same call the sibling finding made.

## Evidence the port is otherwise correct (mechanically sound)

Ran the first test on the jar backend (token present, past the gate). It:
- built the `kitchen-sink` fixture bundle (8.5 KB) via `buildDataAppBundle`,
- registered the `/api/apps/*` `page.route` mocks,
- navigated to `/apps/kitchen-sink/query-states`,
- and failed **only** at `iframe[title="Kitchen Sink"].contentFrame()
  .getByTestId("query-error")` → `element(s) not found` (the iframe document
  never rendered — the blocker), NOT at any import/arity/build error.

`custom-error-component` fixture (test 7) also builds (508 B). `bunx tsc
--noEmit` is clean.

## NOT done (cannot honestly claim, per the blocker)

- **Not added to PORTED.txt** (not green).
- **No mutation testing** (no green baseline to mutate from).
- **No Cypress cross-check** (would fail identically for the same snapshot
  reason — proves nothing about fidelity; and sibling slots were live).

## To finish (handoff — identical to findings-inbox/data-apps.md)

On a quiet box: regenerate the `default` snapshot
(`node e2e/runner/run_cypress_ci.js snapshot --expose grepTags="-@external"`;
verify `grep -c DATA_APP e2e/snapshots/default.sql` > 0), kill slot 3
(`lsof -ti :4103 | xargs kill -9`, `rm -rf $TMPDIR/mb-pw-slot-3`), then run the
jar loop. Expect 7 tests green; then `--repeat-each=2`, mutation-check one
assertion, append the source path to PORTED.txt.

## Port-fidelity notes (for the eventual green run)

- **New agent module `support/data-apps-sdk.ts`** (rule 9 / parallel-agents):
  the shared `support/data-apps.ts` is owned by the sibling ports and its
  structural `DataAppTestEnv` omits the `errorQuery`/`combinators` fields this
  spec needs. Rather than edit a file a live sibling depends on, the widened
  `SdkDataAppTestEnv`, `dataAppNumericField`, and a `mockDataApp` wrapper (casts
  the widened `testEnv` — the base only JSON-serializes it, so a superset is
  safe) live in the new module. **Consolidation candidate:** fold these into
  `support/data-apps.ts` (add `errorQuery`/`combinators` to `DataAppTestEnv` and
  export `dataAppNumericField`) once the parallel work settles.
- `H.activateToken("bleeding-edge")` → `mb.api.activateToken(...)`; describe
  gated `test.skip(!resolveToken("bleeding-edge"), …)` (rule 7). No @external.
- `cy.intercept("POST","/api/dataset").as(...)` + `cy.get("@…​.all").length` →
  a `page.on("request")` counter; the refetch assertion polls it to `before+1`
  (rule 2 — no never-awaited alias).
- Clipboard: `cy.stub(win.navigator.clipboard,"writeText")` → a recorder
  installed via `frame.evaluate` before the click; recorded args read back and
  asserted OUTSIDE the recorder (calledOnceWith → exactly `["…payload"]`), so a
  never-invoked stub fails loudly.
- `should("have.text", x)` → `toHaveText(x)`; `findByText(/re/i)` → `getByText`
  regex + `.first()` (multi-match, rule 3); `have.text` numeric checks →
  `expect.poll` on `Number(textContent())`.
