(ns metabase.transforms.inspector.context
  "Context building for Transform Inspector."
  (:require
   [clojure.string :as str]
   [metabase.driver :as driver]
   [metabase.lib.core :as lib]
   [metabase.query-processor.preprocess :as qp.preprocess]
   [metabase.transforms.inspector.query-analysis :as query-analysis]
   [metabase.transforms.interface :as transforms.i]
   [metabase.transforms.util :as transforms.util]
   [metabase.util :as u]
   [metabase.util.log :as log]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

;;; -------------------------------------------------- Source Extraction --------------------------------------------------

(defn- table-ids->source-info
  "Fetch tables by ID and build source info maps."
  [table-ids]
  (when (seq table-ids)
    (let [tables (t2/select :model/Table :id [:in table-ids])]
      (mapv (fn [table]
              {:table_id   (:id table)
               :table_name (:name table)
               :schema     (:schema table)
               :db_id      (:db_id table)})
            tables))))

(defmulti extract-sources
  "Extract source table information for a transform.
   Returns a seq of maps with :table-id, :table-name, :schema, and :db-id."
  {:arglists '([transform])}
  (fn [transform] (transforms.util/transform-source-type (:source transform))))

(defmethod extract-sources :mbql
  [{:keys [source]}]
  (try
    (let [query (-> (:query source)
                    transforms.util/massage-sql-query
                    qp.preprocess/preprocess)
          table-ids (lib/all-source-table-ids query)]
      (table-ids->source-info table-ids))
    (catch Exception e
      (log/warn e "Failed to extract sources from MBQL transform")
      nil)))

(defmethod extract-sources :native
  [{:keys [source] :as transform}]
  (try
    (let [db-id (transforms.util/transform-source-database transform)
          database (t2/select-one :model/Database :id db-id)
          driver-kw (keyword (:engine database))
          deps (driver/native-query-deps driver-kw (:query source))
          table-ids (keep :table deps)]
      (table-ids->source-info table-ids))
    (catch Exception e
      (log/warn e "Failed to extract sources from native transform")
      nil)))

(defmethod extract-sources :python
  [transform]
  (try
    (let [source-tables (get-in transform [:source :source-tables])
          normalized (transforms.util/normalize-source-tables source-tables)
          table-ids (keep (fn [[_ v]] (:table_id v)) normalized)]
      (table-ids->source-info table-ids))
    (catch Exception e
      (log/warn e "Failed to extract sources from Python transform")
      nil)))

(defmethod extract-sources :default
  [_transform]
  nil)

;;; -------------------------------------------------- Target Table --------------------------------------------------

(defn- get-target-table
  "Get the target table for a transform. Returns nil if the target doesn't exist."
  [{:keys [target] :as transform}]
  (let [db-id (transforms.i/target-db-id transform)]
    (transforms.util/target-table db-id target)))

;;; -------------------------------------------------- Field Metadata --------------------------------------------------

(defn- get-field-stats
  "Extract fingerprint stats for a field."
  [field]
  (let [fp (:fingerprint field)]
    (not-empty
     (cond-> (merge (when-let [dc (get-in fp [:global :distinct-count])]
                      {:distinct_count dc})
                    (select-keys (get-in fp [:type :type/Number]) [:min :max :avg :q1 :q3])
                    (select-keys (get-in fp [:type :type/DateTime]) [:earliest :latest]))
       (some? (get-in fp [:global :nil%]))
       (assoc :nil_percent (get-in fp [:global :nil%]))))))

(defn- collect-field-metadata
  "Collect metadata for fields in a table."
  [table-id]
  (let [fields (t2/select :model/Field :table_id table-id :active true)]
    (mapv (fn [field]
            (cond-> (select-keys field [:id :name :display_name :base_type :semantic_type])
              (get-field-stats field)
              (assoc :stats (get-field-stats field))))
          fields)))

(defn- build-table-info
  "Build table info map with fields."
  [{:keys [table_id table_name schema db_id]}]
  (let [fields (collect-field-metadata table_id)]
    {:table_id     table_id
     :table_name   table_name
     :schema       schema
     :db_id        db_id
     :column_count (count fields)
     :fields       fields}))

;;; -------------------------------------------------- Column Matching --------------------------------------------------

(defn- normalize-column-name
  "Normalize a column name for comparison."
  [name]
  (some-> name u/lower-case-en (str/replace #"[-_]" "")))

(defn- parse-joined-column-name
  "Parse a joined column name like 'Table__field_name'."
  [name]
  (when name
    (when-let [[_ alias field-name] (re-find #"^(.+)__(.+)$" name)]
      {:alias alias :field-name field-name})))

(defn- match-columns-by-name
  "Find columns that relate between input and output tables using name-based matching.
   Used for native queries where we don't have field IDs."
  [sources target join-structure]
  (let [alias->source-table (into {} (map (juxt :alias :source-table) join-structure))
        source-fields (for [{:keys [table_id table_name fields]} sources
                            field fields]
                        (assoc field :source-table-id table_id :source-table-name table_name))]
    (for [target-field (:fields target)
          :let [col-name (:name target-field)
                parsed (parse-joined-column-name col-name)
                matching (if-let [src-table (some-> parsed :alias alias->source-table)]
                           (filter #(and (= (:source-table-id %) src-table)
                                         (= (normalize-column-name (:field-name parsed))
                                            (normalize-column-name (:name %))))
                                   source-fields)
                           (filter #(= (normalize-column-name (or (:field-name parsed) col-name))
                                       (normalize-column-name (:name %)))
                                   source-fields))]
          :when (seq matching)]
      {:output-column col-name
       :output-field  target-field
       :input-columns (mapv #(select-keys % [:source-table-id :source-table-name :name :id])
                            matching)})))

(defn- match-columns-mbql
  "Match columns using field metadata from preprocessed MBQL query.
   Uses lib/returned-columns which provides field IDs and table IDs directly."
  [preprocessed-query sources target]
  (let [;; Get returned columns with full metadata including :id, :table-id, ::lib.join/join-alias
        returned-cols (lib/returned-columns preprocessed-query)

        ;; Index source fields by field ID for fast lookup
        source-field-by-id (into {}
                                 (for [{:keys [table_id table_name fields]} sources
                                       field fields
                                       :when (:id field)]
                                   [(:id field)
                                    (assoc field
                                           :source-table-id table_id
                                           :source-table-name table_name)]))

        ;; Index source tables by table_id for name lookup
        table-id->name (into {} (map (juxt :table_id :table_name) sources))]

    (for [target-field (:fields target)
          :let [target-name (:name target-field)
                ;; Find returned column matching this target field
                ;; Try :lib/desired-column-alias first (e.g., "Cities__country"), fall back to :name
                returned-col (or (some #(when (= (:lib/desired-column-alias %) target-name) %)
                                       returned-cols)
                                 (some #(when (= (:name %) target-name) %)
                                       returned-cols))
                ;; Get field ID and table ID directly from lib metadata
                field-id (:id returned-col)
                source-table-id (:table-id returned-col)
                join-alias (:metabase.lib.join/join-alias returned-col)
                ;; Look up source field by ID
                source-field (when field-id (source-field-by-id field-id))
                source-table-name (or (:source-table-name source-field)
                                      (table-id->name source-table-id))]
          :when (or source-field source-table-id)]
      {:output-column     target-name
       :output-field      target-field
       :field-id          field-id
       :source-table-id   source-table-id
       :source-table-name source-table-name
       :join-alias        join-alias
       :input-columns     (if source-field
                            [(select-keys source-field
                                          [:source-table-id :source-table-name :name :id])]
                            ;; For joined fields where we have table-id from lib metadata
                            [{:source-table-id   source-table-id
                              :source-table-name source-table-name
                              :name              (:name returned-col)
                              :id                field-id}])})))

(defn- match-columns
  "Find columns that relate between input and output tables.
   Uses field ID-based matching for MBQL queries (more accurate),
   falls back to name-based matching for native queries."
  [sources target {:keys [preprocessed-query join-structure]}]
  (if preprocessed-query
    (match-columns-mbql preprocessed-query sources target)
    (match-columns-by-name sources target join-structure)))

;;; -------------------------------------------------- Context Building --------------------------------------------------

(defn build-context
  "Build context for lens discovery and generation."
  [transform]
  (let [source-type (transforms.util/transform-source-type (:source transform))
        sources-info (mapv build-table-info (extract-sources transform))
        target-table (get-target-table transform)
        target-info (when target-table
                      (build-table-info {:table_id   (:id target-table)
                                         :table_name (:name target-table)
                                         :schema     (:schema target-table)
                                         :db_id      (:db_id target-table)}))
        query-info (query-analysis/analyze-query transform source-type sources-info)
        join-structure (:join-structure query-info)
        column-matches (when (and (seq sources-info) target-info)
                         (seq (match-columns sources-info target-info query-info)))]
    {:transform           transform
     :source-type         source-type
     :sources             sources-info
     :target              target-info
     :db-id               (transforms.util/transform-source-database transform)
     :preprocessed-query  (:preprocessed-query query-info)
     :from-clause-sql     (:from-clause-sql query-info)
     :has-joins?          (boolean (seq join-structure))
     :join-structure      join-structure
     :visited-fields      (:visited-fields query-info)
     :has-column-matches? (boolean column-matches)
     :column-matches      column-matches}))
