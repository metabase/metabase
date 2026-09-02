(ns metabase.metabot.metadata-perms
  "Memo for the app-DB reads Metabot's metadata permission gates repeat within one agent turn.

  Three questions get asked over and over: how far into these tables may the current user reach, which
  of them restrict columns by sandbox, and which table does this field belong to. A single
  `read_resource metabase://table/<id>/fields` asks all three once for the table's own columns, once to
  find its FK neighbours, and once per expanded neighbour.

  Answers are memoized per id in an atom bound by [[with-cache]]. Like
  `metabase.permissions.core/prime-table-perms-cache`, which these functions build on, the memo is a
  point-in-time snapshot: a permission written after a check has run is not seen by later checks in the
  same scope. That widens no window — the permission cache these answers derive from is bound by
  `with-current-user` and already spans the whole streamed turn. When no cache is bound every call
  reads through to the app DB, so callers outside an agent turn behave exactly as they did before."
  (:require
   [metabase.api.common :as api]
   [metabase.metrics.core :as metrics]
   [metabase.models.interface :as mi]
   [metabase.permissions.core :as perms]
   [metabase.premium-features.core :refer [defenterprise]]
   [metabase.util.log :as log]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(def ^:dynamic *cache*
  "Atom of `{cache-key {id answer}}`, or nil to read through to the app DB on every call.

  Never give this a non-nil top-level value: a cache that outlives the scope [[with-cache]] establishes
  would answer from a snapshot taken before whatever changed the permissions."
  nil)

(defmacro with-cache
  "Memoize this namespace's lookups for the duration of `body`. Nesting reuses the enclosing cache."
  {:style/indent 0}
  [& body]
  `(binding [*cache* (or *cache* (atom {}))]
     ~@body))

(defn- memoized
  "Answer `ids` from cache `k`, computing whatever is missing with `(compute missing-ids)`.

  `compute` returns an id->answer map that may omit ids it found nothing for; `absent` is the answer
  stored for those, so a miss is never recomputed. Returns an id->answer map covering every id in
  `ids`."
  [k ids compute absent]
  (let [ids     (set ids)
        cache   *cache*
        ;; `*is-superuser?*` and not just the user id: `request/as-admin` keeps the id and flips the flag.
        k       [api/*current-user-id* api/*is-superuser?* k]
        known   (if cache (get @cache k {}) {})
        missing (into #{} (remove #(contains? known %)) ids)
        fresh   (when (seq missing)
                  (let [computed (compute missing)]
                    (into {} (map (fn [id] [id (get computed id absent)])) missing)))]
    (when (and cache (seq fresh))
      (swap! cache update k merge fresh))
    (select-keys (merge known fresh) ids)))

(defn- table-rows
  [table-ids]
  (memoized :table-row table-ids
            (fn [ids] (t2/select-fn->fn :id identity :model/Table :id [:in ids]))
            nil))

(defn- permitted-table-ids
  [k pred table-ids]
  (->> (memoized k table-ids
                 (fn [ids]
                   (let [tables (into [] (keep (table-rows ids)) ids)]
                     (perms/prime-table-perms-cache {:table-ids (into #{} (map :id) tables)})
                     (into {} (comp (filter pred) (map (juxt :id (constantly true)))) tables)))
                 false)
       (into #{} (keep (fn [[id permitted?]] (when permitted? id))))))

(defn queryable-table-ids
  "The subset of `table-ids` the current user may run queries against. A table id with no
  `metabase_table` row is not queryable, so a caller that requires every id it passed in can compare
  sets and fail closed.

  The bar for a table the caller would have to join or query themselves to reach. Not [[mi/can-read?]],
  which a `manage-table-metadata` grant satisfies with `view-data` still `:blocked`."
  [table-ids]
  (permitted-table-ids :queryable-table mi/can-query? table-ids))

(defn- data-accessible?
  [table]
  (perms/user-has-permission-for-table? api/*current-user-id*
                                        :perms/view-data :unrestricted
                                        (:db_id table) (:id table)))

(defn data-accessible-table-ids
  "The subset of `table-ids` the current user has `:perms/view-data :unrestricted` on. The bar for a
  table that an entity the caller may already read selects from: demanding `create-queries` on top
  would break a card published as a permissions boundary."
  [table-ids]
  (permitted-table-ids :data-accessible-table data-accessible? table-ids))

(defenterprise row-restricted-by-impersonation?
  "Whether connection impersonation narrows the current user's rows in `db-id`.

  This v63 adapter deliberately bypasses feature availability when the EE implementation is
  present: a license-check failure must not make a configured restriction disappear."
  metabase-enterprise.impersonation.util
  [_db-id]
  false)

(defenterprise row-restricted-by-routing?
  "Whether database routing sends the current user from router `db-id` to a destination database.

  Like [[row-restricted-by-impersonation?]], this remains active when the EE implementation is
  present even if the feature check is temporarily unavailable."
  metabase-enterprise.database-routing.common
  [_db-id]
  false)

(defn- sandboxed-table-ids
  [table-ids]
  (if api/*is-superuser?*
    #{}
    (into #{} (comp (map :table_id) (filter table-ids)) (perms/sandboxes-for-user))))

(defn- row-restricted-by-db
  "`{table-id restricted?}` for one database's `tables`. Impersonation and routing are
  database-wide; sandboxing is per table. Fails closed for the affected database on error."
  [db-id tables]
  (let [ids (into #{} (map :id) tables)
        restrict-all (into {} (map (fn [id] [id true])) ids)]
    (try
      (let [sandboxed             (sandboxed-table-ids ids)
            db-wide-restricted?  (or (row-restricted-by-impersonation? db-id)
                                     (row-restricted-by-routing? db-id))]
        (into {} (map (fn [id] [id (or db-wide-restricted? (contains? sandboxed id))])) ids))
      (catch Exception e
        (log/debugf e "Restriction probe failed for database %d, defaulting to restricted" db-id)
        restrict-all))))

(defn row-restricted-table-ids
  "Returns the subset of `table-ids` whose current user's row access is narrowed by sandboxing,
  connection impersonation, or database routing. Fails closed: a table whose restriction lens
  can't be resolved (an attribute needed to compute it is missing) is included."
  [table-ids]
  (->> (memoized :row-restricted-table table-ids
                 (fn [ids]
                   (let [tables (into [] (keep (table-rows ids)) ids)]
                     (into {} (mapcat (fn [[db-id db-tables]] (row-restricted-by-db db-id db-tables)))
                           (group-by :db_id tables))))
                 true)
       (into #{} (keep (fn [[id restricted?]] (when restricted? id))))))

(defn sandbox-restricted-fields
  "`{table-id #{allowed-field-id}}` for the column-sandboxed subset of `table-ids`. A table absent from
  the result carries no column restriction."
  [table-ids]
  (->> (memoized :sandbox-fields table-ids
                 #(metrics/sandbox-restricted-fields (set %))
                 ::unrestricted)
       (into {} (remove #(= ::unrestricted (val %))))))

(defn field-id->table-id
  "`{field-id table-id}` for `field-ids`. A field id with no `metabase_field` row is absent from the
  result."
  [field-ids]
  (->> (memoized :field-table field-ids
                 (fn [ids] (t2/select-fn->fn :id :table_id [:model/Field :id :table_id] :id [:in ids]))
                 nil)
       (into {} (remove #(nil? (val %))))))
