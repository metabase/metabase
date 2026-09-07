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
   [metabase.lib-be.core :as lib-be]
   [metabase.metabot.metadata-perms :as metabot.perms]
   [metabase.models.interface :as mi]
   [metabase.models.serialization.resolve.mp :as resolve.mp]
   [metabase.query-permissions.core :as query-perms]
   [metabase.util.log :as log]
   [toucan2.core :as t2]))

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

;;; The stores gate the content *inside* an export. Exporting also resolves table and field ids
;;; to names through an unfiltered provider, so the query's database and referenced tables need
;;; their own gate first. Same quiet/audited split as the stores, for the same reason.

(defn- resolve-effective-database
  "`query` with `:database` resolved to the id the export really uses: the virtual id `-1337`
  resolves through the source card, so gating on the raw value would check an id the export
  never touches. Nil when it can't be resolved."
  [query]
  (when (map? query)
    (try
      (lib-be/resolve-database query)
      (catch Exception _ nil))))

(def ^:private exported-table-id-keys
  [:source-table :source_table])

(def ^:private exported-card-id-keys
  [:source-card :source_card :card-id :card_id])

(def ^:private exported-field-id-keys
  [:source-field :metabase.models.visualization-settings/param-mapping-source])

(defn- exported-entity-ids
  [normalized]
  (let [ids (fn [ks node] (into #{} (comp (map #(get node %)) (filter pos-int?)) ks))]
    (reduce
     (fn [acc node]
       (cond
         (map? node)
         (-> acc
             (update :table into (ids exported-table-id-keys node))
             (update :card  into (ids exported-card-id-keys node))
             (update :field into (ids exported-field-id-keys node)))

         (and (vector? node) (not (map-entry? node)))
         (case (keyword (first node))
           (:field :field-id) (update acc :field into (filter pos-int?) [(nth node 1 nil) (nth node 2 nil)])
           :metric            (update acc :card into (filter pos-int?) [(nth node 1 nil) (nth node 2 nil)])
           acc)

         :else acc))
     {:table #{} :card #{} :field #{}}
     (tree-seq coll? seq normalized))))

(defn- sandbox-visible-fields?
  [field-id->table-id]
  (let [restricted (metabot.perms/sandbox-restricted-fields (set (vals field-id->table-id)))]
    (every? (fn [[field-id table-id]]
              (if-let [allowed (get restricted table-id)]
                (contains? allowed field-id)
                true))
            field-id->table-id)))

(defn- readable?
  "Whether the current user can read the row; with `audited?` a refusal leaves the
  [[api/read-check]] audit trail."
  [audited? model id]
  (if audited?
    (try
      (api/read-check model id)
      true
      (catch clojure.lang.ExceptionInfo e
        (if (= 403 (:status-code (ex-data e)))
          false
          (throw e))))
    (mi/can-read? model id)))

(defn- query-runnable?
  "Whether the current user may run `resolved` and see every table and field it names: the
  query processor's own run check (a saved question authorizes through its collection, native
  SQL through database-wide native access), then a per-table check on the ids the export
  resolves to names and a column-sandbox check on its field refs. The saved questions the
  query reads from are checked first with the caller's audit polarity, since the run check
  refuses them without a trail. Measure / segment refs are not checked here; the stores gate
  those with the caller's audit polarity."
  [audited? resolved]
  (try
    (let [normalized                 (lib-be/normalize-query resolved)
          database-id                (:database normalized)
          {:keys [table card field]} (exported-entity-ids normalized)]
      (boolean
       (when (and (pos-int? database-id)
                  (every? #(readable? audited? :model/Card %) card)
                  ;; throw on a calculation failure so only a denial reads as false
                  (query-perms/can-run-query? normalized false true))
         (let [field-table (metabot.perms/field-id->table-id field)
               table-ids   (into (set table) (vals field-table))]
           (and (= table-ids (metabot.perms/queryable-table-ids table-ids))
                (sandbox-visible-fields? field-table))))))
    (catch Exception e
      (log/debugf "Omitting a query that could not be permission-checked: %s" (ex-message e))
      false)))

(defn query-if-database-readable
  "`query` with its database resolved, when the current user can read that database and run
  the query, else nil. With `audited?` the database and saved-question refusals are audited;
  for client-supplied queries, where the ids are the caller's own. A database that no longer
  exists passes, since there is no metadata behind it to leak; one we can't resolve does not."
  [query audited?]
  (if-not (and (map? query) (:database query))
    query
    (when-let [resolved (resolve-effective-database query)]
      (let [database-id (:database resolved)]
        (when (or (not (t2/exists? :model/Database :id database-id))
                  (and (readable? audited? :model/Database database-id)
                       (query-runnable? audited? resolved)))
          resolved)))))
