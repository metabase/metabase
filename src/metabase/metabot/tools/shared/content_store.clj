(ns metabase.metabot.tools.shared.content-store
  "Permission-aware wrapper around `metabase.models.serialization.resolve.mp/ContentStore`.

  The metadata-provider-backed resolver in `resolve.mp` is deliberately permission-agnostic so
  that serdes import / background tasks can use it without an authenticated user. HTTP and
  agent-tool paths run under a current user and therefore must layer in `api/read-check` —
  this namespace is the chokepoint.

  `read-checked` wraps any `ContentStore` so every lookup that returns a Card / Measure /
  Segment row is gated by `api/read-check` whenever `api/*current-user-id*` is bound. When
  the var is unbound (serdes, REPL, background tasks, tests without auth context), rows pass
  through unchanged.

  `default-store` is the standard agent / tool-path store — `unchecked-app-db-content-store`
  wrapped with `read-checked`. Use this as the content store for any agent or tool path that
  runs under an authenticated request. The symmetry across all five methods (both
  `-by-entity-id` import-direction and `-by-id` export-direction) is intentional: the export
  direction may surface entity_ids of Cards / Measures / Segments referenced inside an
  exported query body, and a missing check on those branches is exactly the N1 ACL gap that
  motivated this namespace."
  (:require
   [metabase.api.common :as api]
   [metabase.models.serialization.resolve.mp :as resolve.mp]))

(set! *warn-on-reflection* true)

(defn- maybe-read-check
  "Apply `api/read-check` when `*current-user-id*` is bound; otherwise return the row
  unchanged. Returning `nil` propagates through (no row → nothing to check; the
  per-model resolver functions translate `nil` into a clean `:unknown-…` agent error)."
  [row]
  (cond
    (nil? row)              nil
    api/*current-user-id*   (api/read-check row)
    :else                   row))

(defn read-checked
  "Wrap `store` so every lookup applies `api/read-check` when `api/*current-user-id*` is
  bound. Symmetric across all five `ContentStore` methods."
  [store]
  (reify resolve.mp/ContentStore
    (card-by-entity-id    [_ eid] (maybe-read-check (resolve.mp/card-by-entity-id    store eid)))
    (measure-by-entity-id [_ eid] (maybe-read-check (resolve.mp/measure-by-entity-id store eid)))
    (segment-by-entity-id [_ eid] (maybe-read-check (resolve.mp/segment-by-entity-id store eid)))
    (measure-by-id        [_ id]  (maybe-read-check (resolve.mp/measure-by-id        store id)))
    (segment-by-id        [_ id]  (maybe-read-check (resolve.mp/segment-by-id        store id)))))

(def default-store
  "The standard agent / tool-path content store: `unchecked-app-db-content-store` wrapped with
  `read-checked`. Pass this to `repr.resolve/resolve-query`, `repr.resolve/export-query`,
  `repr.resolve/try-export-query`, `repair/repair`, or any other resolver entry-point that
  runs under an authenticated request."
  (read-checked resolve.mp/unchecked-app-db-content-store))
