(ns metabase-enterprise.transforms.inspector-v2.context
  "Context building for Transform Inspector v2."
  (:require
   [clojure.set :as set]
   [clojure.string :as str]
   [metabase-enterprise.transforms.inspector-v2.query-analysis :as query-analysis]
   [metabase-enterprise.transforms.interface :as transforms.i]
   [metabase-enterprise.transforms.util :as transforms.util]
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
              {:table-id   (:id table)
               :table-name (:name table)
               :schema     (:schema table)
               :db-id      (:db_id table)})
            tables))))

(defmulti extract-sources
  "Extract source table information for a transform.
   Returns a seq of maps with :table-id, :table-name, :schema, and :db-id."
  (fn [transform] (transforms.util/transform-source-type (:source transform))))

(defmethod extract-sources :mbql
  [{:keys [source]}]
  (try
    (let [query (-> (:query source)
                    transforms.util/massage-sql-query
                    metabase.query-processor.preprocess/preprocess)
          table-ids (metabase.lib.core/all-source-table-ids query)]
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
          deps (metabase.driver/native-query-deps driver-kw (:query source))
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
     (-> (merge (select-keys (get fp :global) [:distinct-count])
                (select-keys (get-in fp [:type :type/Number]) [:min :max :avg :q1 :q3])
                (select-keys (get-in fp [:type :type/DateTime]) [:earliest :latest]))
         (cond-> (some? (get-in fp [:global :nil%]))
           (assoc :nil-percent (get-in fp [:global :nil%])))))))

(defn- collect-field-metadata
  "Collect metadata for fields in a table."
  [table-id]
  (let [fields (t2/select :model/Field :table_id table-id :active true)]
    (mapv (fn [field]
            (cond-> (-> (select-keys field [:id :name :display_name :base_type :semantic_type])
                        (set/rename-keys {:display_name  :display-name
                                          :base_type     :base-type
                                          :semantic_type :semantic-type}))
              (get-field-stats field)
              (assoc :stats (get-field-stats field))))
          fields)))

(defn- build-table-info
  "Build table info map with fields."
  [{:keys [table-id table-name schema db-id]}]
  (let [fields (collect-field-metadata table-id)]
    {:table-id     table-id
     :table-name   table-name
     :schema       schema
     :db-id        db-id
     :column-count (count fields)
     :fields       fields}))

;;; -------------------------------------------------- Column Matching --------------------------------------------------

(defn- normalize-column-name
  "Normalize a column name for comparison."
  [name]
  (some-> name u/lower-case-en (str/replace #"[-_]" "")))

(defn- parse-joined-column-name
  "Parse a joined column name like 'Table__field_name'."
  [name]
  (when-let [[_ alias field-name] (re-find #"^(.+)__(.+)$" name)]
    {:alias alias :field-name field-name}))

(defn- match-columns
  "Find columns that relate between input and output tables."
  [sources target join-structure]
  (let [alias->source-table (into {} (map (juxt :alias :source-table) join-structure))
        source-fields (for [{:keys [table-id table-name fields]} sources
                            field fields]
                        (assoc field :source-table-id table-id :source-table-name table-name))]
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

;;; -------------------------------------------------- Context Building --------------------------------------------------

(defn build-context
  "Build context for lens discovery and generation."
  [transform]
  (let [source-type (transforms.util/transform-source-type (:source transform))
        sources-info (mapv build-table-info (extract-sources transform))
        target-table (get-target-table transform)
        target-info (when target-table
                      (build-table-info {:table-id   (:id target-table)
                                         :table-name (:name target-table)
                                         :schema     (:schema target-table)
                                         :db-id      (:db_id target-table)}))
        query-info (query-analysis/analyze-query transform source-type sources-info)
        join-structure (:join-structure query-info)
        column-matches (when (and (seq sources-info) target-info)
                         (seq (match-columns sources-info target-info join-structure)))]
    {:transform           transform
     :source-type         source-type
     :sources             sources-info
     :target              target-info
     :db-id               (transforms.util/transform-source-database transform)
     :preprocessed-query  (:preprocessed-query query-info)
     :parsed-ast          (:parsed-ast query-info)
     :driver-kw           (:driver-kw query-info)
     :has-joins?          (boolean (seq join-structure))
     :join-structure      join-structure
     :visited-fields      (:visited-fields query-info)
     :has-column-matches? (boolean column-matches)
     :column-matches      column-matches}))
