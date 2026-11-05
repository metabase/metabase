(ns metabase.metabot.metadata-perms
  (:require
   [metabase.api.common :as api]
   [metabase.metabot.db :as metabot.db]
   [metabase.metrics.core :as metrics]
   [metabase.models.interface :as mi]
   [metabase.permissions.core :as perms]
   [metabase.util :as u]
   [metabase.util.log :as log]))

(set! *warn-on-reflection* true)

#_{:clj-kondo/ignore [:metabase/discourage-dynamic-vars]}
(def ^:dynamic *cache*
  "Cache atom bound by [[with-cache]], or nil to read through to the app DB on every call."
  nil)

(defmacro with-cache
  "Memoize this namespace's lookups for the duration of `body`. Nesting reuses the enclosing cache."
  {:style/indent 0}
  [& body]
  `(binding [*cache* (or *cache* (atom {}))]
     ~@body))

(defn- memoized
  [k ids compute absent]
  (let [ids     (set ids)
        cache   *cache*
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
            metabot.db/tables-by-id
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
  "Returns the subset of `table-ids` the current user may run queries against."
  [table-ids]
  (permitted-table-ids :queryable-table mi/can-query? table-ids))

(defn- data-accessible?
  [table]
  (perms/user-has-permission-for-table? api/*current-user-id*
                                        :perms/view-data :unrestricted
                                        (:db_id table) (:id table)))

(defn data-accessible-table-ids
  "Returns the subset of `table-ids` the current user has unrestricted view-data access to."
  [table-ids]
  (permitted-table-ids :data-accessible-table data-accessible? table-ids))

(defn- row-restricted-by-db
  "`{table-id restricted?}` for one database's `tables`, computed from a single
  [[perms/data-access-token]] call. Impersonation and routing are per-database, not per-table, so
  batching by database avoids recomputing them once per table. Fails closed on error."
  [db-id tables]
  (let [ids (into #{} (map :id) tables)
        restrict-all (into {} (map (fn [id] [id true])) ids)]
    (try
      (let [token (perms/data-access-token {:database-id db-id :table-ids ids})
            db-wide-restricted? (boolean (or (:impersonation token) (:routing token)))]
        (into {} (map (fn [id] [id (or db-wide-restricted? (contains? (:sandbox token) id))])) ids))
      (catch Exception e
        (log/debugf e "Restriction probe failed for database %d, falling back per table" db-id)
        ;; Impersonation and routing are the realistic throw sources (a missing user attribute),
        ;; and both are database-wide -- a single cheap probe with `:table-ids #{}` (which skips
        ;; the per-table sandbox lookup entirely) tells us whether that's the case, without turning
        ;; every failure into an O(table count) retry.
        (try
          (let [{:keys [impersonation routing]} (perms/data-access-token {:database-id db-id :table-ids #{}})]
            (if (or impersonation routing)
              restrict-all
              ;; The probe succeeded with no impersonation/routing, so the original failure must be
              ;; an isolated per-table sandbox problem -- retry per table so one broken table
              ;; doesn't drag its unrelated siblings down with it.
              (into {}
                    (map (fn [id]
                           [id (try
                                 (boolean (seq (perms/data-access-token {:database-id db-id :table-ids #{id}})))
                                 (catch Exception e
                                   (log/debugf e "Restriction probe failed for table %d, defaulting to restricted" id)
                                   true))]))
                    ids)))
          (catch Exception e
            (log/debugf e "Restriction probe failed for database %d, defaulting to restricted" db-id)
            restrict-all))))))

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
  "Returns `{table-id #{allowed-field-id}}` for the column-sandboxed subset of `table-ids`."
  [table-ids]
  (->> (memoized :sandbox-fields table-ids
                 #(metrics/sandbox-restricted-fields (set %))
                 ::unrestricted)
       (into {} (remove #(= ::unrestricted (val %))))))

(defn field-id->table-id
  "Returns a `{field-id table-id}` map for the given `field-ids`."
  [field-ids]
  (->> (memoized :field-table field-ids
                 metabot.db/field-table-ids
                 nil)
       (into {} (remove #(nil? (val %))))))

(defn- column-table-id
  "The table `column` belongs to: the canonical owner of its real Field ID (looked up in
   `field-id->table-id`), or its own claimed `:table-id` for a virtual column with no Field ID."
  [field-id->table-id column]
  (let [field-id (u/id column)]
    (if (pos-int? field-id)
      (get field-id->table-id field-id)
      (:table-id column))))

(defn- field-visible?
  [sandbox-restricted-ids visible-table-ids table-id field-id]
  (and (contains? visible-table-ids table-id)
       (if-let [allowed-field-ids (get sandbox-restricted-ids table-id)]
         (contains? allowed-field-ids field-id)
         true)))

(defn- caller-joined?
  [explicit-joins-caller-performed? column]
  (or (= :source/implicitly-joinable (:lib/source column))
      (and explicit-joins-caller-performed?
           (= :source/joins (:lib/source column)))))

(defn- referenced-field-visible?
  [{:keys [field-id->table-id sandbox-restricted-ids]} visible-table-ids field-id]
  (when-let [table-id (get field-id->table-id field-id)]
    (field-visible? sandbox-restricted-ids visible-table-ids table-id field-id)))

(defn- column-visible?
  [{:keys [field-id->table-id sandbox-restricted-ids queryable-table-ids accessible-table-ids
           explicit-joins-caller-performed?] :as ctx}
   {:keys [fk-field-id] :as column}]
  (let [field-id (u/id column)
        table-id (column-table-id field-id->table-id column)]
    (and (or (and (not (pos-int? field-id)) (not (pos-int? table-id)))
             (and (pos-int? table-id)
                  (field-visible? sandbox-restricted-ids
                                  (if (caller-joined? explicit-joins-caller-performed? column)
                                    queryable-table-ids
                                    accessible-table-ids)
                                  table-id
                                  field-id)))
         (or (nil? fk-field-id)
             (referenced-field-visible? ctx accessible-table-ids fk-field-id)))))

(defn permission-filter-columns
  "Remove columns hidden by Table or sandbox permissions and hide inaccessible FK targets on retained columns."
  ([columns] (permission-filter-columns columns nil))
  ([columns {:keys [explicit-joins-caller-performed?]}]
   (let [columns              (vec columns)
         column-field-ids     (into #{} (comp (map u/id) (filter pos-int?)) columns)
         referenced-field-ids (into #{}
                                    (comp (mapcat (juxt :fk-field-id :fk-target-field-id))
                                          (filter some?))
                                    columns)
         field-id->table-id   (let [field-ids (into column-field-ids referenced-field-ids)]
                                (when (seq field-ids)
                                  (field-id->table-id field-ids)))
         table-ids            (into #{}
                                    (filter pos-int?)
                                    (concat (map (partial column-table-id field-id->table-id) columns)
                                            (vals field-id->table-id)))
         queryable-table-ids  (queryable-table-ids table-ids)
         accessible-table-ids (data-accessible-table-ids table-ids)
         ctx {:field-id->table-id                field-id->table-id
              :sandbox-restricted-ids            (sandbox-restricted-fields table-ids)
              :queryable-table-ids               queryable-table-ids
              :accessible-table-ids              accessible-table-ids
              :explicit-joins-caller-performed?  explicit-joins-caller-performed?}]
     (->> columns
          (filter (partial column-visible? ctx))
          (mapv (fn [{:keys [fk-target-field-id] :as column}]
                  (cond-> (if-let [table-id (get field-id->table-id (u/id column))]
                            (assoc column :table-id table-id)
                            column)
                    (and fk-target-field-id
                         (not (referenced-field-visible? ctx queryable-table-ids fk-target-field-id)))
                    (dissoc :fk-target-field-id))))))))
