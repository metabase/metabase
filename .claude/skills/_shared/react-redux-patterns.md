# React, Redux, and Data-Layer Patterns

## React hooks

- `useMemo` is for computing a value. Side effects belong in `useEffect`. If a `useMemo` is firing a dispatch or mutating refs, convert it to `useState` + `useEffect`.
- A function component is the default. Convert remaining class components to function components when you touch them; it is fine to do this as a follow-up task.
- Be deliberate about when an effect runs during a batched/progressive load. "Fires on the first batch" is usually a bug — the effect should fire once all data is present.

## Redux state modeling

- Track loading and error state explicitly. Do not derive "loaded" from "data is truthy" — a failed request produces no data but is not loading.
- If you need both a selector and an action creator and the action creator doesn't exist yet, add it rather than reaching around it.
- Name selectors after what they return, not how they compute it — `useStoreSnapshotSelector` over `useSelectorWithEqualityCheck`.

## Error and loading state

- Every async operation needs a visible loading state. "It's fast enough" isn't a reason to skip it — on a slow connection the UI looks broken.
- Every async operation needs an error branch. Do not swallow errors silently; at minimum surface them to the user or log them where someone will see them.
- Do not derive loading from data presence. A failed request produces no data but is not loading.
- Empty state is its own UI — distinct from loading and from error. An empty list should look intentional, not like the page didn't finish rendering.

## API and data fetching

- Fetch data at the component that owns it. Do not lazily trigger a fetch deep in a render path and rely on the caller to have pre-warmed the cache.
- When a piece of metadata is required for a query, assure its presence where the query is created — not implicitly down one of the usage paths.
- Prefer RTK Query conventions over ad-hoc `fetch` or thunks for new endpoints.
- In Cypress, use the existing intercept helpers in `e2e/support/helpers/api/` instead of inlining `cy.intercept` with raw URLs.
- Wrap RTK mutation trigger functions in `useCallback` when you pass them to memoized children or effect dep arrays.
