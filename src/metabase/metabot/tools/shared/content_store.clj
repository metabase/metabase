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
   [metabase.metabot.db :as metabot.db]
   [metabase.metabot.metadata-perms :as metabot.perms]
   [metabase.metabot.tools.shared :as shared]
   [metabase.models.interface :as mi]
   [metabase.models.serialization.resolve.mp :as resolve.mp]
   [metabase.query-permissions.core :as query-perms]
   [metabase.util.log :as log]))

(set! *warn-on-reflection* true)

(def ^:dynamic *last-lookup-refused?*
  "Set to `true` by [[read-checked]] when a lookup was refused on permissions rather than simply
  missing.

  The two are deliberately indistinguishable to the *agent* — same status, same error key, so a
  guessable id cannot be used to probe for hidden content. Some internal callers still need to
  tell them apart: `llm-shape/export-query-for-llm` renders nothing at all for a refusal but
  falls back to pretty-printed EDN for a genuine export failure, and without this it would print
  the raw query for a card the caller may not read. Bind it per lookup and read it after; it says
  nothing about *which* row was refused, so it cannot itself become an oracle."
  (atom false))

(defn- permission-checked
  "Permission-check `row`, or return it unchanged when `api/*current-user-id*` is unbound. `nil`
  propagates (no row → nothing to check; the per-model resolvers turn `nil` into a clean
  `:unknown-…` agent error).

  Two independent axes, because two fixes to this function wanted different things and both were
  right:

  `audited?` picks the check. `api/read-check` writes an audit entry for the refusal;
  `api/check-403` does not. Refusals on `-by-entity-id` are always audited, and `-by-id` refusals
  are audited when the caller asked for it (BOT-1956).

  `collapse-denial?` picks what the *caller* sees, and the two surfaces want opposite things:

  - **By numeric id** (`collapse-denial?` true): return `nil`, so \"exists but you may not read
    it\" and \"does not exist\" reach the caller as the same `:unknown-…` error. Numeric ids are
    sequential and trivially guessable, so a distinguishable denial is an existence oracle.
  - **By entity_id** (`collapse-denial?` false): let the 403 through. A 21-character NanoID is
    not guessable, so there is nothing to enumerate, and callers rely on the accurate status —
    `POST /api/agent/v2/construct-query` returns 403 for a metric whose card the caller cannot
    read, and `llm-shape/export-query-for-llm` suppresses its EDN fallback on one.

  The axes do not trade off against each other: a collapsed denial is still audited, so the
  refusal stays silent to the agent and visible to the audit log.

  Either way the refusal is recorded in [[*last-lookup-refused?*]] for callers that need to know
  a denial happened without depending on the status."
  [{:keys [audited? collapse-denial?]} row]
  (cond
    (nil? row)              nil
    api/*current-user-id*   (try
                              (if (and audited? resolve.mp/*audit-refusals?*)
                                (api/read-check row)
                                (do (api/check-403 (mi/can-read? row)) row))
                              (catch clojure.lang.ExceptionInfo e
                                (if (= 403 (:status-code (ex-data e)))
                                  (do (reset! *last-lookup-refused?* true)
                                      (when-not collapse-denial? (throw e)))
                                  (throw e))))
    :else                   row))

(defn read-checked
  "Wrap `store` so every lookup permission-checks its row when `api/*current-user-id*` is bound.
  Symmetric across all six `ContentStore` methods; see [[permission-checked]] for what a refusal
  costs on each. `audited-by-id?` audits the `-by-id` refusals too."
  ([store] (read-checked store false))
  ([store audited-by-id?]
   (let [by-eid {:audited? true            :collapse-denial? false}
         by-id  {:audited? audited-by-id?  :collapse-denial? true}]
     (reify resolve.mp/ContentStore
       (card-by-entity-id    [_ eid] (permission-checked by-eid (resolve.mp/card-by-entity-id    store eid)))
       (measure-by-entity-id [_ eid] (permission-checked by-eid (resolve.mp/measure-by-entity-id store eid)))
       (segment-by-entity-id [_ eid] (permission-checked by-eid (resolve.mp/segment-by-entity-id store eid)))
       (card-by-id           [_ id]  (permission-checked by-id  (resolve.mp/card-by-id           store id)))
       (measure-by-id        [_ id]  (permission-checked by-id  (resolve.mp/measure-by-id        store id)))
       (segment-by-id        [_ id]  (permission-checked by-id  (resolve.mp/segment-by-id        store id)))))))

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

(defn- runnable-normalized-query
  "`resolved` normalized, when the current user may run it and see every table and field it
  names: the query processor's own run check (a saved question authorizes through its collection, native
  SQL through database-wide native access), then a per-table check on the ids the export
  resolves to names and a column-sandbox check on its field refs. The saved questions the
  query reads from are checked first with the caller's audit polarity, since the run check
  refuses them without a trail. Measure / segment refs are not checked here; the stores gate
  those with the caller's audit polarity.

  Nil when they may not. Normalizing is the first thing the check does, so the result comes back
  rather than leaving the export to repeat it."
  [audited? resolved]
  (try
    (let [normalized                 (lib-be/normalize-query resolved)
          database-id                (:database normalized)
          {:keys [table card field]} (exported-entity-ids normalized)]
      (when (and (pos-int? database-id)
                 (every? #(readable? audited? :model/Card %) card)
                 ;; throw on a calculation failure so only a denial reads as false
                 (query-perms/can-run-query? normalized false true))
        (let [field-table (metabot.perms/field-id->table-id field)
              table-ids   (into (set table) (vals field-table))]
          (when (and (= table-ids (metabot.perms/queryable-table-ids table-ids))
                     (sandbox-visible-fields? field-table))
            normalized))))
    (catch Exception e
      (log/debugf "Omitting a query that could not be permission-checked: %s" (ex-message e))
      nil)))

(defn- cached-pass
  "Memoize an allowed gate result on the agent's memory for the rest of the turn: the check
  preprocesses the query in full, and the same conversation query is usually read more than once.
  Refusals are not kept - that is where the audit trail lives, and it has to fire on every read.
  Outside an agent run there is nowhere to cache, so the check just runs."
  [cache-key f]
  (if-let [memory-atom shared/*memory-atom*]
    (or (get-in @memory-atom [:query-gate-cache cache-key])
        (let [result (f)]
          (when result
            (swap! memory-atom assoc-in [:query-gate-cache cache-key] result))
          result))
    (f)))

(defn query-for-export
  "`[query mp]` for [[metabase.metabot.tools.shared.llm-shape/export-query-for-llm]] when the
  current user may run `query`, else nil. The query comes back normalized with a provider over
  its database; one carrying no `:database` passes through untouched and without a provider,
  since it only ever pprints. With `audited?` the saved-question refusals are audited; for
  client-supplied queries, where the ids are the caller's own. Run permission is the whole rule:
  reading the database is not enough, and a saved question the user can read authorizes a query
  over a database they cannot. A database that no longer exists passes, since there is no
  metadata behind it to leak; one we can't resolve does not."
  [query audited?]
  (if-not (and (map? query) (:database query))
    [query nil]
    (cached-pass
     [query audited?]
     (fn []
       (when-let [resolved (resolve-effective-database query)]
         (if (metabot.db/database-exists? (:database resolved))
           (when-let [normalized (runnable-normalized-query audited? resolved)]
             [normalized (lib-be/application-database-metadata-provider (:database normalized))])
           [resolved nil]))))))
