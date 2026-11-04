(ns metabase.models.serialization.resolve.default
  "Database-backed implementations of the serdes resolver protocols.

  These are the default resolvers used during normal serdes export/import
  against the application database."
  (:require
   [metabase.models.db :as models.db]
   [metabase.models.serialization.path :as serdes.path]
   [metabase.models.serialization.resolve :as resolve]
   [metabase.util.log :as log]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(def query-batch-size
  "Maximum number of ids per `:in` clause, to stay under database parameter limits."
  1000)

(defn- in-batches
  "The rows `f` returns for each `query-batch-size` batch of the distinct `xs`."
  [f xs]
  (into [] (comp (partition-all query-batch-size) (mapcat f)) (distinct xs)))

(defn- in-batch-pairs
  "The rows `f` returns for each pair of `query-batch-size` batches of the distinct `xs` and `ys`."
  [f xs ys]
  (vec (for [x-batch (partition-all query-batch-size (distinct xs))
             y-batch (partition-all query-batch-size (distinct ys))
             row     (f x-batch y-batch)]
         row)))

(defn- index-first
  "The map from `(key-fn row)` to `(val-fn row)` for `rows`, keeping the first row of each key."
  [key-fn val-fn rows]
  (reduce (fn [m row]
            (let [k (key-fn row)]
              (cond-> m
                (not (contains? m k)) (assoc k (val-fn row)))))
          {}
          rows))

;;; ============================================================
;;; Export functions
;;; ============================================================

(defn- portable-id
  "The portable id of `entity`: its `entity_id` for a top-level model, its path ids for a nested one."
  [model-name entity]
  (let [path (mapv :id (serdes.path/generate-path model-name entity))]
    (if (= (count path) 1)
      (first path)
      path)))

(defn export-fks
  "The portable ids of the `model` rows with `ids`."
  [model ids]
  (let [pk         (first (t2/primary-keys model))
        model-name (name model)]
    (into {}
          (map (fn [entity] [(get entity pk) (portable-id model-name entity)]))
          (in-batches #(models.db/entities-by-own-pks model (vec %)) ids))))

(defn export-fks-keyed
  "The `field` values of the `model` rows with `ids`."
  [model field ids]
  (into {}
        (map (juxt :id field))
        (in-batches #(models.db/entity-fields-by-ids model field (vec %)) ids)))

(defn export-tables
  "The `[db-name schema table-name]` references of the Tables with `table-ids`."
  [table-ids]
  (let [tables   (in-batches #(models.db/table-ref-rows (vec %)) table-ids)
        db-names (into {}
                       (map (juxt :id :name))
                       (in-batches #(models.db/database-names-by-ids (vec %)) (map :db_id tables)))]
    (into {}
          (map (fn [{:keys [id db_id schema name]}] [id [(db-names db_id) schema name]]))
          tables)))

(defn- field-rows-with-ancestors
  "The map from id to row of the Fields with `field-ids` and all their ancestors, fetched one nesting level per query."
  [field-ids]
  (loop [rows {} pending (distinct field-ids)]
    (if (empty? pending)
      rows
      (let [fetched (in-batches #(models.db/field-parent-rows (vec %)) pending)
            rows    (into rows (map (juxt :id identity)) fetched)]
        (recur rows (into [] (comp (keep :parent_id) (remove rows) (distinct)) fetched))))))

(defn- ancestry
  "The rows of the Field with `field-id` and its ancestors in `rows`, root first."
  [rows field-id]
  (loop [id field-id chain ()]
    (if-let [row (get rows id)]
      (recur (:parent_id row) (conj chain row))
      (vec chain))))

(defn export-fields
  "The `[db-name schema table-name & field-names]` references of the Fields with `field-ids`, their Tables resolved
  by `resolver`."
  [resolver field-ids]
  (let [rows   (field-rows-with-ancestors field-ids)
        chains (into {}
                     (keep (fn [id] (when (contains? rows id) [id (ancestry rows id)])))
                     (distinct field-ids))
        tables (resolve/export-tables resolver (distinct (map (comp :table_id first) (vals chains))))]
    (into {}
          (keep (fn [[id chain]]
                  (when-let [table-ref (get tables (:table_id (first chain)))]
                    [id (into table-ref (map :name) chain)])))
          chains)))

;;; ============================================================
;;; Import functions
;;; ============================================================

(defn- entity-id-of
  "The entity id a portable id names: itself, or the last element of a nested model's path ids."
  [eid]
  (if (vector? eid) (last eid) eid))

(defn import-fks
  "The primary keys of the `model` rows with portable ids `eids`."
  [model eids]
  (let [pk    (first (t2/primary-keys model))
        found (index-first :entity_id pk (in-batches #(models.db/pks-by-entity-ids model pk (vec %))
                                                     (map entity-id-of eids)))]
    (into {}
          (keep (fn [eid] (when-some [id (get found (entity-id-of eid))] [eid id])))
          eids)))

(defn import-fks-keyed
  "The primary keys of the `model` rows whose `field` is one of `values`."
  [model field values]
  (let [pk (first (t2/primary-keys model))]
    (index-first field pk (in-batches #(models.db/pks-by-field-values model pk field (vec %)) values))))

(defn- missing-inputs
  "The distinct `inputs` that `found` has no entry for."
  [found inputs]
  (into [] (comp (distinct) (remove #(contains? found %))) inputs))

(defn import-users
  "The ids of the Users with `emails`, created as inactive Users when missing, looked up through `resolver`."
  [resolver emails]
  (let [found       (resolve/import-fks-keyed resolver :model/User :email emails)
        synthesize! (clojure.core/resolve 'metabase.users.models.user/serdes-synthesize-user!)]
    (into found
          (map (fn [email] [email (:id (synthesize! {:email email :is_active false}))]))
          (missing-inputs found emails))))

(defn import-databases
  "The ids of the Databases named `db-names`, created as stub Databases when missing."
  [db-names]
  (let [found (index-first :name :id (in-batches #(models.db/database-ids-by-names (vec %)) db-names))]
    (into found
          (map (fn [db-name] [db-name (models.db/insert-stub-database! db-name)]))
          (missing-inputs found db-names))))

(defn import-tables
  "The ids of the Tables at `[db-name schema table-name]` `paths`, created as inactive Tables when missing, their
  Databases resolved by `resolver`."
  [resolver paths]
  (let [paths  (distinct paths)
        db-ids (resolve/import-databases resolver (map first paths))
        found  (index-first (juxt :db_id :schema :name)
                            :id
                            (in-batch-pairs #(models.db/tables-by-names (vec %1) (vec %2))
                                            (vals db-ids)
                                            (map #(nth % 2) paths)))]
    (into {}
          (map (fn [[db-name schema table-name :as path]]
                 (let [db-id (get db-ids db-name)]
                   [path (or (get found [db-id schema table-name])
                             (models.db/insert-inactive-table! db-id schema table-name))])))
          paths)))

(defn- import-field-path
  "The `[index field-id]` of the Field at `field-names` under the Table with `table-id`, creating inactive Fields for
  the missing nodes and recording them in `index`, a map from `[table-id parent-id name]` to Field id."
  [index table-id field-names]
  (reduce (fn [[index parent-id] field-name]
            (let [k [table-id parent-id field-name]]
              (if-let [field-id (get index k)]
                [index field-id]
                (let [field-id (models.db/insert-inactive-field! table-id parent-id field-name)]
                  [(assoc index k field-id) field-id]))))
          [index nil]
          field-names))

(defn import-fields
  "The ids of the Fields at `[db-name schema table-name & field-names]` `paths`, created as inactive Fields when
  missing, their Tables resolved by `resolver`."
  [resolver paths]
  (let [paths     (distinct paths)
        table-ids (resolve/import-tables resolver (map #(subvec (vec %) 0 3) paths))
        index     (index-first (juxt :table_id :parent_id :name)
                               :id
                               (in-batch-pairs #(models.db/fields-by-names (vec %1) (vec %2))
                                               (vals table-ids)
                                               (mapcat #(drop 3 %) paths)))]
    (second
     (reduce (fn [[index found] path]
               (let [[index field-id] (import-field-path index (get table-ids (subvec (vec path) 0 3)) (drop 3 path))]
                 [index (assoc found path field-id)]))
             [index {}]
             paths))))

;;; ============================================================
;;; Resolver constructors
;;; ============================================================

(def default-export-resolver
  "A stateless database-backed export resolver."
  (reify resolve/SerdesExportResolver
    (export-fks       [_ model ids]       (export-fks model ids))
    (export-fks-keyed [_ model field ids] (export-fks-keyed model field ids))
    (export-tables    [_ table-ids]       (export-tables table-ids))
    (export-fields    [this field-ids]    (export-fields this field-ids))))

(def default-import-resolver
  "A stateless database-backed import resolver."
  (reify resolve/SerdesImportResolver
    (import-fks       [_ model eids]         (import-fks model eids))
    (import-fks-keyed [_ model field values] (import-fks-keyed model field values))
    (import-users     [this emails]          (import-users this emails))
    (import-databases [_ db-names]           (import-databases db-names))
    (import-tables    [this paths]           (import-tables this paths))
    (import-fields    [this paths]           (import-fields this paths))))

(def lenient-import-resolver
  "A stateless database-backed import resolver that resolves a missing FK target to nil instead of leaving it out."
  (reify resolve/SerdesImportResolver
    (import-fks [_ model eids]
      (let [found (resolve/import-fks default-import-resolver model eids)]
        (into found
              (map (fn [eid]
                     (log/warnf "Failed to import FK: could not find %s %s" (name model) (pr-str eid))
                     [eid nil]))
              (missing-inputs found eids))))
    (import-fks-keyed [_ model field values] (resolve/import-fks-keyed default-import-resolver model field values))
    (import-users     [_ emails]             (resolve/import-users default-import-resolver emails))
    (import-databases [_ db-names]           (resolve/import-databases default-import-resolver db-names))
    (import-tables    [_ paths]              (resolve/import-tables default-import-resolver paths))
    (import-fields    [_ paths]              (resolve/import-fields default-import-resolver paths))))

(defn- cached-lookup
  "The resolutions of `inputs`, served from `cache` under `prefix` where present and otherwise fetched with `f`, whose
  results are stored in `cache`."
  [cache prefix inputs f]
  (let [inputs  (distinct inputs)
        missing (remove #(contains? @cache [prefix %]) inputs)]
    (when (seq missing)
      (swap! cache into (map (fn [[k v]] [[prefix k] v])) (f missing)))
    (let [cached @cache]
      (into {}
            (keep (fn [k] (let [ck [prefix k]] (when (contains? cached ck) [k (get cached ck)]))))
            inputs))))

(defn cached-export-resolver
  "Returns a database-backed export resolver with memoized lookups; Field lookups are not memoized, since they are
  unbounded in number and rarely repeat."
  []
  (let [cache (atom {})]
    (reify resolve/SerdesExportResolver
      (export-fks       [_ model ids]       (cached-lookup cache [:fk model] ids #(export-fks model %)))
      (export-fks-keyed [_ model field ids] (cached-lookup cache [:fk-keyed model field] ids #(export-fks-keyed model field %)))
      (export-tables    [_ table-ids]       (cached-lookup cache [:table] table-ids export-tables))
      (export-fields    [this field-ids]    (export-fields this field-ids)))))

(defn cached-import-resolver
  "Returns a database-backed import resolver with memoized lookups, dropped by [[resolve/reset-cache!]]."
  []
  (let [cache (atom {})]
    (reify
      resolve/SerdesImportResolver
      (import-fks       [_ model eids]         (cached-lookup cache [:fk model] eids #(import-fks model %)))
      (import-fks-keyed [_ model field values] (cached-lookup cache [:fk-keyed model field] values #(import-fks-keyed model field %)))
      (import-users     [this emails]          (cached-lookup cache [:user] emails #(import-users this %)))
      (import-databases [_ db-names]           (cached-lookup cache [:database] db-names import-databases))
      (import-tables    [this paths]           (cached-lookup cache [:table] paths #(import-tables this %)))
      (import-fields    [this paths]           (cached-lookup cache [:field] paths #(import-fields this %)))

      resolve/ResettableCache
      (reset-cache! [_] (reset! cache {})))))
