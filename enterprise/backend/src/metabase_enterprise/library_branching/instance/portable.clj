(ns metabase-enterprise.library-branching.instance.portable
  "Portable forms of app DB values, made by the serdes export of master, and the document form of a value.

  [[export-batch]] runs an export function over a batch of rows with the reference lookups of the whole batch in a
  constant number of queries: a first pass records every database id that the export asks the serdes resolvers
  about, one query per kind of lookup reads them all, and a second pass answers from the result."
  (:require
   [metabase-enterprise.library-branching.db :as library-branching.db]
   [metabase-enterprise.library-branching.instance :as instance]
   [metabase.models.db :as models.db]
   [metabase.models.serialization :as serdes]
   [metabase.models.serialization.resolve :as serdes.resolve]
   [metabase.util :as u]))

(set! *warn-on-reflection* true)

;;; --------------------------------------------------- Documents ---------------------------------------------------

(defn- document-key
  [k]
  (cond
    (keyword? k) k
    (string? k)  (keyword k)
    :else        (keyword (str k))))

(defn document
  "`x` as a document value: maps with keyword keys (a string key becomes its keyword), vectors, strings, longs,
  doubles, booleans and nil. A keyword value becomes its qualified name (`:type/Integer` gives \"type/Integer\"); a
  list becomes a vector."
  [x]
  (cond
    (map? x)        (into {} (map (fn [[k v]] [(document-key k) (document v)])) x)
    (keyword? x)    (u/qualified-name x)
    (set? x)        (into #{} (map document) x)
    (sequential? x) (mapv document x)
    (or (instance? Integer x)
        (instance? Short x)
        (instance? Byte x)) (long x)
    (instance? java.math.BigDecimal x) (double x)
    :else           x))

;;; -------------------------------------------------- Resolution ---------------------------------------------------

(def ^:private batched-models
  "The models whose rows are top-level serdes entities: their portable id is their `entity_id`."
  #{:model/Action :model/Card :model/Collection :model/Dashboard :model/Document :model/Measure
    :model/NativeQuerySnippet :model/Segment :model/Timeline})

(defn- model-keyword
  [model]
  (keyword "model" (name model)))

(defn- record!
  [requests k id]
  (when id
    (swap! requests update k (fnil conj #{}) id)))

(defn- recording-resolver
  "A serdes export resolver that records each lookup in the atom `requests` and answers with a placeholder."
  [requests]
  (reify serdes.resolve/SerdesExportResolver
    (export-fk [_ id model]
      (record! requests [:fk (model-keyword model)] id)
      "placeholder")
    (export-fk-keyed [_ id model field]
      (record! requests [:keyed (model-keyword model) field] id)
      "placeholder")
    (export-user [_ id]
      (record! requests [:keyed :model/User :email] id)
      "placeholder")
    (export-table-fk [_ table-id]
      (record! requests [:table] table-id)
      ["placeholder" nil "placeholder"])
    (export-field-fk [_ field-id]
      (record! requests [:field] field-id)
      ["placeholder" nil "placeholder" "placeholder"])))

(def ^:private chunk-size
  "The most ids in one `IN` list."
  1000)

(defn- in-chunks
  "The concatenation of `(f chunk)` for the chunks of the ids `ids`."
  [f ids]
  (into [] (mapcat f) (partition-all chunk-size (sort ids))))

(defn- field-paths
  "`{field-id [table-id name ...]}`: the table and the names from the top-level field down, of each field of
  `field-ids`. One query per level of nesting."
  [field-ids]
  (loop [fields  {}
         pending (set field-ids)]
    (if (empty? pending)
      (into {}
            (map (fn [id]
                   (loop [at id, names ()]
                     (let [{:keys [table_id name parent_id]} (get fields at)]
                       (if parent_id
                         (recur parent_id (cons name names))
                         [id (into [table_id name] names)])))))
            (filter #(contains? fields %) field-ids))
      (let [rows    (in-chunks library-branching.db/fields-by-id pending)
            fields  (into fields (map (juxt :id identity)) rows)
            parents (into #{} (comp (keep :parent_id) (remove #(contains? fields %))) rows)]
        (recur fields parents)))))

(defn- fetch
  "The answers to the recorded lookups `requests`: `{[:fk model] {id eid}, [:keyed model field] {id v}, [:table] {id
  table-key}, [:field] {id field-key}}`."
  [requests]
  (let [fields    (field-paths (get requests [:field]))
        table-ids (into (set (get requests [:table])) (map first) (vals fields))
        tables    (into {}
                        (map (fn [{:keys [id db schema table]}] [id [db schema table]]))
                        (in-chunks library-branching.db/table-keys-by-id table-ids))]
    (into {[:table] tables
           [:field] (into {}
                          (keep (fn [[id [table-id & names]]]
                                  (when-let [table-key (get tables table-id)]
                                    [id (into table-key names)])))
                          fields)}
          (keep (fn [[[tag model field :as k] ids]]
                  (case tag
                    :fk    (when (contains? batched-models model)
                             [k (into {}
                                      (keep (fn [{:keys [id entity_id]}] (when entity_id [id entity_id])))
                                      (in-chunks #(library-branching.db/entity-ids-by-id model %) ids))])
                    :keyed [k (into {}
                                    (map (juxt :id :v))
                                    (in-chunks #(library-branching.db/column-by-id model field %) ids))]
                    nil)))
          requests)))

(defn- prefetched-resolver
  "A serdes export resolver that answers from `answers`, and asks `fallback` what `answers` lacks."
  [answers fallback]
  (let [answer (fn [k id miss]
                 (let [m (get answers k)]
                   (if (contains? m id) (get m id) (miss))))]
    (reify serdes.resolve/SerdesExportResolver
      (export-fk [_ id model]
        (answer [:fk (model-keyword model)] id #(serdes.resolve/export-fk fallback id model)))
      (export-fk-keyed [_ id model field]
        (answer [:keyed (model-keyword model) field] id #(serdes.resolve/export-fk-keyed fallback id model field)))
      (export-user [_ id]
        (answer [:keyed :model/User :email] id #(serdes.resolve/export-user fallback id)))
      (export-table-fk [_ table-id]
        (answer [:table] table-id #(serdes.resolve/export-table-fk fallback table-id)))
      (export-field-fk [_ field-id]
        (answer [:field] field-id #(serdes.resolve/export-field-fk fallback field-id))))))

(def ^:private database-resolver
  "The resolver that serdes uses when none is bound: it reads the app DB for each lookup."
  (reify serdes.resolve/SerdesExportResolver
    (export-fk [_ id model] (binding [serdes.resolve/*export-resolver* nil] (serdes/*export-fk* id model)))
    (export-fk-keyed [_ id model field]
      (binding [serdes.resolve/*export-resolver* nil] (serdes/*export-fk-keyed* id model field)))
    (export-user [_ id] (binding [serdes.resolve/*export-resolver* nil] (serdes/*export-user* id)))
    (export-table-fk [_ table-id] (binding [serdes.resolve/*export-resolver* nil] (serdes/*export-table-fk* table-id)))
    (export-field-fk [_ field-id]
      ;; [[with-resolver]] binds `*export-field-fk*` to a function that asks the resolver; the root reads the app DB.
      (binding [serdes.resolve/*export-resolver* nil]
        ((.getRawRoot #'serdes/*export-field-fk*) field-id)))))

(defn- with-resolver
  "Calls `thunk` with `resolver` as the serdes export resolver of every lookup, field lookups included."
  [resolver thunk]
  (binding [serdes.resolve/*export-resolver* resolver
            ;; Field lookups do not go through the resolver.
            serdes/*export-field-fk*         (fn [field-id]
                                               (when field-id
                                                 (serdes.resolve/export-field-fk resolver field-id)))]
    (thunk)))

(defn export-batch
  "`(mapv f xs)`. `f` is a function of one value whose only reads of the app DB are serdes export lookups (the
  portable id of a row, a table or field reference, a user's email). It runs twice for each value. The lookups of the
  whole batch take a constant number of queries for each kind of lookup, not one per reference. A lookup of a row
  that does not exist gives the result of the serdes export."
  [f xs]
  (let [xs       (vec xs)
        requests (atom {})]
    (with-resolver (recording-resolver requests) #(run! f xs))
    (let [resolver (prefetched-resolver (fetch @requests) database-resolver)]
      (with-resolver resolver #(mapv f xs)))))

;;; ---------------------------------------------------- Imports -----------------------------------------------------

(defn- strict-import-resolver
  "A serdes import resolver that finds rows as serdes import does, and refuses item `id` (::instance/refused) for a
  reference to an item, a database, a table or a field that this instance does not have: it creates no row."
  [id]
  (reify serdes.resolve/SerdesImportResolver
    (import-fk [_ eid model]
      (try
        (binding [serdes.resolve/*import-resolver* nil] (serdes/*import-fk* eid model))
        (catch clojure.lang.ExceptionInfo e
          (if (= :target-not-found (::serdes/type (ex-data e)))
            (instance/refuse! :reference id (str "This instance has no " (name model) " " (pr-str eid) ".")
                              {:target eid})
            (throw e)))))
    (import-fk-keyed [_ portable model field]
      (binding [serdes.resolve/*import-resolver* nil] (serdes/*import-fk-keyed* portable model field)))
    (import-user [_ email]
      (binding [serdes.resolve/*import-resolver* nil] (serdes/*import-user* email)))
    (import-database-fk [_ db-name]
      (when db-name
        (or (models.db/database-id-by-name db-name)
            (instance/refuse! :environment id (str "This instance has no database " (pr-str db-name) ".")
                              {:target [db-name]}))))
    (import-table-fk [this [db-name schema table-name :as table-key]]
      (when table-key
        (or (models.db/table-id-by-name table-name schema (serdes.resolve/import-database-fk this db-name))
            (instance/refuse! :environment id (str "This instance has no table " (pr-str table-key) ".")
                              {:target table-key}))))
    (import-field-fk [this [db-name schema table-name & field-names :as field-key]]
      (when field-key
        (or (models.db/field-pk-in-path (serdes.resolve/import-table-fk this [db-name schema table-name])
                                        (reverse field-names))
            (instance/refuse! :environment id (str "This instance has no field " (pr-str field-key) ".")
                              {:target field-key}))))))

(defn do-with-strict-import
  "Calls `f` with no arguments and returns its result. Each serdes import of `f` finds its rows as serdes import does,
  creates none, and throws ::instance/refused for item `id` when this instance has no row for a reference: an item, a
  database, a table or a field."
  [id f]
  (binding [serdes.resolve/*import-resolver* (strict-import-resolver id)]
    (f)))
