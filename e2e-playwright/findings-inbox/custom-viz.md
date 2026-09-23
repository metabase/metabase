# custom-viz (visualizations-charts/custom-viz.cy.spec.ts)

Ported to `tests/custom-viz.spec.ts` (+ `support/custom-viz.ts`). Verified on the
CI EE uberjar, slot 3: **52 passed, 2 skipped** (full file), representative
subset green under `--repeat-each=2`. tsc clean.

Big spec (~2661 lines → 54 test cases): admin plugin CRUD, rendering on
questions/dashboards/documents, icon rendering across app surfaces, and the
near-membrane-dom sandbox security matrix (60-case API-block test + 11 more).

## Classification of fixes made while stabilising

All three were **known-gotcha** misses in the initial port, not new gotchas:

1. **`findByText(string)` is exact (rule 1).** `popover().getByText("Admin")`
   substring-matched the profile menu's `admin@metabase.test` email — 2 matches,
   strict-mode fail. Both nav-link clicks (`adminAppLinkText`/`mainAppLinkText`)
   needed `{ exact: true }`.
2. **`.find(SEL).should("exist")` is an at-least-one check, not `toHaveCount(1)`.**
   The unpinned collection list row renders the plugin-icon span **twice**
   (`span[style*="custom-viz-plugin"]` matched 2). Ported the whole
   icon-rendering suite's existence checks as `.first()).toBeAttached()`. (Same
   family as the documented "pinned-card icons appear twice → .first()" gotcha,
   but for `should("exist")` rather than `should("be.visible")`.)
3. **OSS gate.** The `@OSS` describe asserts a "Try for free" CTA that the EE
   build does not render — failed on the EE jar. Gated with
   `test.skip(!isOssBackend)`, matching embedding-smoketests / admin-authentication.
   (The brief's "OSS tests run on the EE jar too" holds for OSS describes whose
   assertions are build-agnostic; this one is genuinely OSS-only.)

## Migration dividends / notes (nothing FINDINGS-worthy)

- **Restore swap for jar-runnability.** Upstream restores `postgres-writable`;
  every question queries the sample H2 DB (`STATIC_ORDERS_ID`), so the writable
  postgres is never touched. Restoring `"default"` keeps the whole spec runnable
  with no external DB and changes nothing exercised. Plugins are added over the
  API each test, not from a snapshot.
- **Development-mode test gate-skipped** (`test.fixme`): it drives Cypress node
  tasks — SDK build, CLI scaffold, `npm i`, a spawned Vite dev server on :5174,
  hot reload — with no Playwright-harness equivalent. The only skip beyond OSS.
- **No product bugs, no cross-check needed** — everything passed on the jar
  directly, so no fidelity cross-check was required.

## Port techniques worth reusing (candidate helpers)

Consolidated into `support/custom-viz.ts` (spec-local per the brief), but these
are the reusable shapes for any future plugin/sandbox port:

- **Multipart upload via `page.request`.** `addCustomVizPlugin` POSTs the .tgz
  with `page.request.post(url, { multipart: { file: { name, mimeType, buffer } } })`.
  `page.request` shares the browser context's session cookie, so it runs
  authenticated with no manual header plumbing — cleaner than the shared
  `MetabaseApi` (which has no multipart path). Good precedent for any file-upload
  port.
- **Response-body rewrite** (`cy.intercept(...).continue(res => res.body=...)`
  → `page.route` + `route.fetch()` + `route.fulfill({ response, body })`).
  `interceptInjectedBundle` returns a promise that resolves on first fulfill =
  the port of `cy.wait("@injectedBundle")`.
- **Console-spy collector** (`support/custom-viz.ts collectConsole`). Resolves
  each console arg in the page realm (`Error → .message`, primitives verbatim)
  so both `calledWith(label, value)` and
  `calledWithMatch(sinon.match.has("message", regex))` upstream assertions port
  cleanly — sidesteps Playwright's "JSHandle@error" rendering of bare Error args.
  Poll-based (`expectConsoleErrorMatch` / `expectConsoleCalledWith`) with a 20s
  window for the staggered-`setTimeout` bundle.
- **Canary request counter** (`page.on("request")` counting a path) ports the
  `cy.intercept(...).as("canary")` + `@canary.all length 0` no-request assertions.

Consolidation candidates if custom-viz coverage grows: fold the
console-collector + bundle-injection helpers into a shared `support/sandbox.ts`,
and lift `addCustomVizPlugin`/fixture-hash into a shared `custom-viz` module.
