(ns metabase-enterprise.transforms.inspector
  "Transform Inspector: Provides visibility into what data transformations are doing
   before and after they run. Generates a dashboard-like structure with visualization
   cards for inspection purposes."
  (:require
   [clojure.string :as str]
   [metabase-enterprise.transforms.interface :as transforms.i]
   [metabase-enterprise.transforms.schema :as transforms.schema]
   [metabase-enterprise.transforms.util :as transforms.util]
   [metabase.driver :as driver]
   [metabase.lib-be.core :as lib-be]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.lib.walk :as lib.walk]
   [metabase.query-processor :as qp]
   [metabase.query-processor.preprocess :as qp.preprocess]
   [metabase.util :as u]
   [metabase.util.i18n :refer [tru]]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

;;; -------------------------------------------------- Source Extraction ---------------------------------------------------

(defmulti extract-sources
  "Extract source table information for a transform.
   Returns a seq of maps with :table-id, :table-name, :schema, and :db-id."
  (fn [transform] (transforms.util/transform-source-type (:source transform))))

(defmethod extract-sources :mbql
  [{:keys [source] :as transform}]
  (try
    (let [query (-> (:query source)
                    transforms.util/massage-sql-query
                    qp.preprocess/preprocess)
          table-ids (lib/all-source-table-ids query)
          db-id (transforms.util/transform-source-database transform)]
      (when (seq table-ids)
        (let [tables (t2/select :model/Table :id [:in table-ids])]
          (mapv (fn [table]
                  {:table-id   (:id table)
                   :table-name (:name table)
                   :schema     (:schema table)
                   :db-id      (:db_id table)})
                tables))))
    (catch Exception e
      (log/warn e "Failed to extract sources from MBQL transform")
      nil)))

(defmethod extract-sources :native
  [{:keys [source] :as transform}]
  (try
    (let [query (:query source)
          db-id (transforms.util/transform-source-database transform)
          database (t2/select-one :model/Database :id db-id)
          driver-kw (keyword (:engine database))
          deps (driver/native-query-deps driver-kw query)]
      (when (seq deps)
        (let [table-ids (keep :table deps)
              tables (when (seq table-ids)
                       (t2/select :model/Table :id [:in table-ids]))]
          (mapv (fn [table]
                  {:table-id   (:id table)
                   :table-name (:name table)
                   :schema     (:schema table)
                   :db-id      (:db_id table)})
                tables))))
    (catch Exception e
      (log/warn e "Failed to extract sources from native transform")
      nil)))

(defmethod extract-sources :python
  [{:keys [source] :as transform}]
  (try
    (let [source-tables (get-in transform [:source :source-tables])
          normalized (transforms.util/normalize-source-tables source-tables)]
      (for [[_alias {:keys [table_id database_id schema table]}] normalized
            :when table_id]
        {:table-id   table_id
         :table-name table
         :schema     schema
         :db-id      database_id}))
    (catch Exception e
      (log/warn e "Failed to extract sources from Python transform")
      nil)))

;;; -------------------------------------------------- Join Extraction ---------------------------------------------------

(defn- extract-join-info
  "Extract join information from a single join clause."
  [join]
  (let [strategy (or (:strategy join) :left-join)
        conditions (:conditions join)
        ;; Try to extract the source table from the join's stages
        join-source-table (get-in join [:stages 0 :source-table])
        alias (:alias join)]
    {:strategy    strategy
     :alias       alias
     :source-table join-source-table
     :conditions  conditions}))

(defn extract-joins
  "Walk an MBQL query and extract all join information.
   Returns a seq of join info maps with :strategy, :alias, :source-table, :conditions."
  [query]
  (let [joins (atom [])]
    (lib.walk/walk
     query
     (fn [_query path-type _path stage-or-join]
       (when (= path-type :lib.walk/join)
         (swap! joins conj (extract-join-info stage-or-join)))
       nil))
    @joins))

;;; -------------------------------------------------- Table Statistics ---------------------------------------------------

;; TODO: This COUNT(*) query can be slow on large tables. Consider returning a count card
;; in the response that the frontend can execute async, rather than blocking the inspector.
(defn- run-count-query
  "Run a COUNT(*) query against a table and return the count."
  [db-id table-id]
  (try
    (let [mp (lib-be/application-database-metadata-provider db-id)
          table-metadata (lib.metadata/table mp table-id)
          query (-> (lib/query mp table-metadata)
                    (lib/aggregate (lib/count)))
          result (qp/process-query query)]
      (-> result :data :rows first first))
    (catch Exception e
      (log/warnf e "Failed to run COUNT(*) query for table %d" table-id)
      nil)))

(defn- get-table-row-count
  "Get the estimated or actual row count for a table.
   Falls back to running COUNT(*) if no estimate is available."
  [table-id]
  (let [table (t2/select-one :model/Table :id table-id)]
    (or (:estimated_row_count table)
        (run-count-query (:db_id table) table-id))))

(defn- get-field-stats
  "Get fingerprint stats for a field if available.
   Extracts global stats (distinct-count, nil%) and type-specific stats:
   - For numbers: min, max, avg, q1, q3
   - For temporal: earliest, latest"
  [field]
  (let [fingerprint (:fingerprint field)
        global-fp (get fingerprint :global)
        type-fp (get fingerprint :type)
        ;; Number stats are under :type/Number
        number-fp (get type-fp :type/Number)
        ;; Temporal stats are under :type/DateTime (for historical reasons)
        temporal-fp (get type-fp :type/DateTime)]
    (when (or global-fp number-fp temporal-fp)
      (cond-> {}
        ;; Global stats
        (:distinct-count global-fp)
        (assoc :distinct-count (:distinct-count global-fp))

        (some? (:nil% global-fp))
        (assoc :nil-percent (:nil% global-fp))

        ;; Number stats
        (some? (:min number-fp))
        (assoc :min (:min number-fp))

        (some? (:max number-fp))
        (assoc :max (:max number-fp))

        (some? (:avg number-fp))
        (assoc :avg (:avg number-fp))

        (some? (:q1 number-fp))
        (assoc :q1 (:q1 number-fp))

        (some? (:q3 number-fp))
        (assoc :q3 (:q3 number-fp))

        ;; Temporal stats
        (:earliest temporal-fp)
        (assoc :earliest (:earliest temporal-fp))

        (:latest temporal-fp)
        (assoc :latest (:latest temporal-fp))))))

(defn- collect-field-metadata
  "Collect metadata for fields in a table, including fingerprint stats."
  [table-id]
  (let [fields (t2/select :model/Field :table_id table-id :active true)]
    (mapv (fn [field]
            (merge
             {:id           (:id field)
              :name         (:name field)
              :display-name (:display_name field)
              :base-type    (:base_type field)
              :semantic-type (:semantic_type field)}
             (when-let [stats (get-field-stats field)]
               {:stats stats})))
          fields)))

(mu/defn collect-table-stats :- ::transforms.schema/inspector-source-detail
  "Collect statistics for a table including row count, column count, and field metadata."
  [table-id :- pos-int?]
  (let [table (t2/select-one :model/Table :id table-id)
        fields (collect-field-metadata table-id)
        row-count (get-table-row-count table-id)]
    {:table-id     table-id
     :table-name   (:name table)
     :schema       (:schema table)
     :row-count    row-count
     :column-count (count fields)
     :fields       fields}))

;;; -------------------------------------------------- Target Table ---------------------------------------------------

(defn get-target-table
  "Get the target table for a transform. Returns nil if the target doesn't exist."
  [{:keys [target] :as transform}]
  (let [db-id (transforms.i/target-db-id transform)]
    (transforms.util/target-table db-id target)))

;;; -------------------------------------------------- Column Matching ---------------------------------------------------

(defn- normalize-column-name
  "Normalize a column name for comparison (lowercase, remove underscores/hyphens)."
  [name]
  (when name
    (-> name
        u/lower-case-en
        (str/replace #"[-_]" ""))))

(defn match-columns
  "Find columns that relate between input and output tables.
   One output column may match multiple input columns (e.g., from different join sources).
   Returns groups: [{:output-column \"customer_id\"
                     :input-columns [{:table-id 1 :table-name \"orders\" :column \"customer_id\"}
                                     {:table-id 2 :table-name \"customers\" :column \"id\"}]}]"
  [source-stats target-stats]
  (let [target-fields (:fields target-stats)
        source-fields (for [{:keys [table-id table-name fields]} source-stats
                            field fields]
                        (assoc field :source-table-id table-id :source-table-name table-name))]
    (for [target-field target-fields
          :let [target-name (normalize-column-name (:name target-field))
                matching-inputs (filter #(= target-name (normalize-column-name (:name %)))
                                        source-fields)]
          :when (seq matching-inputs)]
      {:output-column (:name target-field)
       :output-field target-field
       :input-columns (mapv (fn [f]
                              {:table-id   (:source-table-id f)
                               :table-name (:source-table-name f)
                               :column     (:name f)
                               :field      f})
                            matching-inputs)})))

;;; -------------------------------------------------- Distribution Card Generation ---------------------------------------------------

(defn- make-distribution-query
  "Generate an MBQL query for field distribution (histogram/breakdown)."
  [db-id table-id field-id]
  (let [mp (lib-be/application-database-metadata-provider db-id)
        table-metadata (lib.metadata/table mp table-id)
        field-metadata (lib.metadata/field mp field-id)
        query (-> (lib/query mp table-metadata)
                  (lib/aggregate (lib/count))
                  (lib/breakout (lib/ref field-metadata))
                  (lib/limit 50))]
    query))

(defn- make-distribution-card
  "Generate a visualization card structure for field distribution."
  [db-id table-id table-name field-id field-name source-type]
  (let [query (make-distribution-query db-id table-id field-id)]
    {:id (str field-name "-" table-name "-" (name source-type))
     :source source-type
     :table-name table-name
     :field-name field-name
     :title (str field-name " (" (if (= source-type :input) "Input: " "Output: ") table-name ")")
     :display :bar
     :dataset_query query}))

(defn make-column-comparison-group
  "Generate a group of cards for comparing input/output distributions for matched columns."
  [column-match db-id target-table-id target-table-name]
  (let [{:keys [output-column output-field input-columns]} column-match]
    {:id (str output-column "-comparison")
     :output-column output-column
     :cards (concat
             ;; Input cards (may be multiple)
             (for [{:keys [table-id table-name field]} input-columns
                   :when (:id field)]
               (make-distribution-card db-id table-id table-name (:id field) (:name field) :input))
             ;; Output card (one)
             (when (:id output-field)
               [(make-distribution-card db-id target-table-id target-table-name
                                        (:id output-field) output-column :output)]))}))

;;; -------------------------------------------------- Summary Cards ---------------------------------------------------

(defn- make-summary-stats
  "Generate summary statistics comparing inputs to output."
  [source-stats target-stats]
  {:inputs (mapv (fn [{:keys [table-name row-count column-count]}]
                   {:table-name table-name
                    :row-count row-count
                    :column-count column-count})
                 source-stats)
   :output {:table-name (:table-name target-stats)
            :row-count (:row-count target-stats)
            :column-count (:column-count target-stats)}})

;;; -------------------------------------------------- Main Inspection ---------------------------------------------------

(mu/defn inspect-tables :- ::transforms.schema/generic-inspector-result
  "Generic inspection of input tables vs output table.
   Does not require a transform definition - works with any table IDs.
   Useful for inspecting transform subgraphs or arbitrary table comparisons."
  [input-table-ids :- [:sequential pos-int?]
   output-table-id :- pos-int?]
  (let [output-table (t2/select-one :model/Table :id output-table-id)
        db-id (:db_id output-table)

        ;; Collect stats for all tables
        source-stats (mapv collect-table-stats input-table-ids)
        target-stats (collect-table-stats output-table-id)

        ;; Column matching (same logic as before)
        column-matches (match-columns source-stats target-stats)

        ;; Generate comparison cards
        column-groups (mapv #(make-column-comparison-group % db-id output-table-id (:table-name target-stats))
                            column-matches)

        ;; Summary
        summary (make-summary-stats source-stats target-stats)]

    {:name "Table Inspector"
     :description (tru "Comparison of input tables to output table")
     :status :ready

     :summary summary
     :sources source-stats
     :target target-stats
     :column-comparisons column-groups}))

(mu/defn inspect-transform :- ::transforms.schema/inspector-result
  "Generate inspection data for a transform.
   Returns a dashboard-like structure with summary stats, join info, and visualization cards."
  [transform :- :map]
  (let [source-type (transforms.util/transform-source-type (:source transform))
        sources (extract-sources transform)
        target-table (get-target-table transform)]

    (if-not target-table
      ;; Target table doesn't exist - transform hasn't run yet
      {:name (str "Transform Inspector: " (:name transform))
       :description (tru "Transform has not been run yet. Run the transform to see inspection data.")
       :status :not-run
       :sources (mapv #(select-keys % [:table-name :schema]) sources)}

      ;; Target exists - delegate to generic inspect-tables, then add transform-specific data
      (let [input-ids (mapv :table-id sources)
            base-result (inspect-tables input-ids (:id target-table))

            ;; Add transform-specific enrichments: join analysis (MBQL only)
            joins (when (= source-type :mbql)
                    (try
                      (let [query (-> transform :source :query
                                      transforms.util/massage-sql-query
                                      qp.preprocess/preprocess)]
                        (extract-joins query))
                      (catch Exception e
                        (log/warn e "Failed to extract joins")
                        nil)))]

        (assoc base-result
               :name (str "Transform Inspector: " (:name transform))
               :description (tru "Analysis of transform inputs, outputs, and joins")
               :joins (when (seq joins)
                        (mapv (fn [join]
                                {:strategy (:strategy join)
                                 :alias (:alias join)
                                 :source-table (:source-table join)})
                              joins)))))))
