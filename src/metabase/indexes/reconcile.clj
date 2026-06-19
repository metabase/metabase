(ns metabase.indexes.reconcile
  "Reconcile Metabase-managed index hints (TableIndex rows) with the indexes physically present in the warehouse.
  Shared by the read API and the transform-run status verification: we create a managed index, then match it against
  `driver/fetch-table-indexes` to confirm it landed."
  (:require
   [metabase.driver :as driver]
   [metabase.util.log :as log]))

(set! *warn-on-reflection* true)

(def unnamed-inline-kinds
  "Index kinds with no physical name (warehouse `:name` is nil); matched by kind + key columns instead. `:distkey` is
  excluded until a driver fetches one -- it stores a single `:column`, not `:columns`, so it can't be column-keyed yet."
  #{:sortkey :order-by})

(defn match-key
  "Join key for a warehouse index map: `[:kind key-columns]` for unnamed-inline kinds, else its `:name`. Kind-specific
  qualifiers (a sortkey's compound/interleaved style) are deliberately not in the key -- a hint matches its physical
  counterpart on identity, not on every attribute."
  [{:keys [kind key-columns] nm :name}]
  (if (contains? unnamed-inline-kinds kind)
    [kind key-columns]
    nm))

(defn index-name
  "The physical index name for a structured definition: a named kind's own `:name`, else a stable name from its
  `:kind` (so a transform holds at most one sortkey/order-by/etc, enforced by the unique constraint). The canonical
  rule -- used on create to populate `:index_name`, and to locate that row again when its DDL fails."
  [structured]
  (or (:name structured) (name (:kind structured))))

(defn managed-match-key
  "The [[match-key]] for a managed TableIndex row, from its stored structured definition and index name."
  [{:keys [index_name structured]}]
  (match-key {:kind        (:kind structured)
              :name        index_name
              :key-columns (mapv :name (:columns structured))}))

(defn- observed-fields
  "The observation fields of a warehouse `::table-index` map, snake-cased for the API."
  [wh]
  {:name              (:name wh)
   :kind              (:kind wh)
   :key_columns       (vec (:key-columns wh))
   :include_columns   (vec (:include-columns wh))
   :is_unique         (boolean (:is-unique wh))
   :is_primary        (boolean (:is-primary wh))
   :is_valid          (boolean (:is-valid wh))
   :partial_predicate (:partial-predicate wh)
   :access_method     (:access-method wh)})

(defn- declared-fields
  "A managed hint not (yet) in the warehouse, projected from its declared `:structured` into the observation fields."
  [{:keys [structured]}]
  {:name              (or (:name structured) (some-> (:kind structured) name))
   :kind              (:kind structured)
   :key_columns       (mapv :name (:columns structured))
   :include_columns   (vec (:include structured))
   :is_unique         (boolean (:unique structured))
   :is_primary        false
   :is_valid          false
   :partial_predicate nil
   :access_method     nil})

(defn- request-fields
  "Bookkeeping carried on a managed entry, under `:request`: lifecycle plus the editable structured definition."
  [row]
  {:request (select-keys row [:id :status :structured :error_message
                              :created_by :created_at :updated_at :last_executed_at])})

(defn merge-indexes
  "Reality-first merged index list. Every index physically present in the warehouse is listed, flagged
  `:metabase_managed` when a TableIndex `row` matches it (by [[match-key]]) and carrying that row's `:request`
  bookkeeping. A managed hint not yet present (pending/failed) is appended, projected from its declared `:structured`."
  [rows warehouse-maps]
  (let [by-key       (into {} (map (juxt managed-match-key identity)) rows)
        present-keys (into #{} (map match-key) warehouse-maps)
        present      (for [wh warehouse-maps
                           :let [row (get by-key (match-key wh))]]
                       (merge (observed-fields wh)
                              {:metabase_managed     (some? row)
                               :present_in_warehouse true}
                              (when row (request-fields row))))
        absent       (for [row   rows
                           :when (not (contains? present-keys (managed-match-key row)))]
                       (merge (declared-fields row)
                              {:metabase_managed     true
                               :present_in_warehouse false}
                              (request-fields row)))]
    (into (vec present) absent)))

(defn fetch-warehouse-indexes
  "Physical indexes on `table-name` (`schema`) in `database` via `driver/fetch-table-indexes`. Returns `[]` if the
  driver can't introspect indexes or the warehouse is unreachable, so callers degrade instead of erroring."
  [database schema table-name]
  (try
    (vec (driver/fetch-table-indexes (:engine database) database schema table-name))
    (catch Throwable t
      (log/warnf t "fetch-table-indexes failed for %s.%s" schema table-name)
      [])))
