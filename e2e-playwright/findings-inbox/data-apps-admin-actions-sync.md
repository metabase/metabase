# data-apps admin / actions / sync ports — same stale-snapshot blocker

Ports (slot 1 / port 4101), CI jar verified by identity (`version.hash =
1d91fb2`, date 2026-07-21):

- `data-apps/admin.cy.spec.ts`   → `tests/data-apps-admin.spec.ts`
- `data-apps/actions.cy.spec.ts` → `tests/data-apps-actions.spec.ts`
- `data-apps/sync.cy.spec.ts`    → `tests/data-apps-sync.spec.ts`

All three are faithful and `tsc --noEmit` clean. They hit the **same** blocker
the slot-2 sibling documented in `findings-inbox/data-apps.md` (sandbox/viewing):
the local `default` / `postgres-writable` snapshots (dated 07-17) predate the
`data_app` table migration (`resources/migrations/064/20260717_data_app.yaml`),
so `mb.restore()` serves a schema with no `DATA_APP` table and every data-apps
route 500s with `Table "DATA_APP" not found [42102-214]`. See that file for the
full root-cause writeup — this is a corroborating second instance across three
more specs, not a new cause.

**Correction to note:** the `data_app` migration IS in local source (at
`resources/migrations/064/…`, a subdir a top-level `resources/migrations/*.yaml`
grep misses). So a from-source snapshot regen WOULD add the table — the only
barriers are the forbidden port 4000 (this session) and the live sibling
slots + Cypress run (shared `e2e/snapshots/*` must not be regenerated live).

## New wrinkle these three specs surface

The blocker reaches **fully `page.route`-mocked** ports too, via the
server-rendered host document route. `admin.happy-path` and both `actions` tests
mock every `/api/apps/*` XHR (`mockDataApp`), yet still fail — because
`openDataApp`/`visitDataAppRoute` do a top-level navigation to
`GET /apps/kitchen-sink[/…]`, which the **backend** resolves against `data_app`
(`SELECT … FROM "DATA_APP" WHERE "NAME"=? AND "ENABLED"=TRUE`) before serving the
iframe shell → server-side 500, captured in the error-context a11y tree
(`STATUS: 500`, `URI: /apps/kitchen-sink/actions`). `page.route` only intercepts
XHR/subresource fetches, not the document navigation's server render. So "the
port mocks all of `/api/apps`" is NOT sufficient to dodge the missing table — the
host route itself needs it.

## Verified locally despite the blocker

- `data-apps-admin.spec.ts` "dismisses the promo banner and keeps it hidden
  across a reload" → **PASS, 2/2 under `--repeat-each=2`, mutation-verified**
  (post-dismiss `toHaveCount(0)` → `toBeVisible()` goes red, reverted). This test
  stays on `/admin/settings/apps` (mocks `/api/apps` → `[]`), never navigates to
  `/apps/:slug`, so it is table-independent.
- The two OSS-upsell tests **correctly SKIP** on the EE jar (`isOssBackend`).
- `data-apps-actions` `beforeEach` runs to completion against writable QA
  Postgres — `resetTestTable` / `resyncDatabase` / `setActionsEnabledForDB` /
  `createModelFromTableName` / `createImplicitAction` all succeed. The ONLY
  failure is the subsequent `/apps/…` navigation, so the writable-DB half of the
  port is exercised and sound.

## Deliverable state

- 3 specs + additions to `support/data-apps.ts` (`actionId`/`actionParams` on
  `DataAppTestEnv`; `copySyncedDataAppsFixture`) — the module itself was mostly
  from a prior checkpoint; `support/INDEX.md` regenerated.
- `bun install --frozen-lockfile` was needed to materialise `vite` (declared
  devDependency, absent from the pre-data-apps local `node_modules`) so
  `mockDataApp`'s fixture build works. The build produces `dist/index.js` (8.5 KB).
- **NOT appended to PORTED.txt** — only 1 of 5 real tests is green on this box;
  claiming them ported would be dishonest. Append after a `default` +
  `postgres-writable` snapshot regen on a quiet box (expect: admin 3 green +
  2 OSS-skip, sync 2 green, actions 2 green with `PW_QA_DB_ENABLED=1`).
- No Cypress cross-check (sibling slots live; and it would fail identically on the
  same stale snapshot, proving nothing about fidelity).
