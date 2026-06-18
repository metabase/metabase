(ns metabase.indexes.reconcile
  "Reconcile Metabase-managed index hints (TableIndex rows) with the indexes physically present in the warehouse.
  Shared by the read API and the transform-run status verification: we create a managed index, then match it against
  `driver/fetch-table-indexes` to confirm it landed."
  (:require
   [metabase.driver :as driver]
   [metabase.util.log :as log]))

(set! *warn-on-reflection* true)

(def unnamed-inline-kinds
  "Index kinds with no physical name (warehouse `:name` is nil); matched by kind + key columns instead."
  #{:sortkey :order-by :distkey})

(defn match-key
  "Join key for a warehouse index map: `[:kind key-columns]` for unnamed-inline kinds, else its `:name`."
  [{:keys [kind key-columns] index-name :name}]
  (if (contains? unnamed-inline-kinds kind)
    [kind key-columns]
    index-name))

(defn managed-match-key
  "The [[match-key]] for a managed TableIndex row, from its stored structured definition and index name."
  [{:keys [index_name structured]}]
  (match-key {:kind        (:kind structured)
              :name        index_name
              :key-columns (mapv :name (:columns structured))}))

(def ^:private classical-kinds
  #{:btree :hash :gin :gist :brin :spgist :fulltext :spatial :clustered :nonclustered :columnstore})

(defn warehouse->structured
  "Best-effort `::schema/index-structured` for an unmanaged warehouse index, or nil if it can't be represented (a
  Postgres expression-only index has no column names; `::schema/index-structured` needs at least one named column).
  Lossy by design: physical-only detail (uniqueness aside) and a sortkey's compound/interleaved style aren't
  recoverable from the catalog, so this only runs for DBA indexes we don't manage."
  [{:keys [kind key-columns include-columns access-method is-unique] index-name :name}]
  (let [columns (into [] (keep #(when % {:name %})) key-columns)]
    (when (seq columns)
      (case kind
        :sortkey    {:kind :sortkey :style :compound :columns columns}
        :order-by   {:kind :order-by :columns columns}
        :skip-index {:kind :skip-index :name index-name :columns columns :type (keyword access-method)}
        (when (contains? classical-kinds kind)
          (cond-> {:kind kind :name index-name :columns columns}
            (seq include-columns) (assoc :include (vec include-columns))
            is-unique             (assoc :unique true)))))))

(defn- managed-entry
  "A managed TableIndex row as a merged-list entry: its stored definition plus lifecycle, flagged managed."
  [row]
  (-> (select-keys row [:id :transform_id :structured :status :error_message
                        :created_by :created_at :updated_at :last_executed_at])
      (assoc :metabase_managed true)))

(defn- warehouse-entry
  "An unmanaged (DBA) warehouse index as a merged-list entry, or nil if its definition can't be represented. Owned by
  `transform-id` (its target table is that transform's), live so `:succeeded`, and missing the app-DB bookkeeping."
  [transform-id wh]
  (when-let [structured (warehouse->structured wh)]
    {:metabase_managed false
     :transform_id     transform-id
     :structured       structured
     :status           :succeeded}))

(defn merge-indexes
  "Managed TableIndex `rows` for `transform-id` merged with the unmanaged indexes physically present in the warehouse.
  Managed entries render from their stored `:structured`; an unmanaged (DBA) index is converted best-effort and
  flagged `:metabase_managed false`. A managed index that also exists in the warehouse is matched, so it's listed
  once -- as the managed entry."
  [transform-id rows warehouse-maps]
  (let [managed-keys (into #{} (map managed-match-key) rows)
        unmanaged    (->> warehouse-maps
                          (remove #(contains? managed-keys (match-key %)))
                          (keep #(warehouse-entry transform-id %)))]
    (into (mapv managed-entry rows) unmanaged)))

(defn fetch-warehouse-indexes
  "Physical indexes on `table-name` (`schema`) in `database` via `driver/fetch-table-indexes`. Returns `[]` if the
  driver can't introspect indexes or the warehouse is unreachable, so callers degrade instead of erroring."
  [database schema table-name]
  (try
    (vec (driver/fetch-table-indexes (:engine database) database schema table-name))
    (catch Throwable t
      (log/warnf t "fetch-table-indexes failed for %s.%s" schema table-name)
      [])))
