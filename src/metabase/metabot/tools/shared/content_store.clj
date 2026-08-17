(ns metabase.metabot.tools.shared.content-store
  "Permission-aware wrappers around [[resolve.mp/ContentStore]].

  The resolver in `resolve.mp` is permission-agnostic so serdes import and background tasks can
  use it with no authenticated user. HTTP and agent-tool paths run under a current user and must
  layer a check on top; this namespace is that chokepoint.

  [[read-checked]] gates all six methods, both lookup directions: the export direction can
  surface entity_ids of Cards / Measures / Segments referenced inside an exported query body,
  which is the N1 ACL gap this namespace closes. A row the current user cannot read never reaches
  the caller, and rows pass through unchanged when `api/*current-user-id*` is unbound (serdes,
  REPL, background tasks, tests with no auth context).

  What varies is whether a refusal is audited: [[api/read-check]] leaves an ERROR log line and an
  `:event/read-permission-failure`, [[api/check-403]] throws the same bare 403 without them.
  [[default-store]] audits the `-by-entity-id` methods only, [[audited-store]] audits all six,
  and [[resolve.mp/*audit-refusals?*]] suppresses auditing for a caller that discards the
  refusal."
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
  "Like [[maybe-read-check]], but throws a bare 403 rather than an audited one."
  [row]
  (cond
    (nil? row)              nil
    api/*current-user-id*   (do (api/check-403 (mi/can-read? row)) row)
    :else                   row))

(defn- checked
  "Permission-check `row`, auditing a refusal only when `audited?` and
  [[resolve.mp/*audit-refusals?*]] both hold."
  [audited? row]
  (if (and audited? resolve.mp/*audit-refusals?*)
    (maybe-read-check row)
    (maybe-check-403 row)))

(defn read-checked
  "Wrap `store` so every lookup permission-checks its row when `api/*current-user-id*` is bound,
  throwing a 403 when the current user cannot read it. Refusals on the `-by-entity-id` methods are
  audited; `audited-by-id?` audits the `-by-id` methods too."
  ([store] (read-checked store false))
  ([store audited-by-id?]
   (reify resolve.mp/ContentStore
     (card-by-entity-id    [_ eid] (checked true            (resolve.mp/card-by-entity-id    store eid)))
     (measure-by-entity-id [_ eid] (checked true            (resolve.mp/measure-by-entity-id store eid)))
     (segment-by-entity-id [_ eid] (checked true            (resolve.mp/segment-by-entity-id store eid)))
     (card-by-id           [_ id]  (checked audited-by-id?  (resolve.mp/card-by-id           store id)))
     (measure-by-id        [_ id]  (checked audited-by-id?  (resolve.mp/measure-by-id        store id)))
     (segment-by-id        [_ id]  (checked audited-by-id?  (resolve.mp/segment-by-id        store id))))))

(def default-store
  "[[resolve.mp/unchecked-app-db-content-store]] under [[read-checked]]. The store for any agent
  or tool path running under an authenticated request, over a query loaded from the app DB."
  (read-checked resolve.mp/unchecked-app-db-content-store))

(def audited-store
  "[[default-store]] with `-by-id` refusals audited too. For a query the client supplied rather
  than one loaded from the app DB, where the numeric ids in it are the caller's own."
  (read-checked resolve.mp/unchecked-app-db-content-store true))
