(ns metabase.metabot.tools.shared.content-store
  "Permission-aware wrapper around `metabase.models.serialization.resolve.mp/ContentStore`.

  The metadata-provider-backed resolver in `resolve.mp` is deliberately permission-agnostic so
  that serdes import / background tasks can use it without an authenticated user. HTTP and
  agent-tool paths run under a current user and therefore must layer in a permission check;
  this namespace is the chokepoint.

  `read-checked` wraps any `ContentStore` so every lookup that returns a Card / Measure /
  Segment row is gated by a permission check whenever `api/*current-user-id*` is bound. When
  the var is unbound (serdes, REPL, background tasks, tests without auth context), rows pass
  through unchanged.

  The `-by-entity-id` (import-direction) methods use [[api/read-check]]: the model named an
  entity_id outright, so a refusal there is a real access attempt and worth the audit trail
  `read-check` leaves (an ERROR log line, a `:event/read-permission-failure`, a `view_log`
  row for Cards). The `-by-id` (export-direction) methods of [[default-store]] use an
  unaudited [[api/check-403]] instead, a bare 403 with none of those side effects: a card
  referenced inside a stored query the user can't read is routine filtering, not an access
  attempt, and every agent turn that rebuilds context over a transform referencing an
  unreadable card would otherwise bury the real access attempts the audit view exists to
  surface. Only the audit trail differs: both directions are still checked, because the
  export direction can surface entity_ids of Cards / Measures / Segments referenced inside an
  exported query body, which is the N1 ACL gap that motivated this namespace.

  The quiet treatment only holds for queries loaded from the app DB. A query supplied by the
  client (the `user_is_viewing` context) can carry any numeric id the caller typed or
  guessed, so a refusal there is a real access attempt after all; those callers use
  [[audited-store]], which keeps [[api/read-check]] on the `-by-id` methods too."
  (:require
   [metabase.api.common :as api]
   [metabase.models.interface :as mi]
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

(defn- maybe-check-403
  "Like [[maybe-read-check]], but an unaudited `api/check-403` instead of `api/read-check`: no
  ERROR log, no `:event/read-permission-failure`, no `view_log` row. For lookups where a
  refusal is routine filtering rather than a real access attempt."
  [row]
  (cond
    (nil? row)              nil
    api/*current-user-id*   (do (api/check-403 (mi/can-read? row)) row)
    :else                   row))

(defn read-checked
  "Wrap `store` so every lookup applies a permission check when `api/*current-user-id*` is
  bound: [[api/read-check]] (audited) on the `-by-entity-id` methods and, by default, an
  unaudited [[api/check-403]] on the `-by-id` methods. `audited-by-id?` swaps
  [[maybe-check-403]] for [[maybe-read-check]] so the `-by-id` methods are audited too. See
  the namespace docstring for why the directions differ."
  ([store] (read-checked store false))
  ([store audited-by-id?]
   (let [by-id-check (if audited-by-id? maybe-read-check maybe-check-403)]
     (reify resolve.mp/ContentStore
       (card-by-entity-id    [_ eid] (maybe-read-check (resolve.mp/card-by-entity-id    store eid)))
       (measure-by-entity-id [_ eid] (maybe-read-check (resolve.mp/measure-by-entity-id store eid)))
       (segment-by-entity-id [_ eid] (maybe-read-check (resolve.mp/segment-by-entity-id store eid)))
       (card-by-id           [_ id]  (by-id-check (resolve.mp/card-by-id           store id)))
       (measure-by-id        [_ id]  (by-id-check (resolve.mp/measure-by-id        store id)))
       (segment-by-id        [_ id]  (by-id-check (resolve.mp/segment-by-id        store id)))))))

(def default-store
  "The standard agent / tool-path content store: `unchecked-app-db-content-store` wrapped with
  [[read-checked]]. Pass this to `repr.resolve/resolve-query`, `repr.resolve/export-query`,
  `repr.resolve/try-export-query`, `repair/repair`, or any other resolver entry-point that
  runs under an authenticated request. Refusals on the `-by-id` methods are quiet; reach for
  [[audited-store]] instead when those ids came from the client."
  (read-checked resolve.mp/unchecked-app-db-content-store))

(def audited-store
  "Like [[default-store]], but keeps the audited [[api/read-check]] on the `-by-id` methods. Use
  for queries the client supplied rather than ones loaded from the app DB: a numeric id in
  a client-supplied query is a real access attempt, and its refusal belongs in the audit
  trail."
  (read-checked resolve.mp/unchecked-app-db-content-store true))
