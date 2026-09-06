# homepage.cy.spec.js → homepage.spec.ts

22 tests ported, 22/22 green on the CI EE jar (slot 3), 44/44 under
`--repeat-each=2`, tsc clean. No product bugs, no `test.fixme`.

## Fixes classified

- **Known gotcha (brief) — Mantine Modal-root `toBeVisible` reads hidden.**
  `page.getByTestId("new-dashboard-modal")` is the Mantine `Modal-root` wrapper,
  which Playwright reports as hidden; assert the inner `getByRole("dialog")`
  instead. Port should have avoided it from the start (it's in the brief);
  caught on first jar run. The `toHaveCount(0)` absence checks on the same
  testid are fine as-is.

- **New/refined gotcha — the x-ray suggestion sidebar's zoom-in drills into a
  FIELD x-ray, not a table one.** The Cypress alias `@getXrayDashboard =
  GET /api/automagic-*​/table/**` is table-only. Verified on the jar: the first
  Orders click fires `GET /api/automagic-dashboards/table/5`, but the
  sidebar's "Zoom in → Source fields" fires
  `GET /api/automagic-dashboards/field/53`. Porting the alias literally
  (`/table/`) times out on the zoom-in wait. The Cypress original passed only
  because `cy.wait` matches *past* responses retroactively, so its second
  `cy.wait("@getXrayDashboard")` was satisfied by a stale table response rather
  than the zoom's field request. Fix: `waitForXrayDashboard` matches any
  `/api/automagic-dashboards/` load except the `/candidates` endpoint. General
  lesson: a `cy.wait` on an alias whose pattern doesn't cover a later drill's
  endpoint is a retroactive-match trap — `page.waitForResponse` does not
  consume past responses, so the port must widen the predicate to the real
  endpoint.

## Dividend flagged

- **The SQLite x-ray tests are NOT infra-gated.** They use the built-in
  `sqlite` driver plus the repo-root `resources/sqlite-fixture.db` file; the
  slot backend runs from REPO_ROOT (`worker-backend.ts`), so the relative
  `details.db: "./resources/sqlite-fixture.db"` path resolves and sync
  completes on the jar. Three of the five "after setup" tests exercise this
  path and pass — no external DB / container needed. (Ported
  `addSqliteDatabase` + `getDatabaseFields` in support/homepage.ts, both
  polling for `initial_sync_status: complete` like the Cypress QA helper.)

## Notes

- Snowplow stubbed to no-ops (rule 6) in support/homepage.ts; every real UI
  action the snowplow assertions guarded is preserved.
- EE "popular items" test gated on `resolveToken("pro-self-hosted")`; the jar
  activates it, so it runs and passes.
- The asset-loading-error test routes `/`, rewrites `src="app/dist/app-main`
  → `src="bad-link.js` in the served (production) index.html, and asserts the
  `Metabase.AssetErrorLoad` onerror handler's `console.error` — works on the
  jar's static bundle (the substring `app/dist/app-main` survives in prod HTML).
