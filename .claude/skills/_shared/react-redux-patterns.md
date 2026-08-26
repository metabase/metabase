# React, Redux, and Data-Layer Patterns

## API access and RTK Query

- **Use RTK Query for server data.** Add typed endpoints under `metabase/api` or `metabase-enterprise/api`; don't add ad-hoc `fetch`, service wrappers, or new thunks for ordinary API access.
- **Keep API files transport-focused.** Endpoint files should cover request/response typing, URLs, params, light response normalization, and cache tags — not feature business logic.
- **Use canonical API types.** Prefer `metabase-types/api`; fix or derive missing types instead of casting endpoint results. Refer to API endpoint implementation in Clojure when building new endpoint connections.
- **Tag caches deliberately.** Use `listTag`, `idTag`, `provide*Tags`, and `invalidateTags(error, tags)` where appropriate.
- **Guard missing query inputs.** Use `skipToken` or `skip` until all required inputs exist. Build query requirements where the query is created, not in a downstream render path.
- **Use lazy queries only for events.** Data needed to render a screen belongs in a regular query hook at the owner component/hook.
- **Handle mutations with `unwrap()`.** Prefer `await trigger(args).unwrap()` in submit handlers; otherwise branch on `result.error` immediately.

## Where data should live

- **Server data:** RTK Query cache, not duplicated Redux state.
- **Form state:** Form library or local component state, not global Redux.
- **Transient UI state:** Component state or narrow context, not store-wide flags.
- **Cross-route/global tasks:** Redux slice with public selectors.
- **Derived values:** Selectors or pure helpers, not stored copies of computed data. Memoized if identity is important.

## Redux state modeling

- **Avoid using Redux**. Most problems can be solved with local component state or RTK Query.
- **Use Redux only when needed.** Reach for Redux only when distant parts of the app need durable shared state.
- **Model async status explicitly.** Use a discriminated union or explicit `status`/`isLoading`/`error`; don't infer loaded or failed state from truthy/falsy `data`.
- **Store canonical state only.** Derive filtered lists, labels, permissions, booleans, and display variants in selectors.
- **Read through selectors.** Name selectors after what they return (`getCurrentTask`, `getHasPendingMutation`), not how they compute it.
- **Add missing public actions/selectors.** Don't reach into another feature's private state shape because an action or selector is missing.
- **Use `createSelector` for derived state.** Keep selectors pure, cheap, and stable by reference when consumers depend on identity.

## React hooks and components

- **`useMemo` computes render values.** Side effects belong in `useEffect`; event-driven changes belong in event handlers or mutation callbacks.
- **Keep effects narrow and idempotent.** Include all dependencies, guard inside the effect, and clean up timers/subscriptions. Complex logic should be split to multiple effects or custom hooks, also consider extracting functional pieces.
- **Hooks can be used to encapsulate complex logic.** For example, a hook can normalize data, handle form's state and validation, or a hook can manage a table's pagination and sorting. If component's logic becomes too complex, consider extracting a hook.
- **Hooks orchestrate behavior.** Custom hooks should return a small typed result object: data, loading/error state, and callbacks when relevant.
- **Don't mirror props/query data into state** unless the consumer can edit that local copy. Keep derived render data as such.
- **Use `useCallback` for stable identity needs, but deliberately.** Wrap callbacks passed to memoized children, dependency arrays, context values, or hooks that require stable identity — not every local handler.
- **Memoize object/array props only when identity matters.** Prefer simpler plain values otherwise.
- **Stories for presentational components**. Create Storybook stories for presentational components to test different states and props. Stories live next to the component.

## Performance

- **Optimize only where identity or scale matters.** Prefer clear code first, then add `memo`, `useMemo`, `useCallback`, selectors, virtualization, or split components when render cost, prop identity, or list size justifies it.
- **Keep context values stable and avoid frequent updates.** Values updated often should be avoided in context consumed by many components, or stored by reference with a stable context value and explicit subscriptions/selectors.
- **Read global state high in the tree.** Let parent components select context/Redux/API state, derive the view model, and pass narrow props top-down. But avoid passing props too deep (reconsider if more thatn 2 levels).
- **Avoid unstable props in hot paths.** Don't pass fresh object/array/function literals to memoized children; memoize them or move them outside render when identity matters.
- **Render large lists deliberately.** Use pagination, windowing/virtualization, stable keys, and row-level memoization for large or frequently updating lists.
- **Consider memoization for leaf components.** If the source of data updates often, but the component doesn't need to re-render, consider memoizing it.

## Loading, error, and empty states

- **Every async operation needs loading UI.** Use `LoadingAndErrorWrapper` or `DelayedLoadingAndErrorWrapper` for full-page/panel loading; use disabled controls and inline progress for local actions.
- **Every async operation needs an error branch.** Use wrappers or feature-specific alerts for query errors; use `getErrorMessage(error, fallback)` plus a toast/form error for mutation failures.
- **Empty is its own state.** Render no-results, empty-list, and permission-limited states intentionally; don't let them look like unfinished loading.
- **Combine multiple query states explicitly.** Example: `isLoading = a.isLoading || b.isLoading`; `error = a.error || b.error`.
- **Distinguish first load from refresh.** Use `isLoading` for first-load blockers and `isFetching` for background refresh indicators.
- **Test all async branches.** Cover loading, error, empty, and success states when adding or changing data access.

## Review checklist

- Server data uses a typed RTK Query endpoint with correct cache tags.
- Query inputs are guarded with `skipToken`/`skip` until ready.
- Global state is justified, minimal, and read through selectors.
- Context values are stable; frequently changing values don't force broad re-renders.
- Leaf components stay dumb and receive narrow props from parent containers.
- Loading, error, empty, and success branches are visible and tested.
- Hooks are pure during render; side effects are confined to effects or event handlers.
- Mutation failures are surfaced to people using the UI.
