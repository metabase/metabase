# 45638: static embedded question ignores the `#font` embed option

Status: live. Base `8317274709c`. Stratum: wiring.

## Where the code moved
The fix (`abfda359b06`, PR #52368 "Fix passing a font for static embedded question") moved `use-embed-font.ts` from `dashboard/hooks` to `public/hooks` and added a `useEffect` in `PublicOrEmbeddedQuestion.tsx` that parsed `#font` from the hash and called `setFont`. At HEAD that effect has been folded into `useSetEmbedFont({ location })` in `frontend/src/metabase/public/hooks/use-set-embed-font.ts`, which both `PublicOrEmbeddedQuestion.tsx` and `PublicOrEmbeddedDashboardPage.tsx` call. July's patch conflicts because the hook file changed since then.

## Mutant
`mutant.patch` deletes the `useSetEmbedFont({ location })` call and its import from `PublicOrEmbeddedQuestion.tsx`. That's exactly the state before the fix: the question page never reads the font from the hash, while the dashboard page still does. July put the fault inside the hook instead (`font: undefined`), which also breaks dashboards and is wider than the bug statement; it's kept as variant 1.

## Oracle
Source `new`, adapted from the witness that landed on `dev-2347-...` (`8c728993e70`), which isn't on master. The test adds `should apply the font from the \`#font\` hash parameter (metabase#45638)` to `PublicOrEmbeddedQuestion.common.unit.spec.tsx` and makes `tests/setup.tsx` return `{ store }` from `renderWithProviders`. It renders the real component at `public/question/:uuid#font=Roboto` and asserts `getFont(store.getState())`. The existing hook spec `use-set-embed-font.unit.spec.tsx` does NOT kill the faithful mutant, because the hook itself is intact.

Clean (witness applied): 5 of 5 pass. Mutant (common + enterprise + premium question specs + hook spec): `Expected: "Roboto"  Received: "Lato"`, 1 failed, 12 passed.

## Adversarial check
The test's `setup` first waits for the question name to render and the loader to go away, so a render crash would fail there instead. The failure is a value comparison: `"Lato"` is the mocked `application-font` setting, which `getFont` falls back to when `embed.options.font` is unset. The other 12 tests still pass, so the mutant only removes the font wiring.

## Variants (component witness result; hook spec for context)
- v1, hook dispatches `font: undefined`: **kill**. Hook spec also kills.
- v2, effect deps drop `location.hash`: **survive**; the witness only checks the initial hash. Hook spec kills on rerender.
- v3, parses `location.search` instead of `location.hash`: **kill** with an assertion. Hook spec only crashes on it (`TypeError` in `parseHashOptions`; its fake `Location` has no `search`).

## Gotchas
- The record's `hint` (the hook spec) is the wrong oracle for the faithful mutant; it only catches hook-internal variants.
- The component witness exists only on the dev-2347 and `regression-corpus-v2` branches; apply `witness.patch`.
- No `.cljc` touched, no cljs rebuild.
