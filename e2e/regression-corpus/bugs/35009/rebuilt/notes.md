# 35009: search results dismissed when a dashboard finishes loading

Status: live. Base 8317274709c, worktree /private/tmp/metabase-corpus-r35009.

## Where the code moved
Same file as the fix (2cdb3c63, #37669): `frontend/src/metabase/nav/components/search/SearchBar/SearchBar.tsx`.
What moved is the router: `SearchBarView` got `location` as a prop and read `location.action`.
After the react-router v7 migration (#79300, #79338) `SearchBar` calls `useLocation()` and
`useNavigationType()`, and the guard is now `navigationType !== "REPLACE"` (line 148).
July's inverse.patch conflicts because the `location.action` text no longer exists.

## Mutant
`if (previousLocation !== location && navigationType !== "REPLACE")` becomes
`if (previousLocation !== location)`, the exact pre-fix condition. Any location change,
including the `replace` a loading dashboard does when it syncs its parameters into the URL
(and the homepage-to-dashboard redirect of #34226), closes the open search dropdown.
`navigationType` stays in the effect's dependency list, so nothing goes unused.

## Oracle
No jest oracle on master. The land-and-cull commit bf3736f0270 had written one for this spec,
but it used the old `history.replace` / `history.getCurrentLocation` API.
I adapted it to the current `TestRouter` handle: `router.navigate("/dashboard/1", { replace: true })`
inside `act`, then `waitFor` on `router.location.pathname`. witness.patch adds two tests:
the push companion ("should dismiss ... when navigating to a new page") and the #35009 oracle.

Clean HEAD + witness: 11/11 pass, oracle 30 ms.
Mutant + witness: 10 pass, 1 fail:
```
✕ should not dismiss the search results when the location is replaced (metabase#35009)
TestingLibraryElementError: Unable to find an element by: [data-testid="search-results-floating-container"]
> 243 |         screen.getByTestId("search-results-floating-container"),
```

## Adversarial check
- The same `getByTestId` before the navigation passes on the mutant, so the dropdown opened and
  only the post-replace check fails. The DOM dump shows the search input still rendered (value "").
  The component didn't crash or remount. Only `isActive` flipped to false.
- The route is `path="*"`, so a replace to `/dashboard/1` keeps the same `SearchBar` instance.
  Clean HEAD passing proves no remount.
- The push companion test still passes on the mutant, so the fix is the only behaviour that changed.
- The failure is a `getBy*` presence failure rather than an `expect(...)` message. That is the
  repo's presence-assertion style (lint prefers `getBy` with `toBeInTheDocument`). Treat it as an
  assertion, not a crash.

## Variants
- v1 inverted guard (`=== "REPLACE"`): kill (the companion push test also fails).
- v2 pathname comparison (the fix PR's first attempt): kill. The oracle's replace changes the
  pathname (`/` to `/dashboard/1`). A replace that keeps the pathname and changes only
  search params would survive v2, and the real #35009 dashboard parameter sync is that shape.
- v3 `=== "PUSH"` only (back/forward no longer dismisses): survive. No test covers POP.

## Gotchas
- The worktree's `target` is a symlink to /private/tmp/metabase-corpus-fresh/target.
  No .cljc was touched, so no cljs build was needed.
- `timeout` isn't on PATH on this machine. Each spec run took 10 to 40 s.
