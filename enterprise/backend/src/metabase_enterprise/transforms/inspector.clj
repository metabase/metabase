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
   [metabase.query-processor :as qp]
   [metabase.query-processor.preprocess :as qp.preprocess]
   [metabase.util :as u]
   [metabase.util.i18n :refer [tru]]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

;;; -------------------------------------------------- Source Extraction ---------------------------------------------------

;; TODO: this is likely duplicated

(defmulti extract-sources
  "Extract source table information for a transform.
   Returns a seq of maps with :table-id, :table-name, :schema, and :db-id."
  (fn [transform] (transforms.util/transform-source-type (:source transform))))

(defmethod extract-sources :mbql
  [{:keys [source]}]
  (try
    (let [query (-> (:query source)
                    transforms.util/massage-sql-query
                    qp.preprocess/preprocess)
          table-ids (lib/all-source-table-ids query)]
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
  [transform]
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

;;; -------------------------------------------------- Join Extraction & Statistics ---------------------------------------------------

(defn- get-rhs-field-from-condition
  "Extract the RHS field reference from a join condition.
   The RHS field is the one with :join-alias, representing the joined table's field."
  [conditions]
  (when-let [condition (first conditions)]
    (when (and (vector? condition) (>= (count condition) 4))
      (let [[_op _opts _lhs rhs] condition]
        (when (and (vector? rhs)
                   (= :field (first rhs))
                   (:join-alias (second rhs)))
          rhs)))))

(defn- get-join-key-field-ids
  "Extract both LHS and RHS field IDs from join conditions.
   Returns {:lhs-field-id <id> :rhs-field-id <id>} or nil."
  [conditions]
  (when-let [condition (first conditions)]
    (when (and (vector? condition) (>= (count condition) 4))
      (let [[_op _opts lhs rhs] condition
            lhs-id (when (and (vector? lhs) (= :field (first lhs)) (>= (count lhs) 3))
                     (nth lhs 2))
            rhs-id (when (and (vector? rhs) (= :field (first rhs)) (>= (count rhs) 3))
                     (nth rhs 2))]
        (when (and (int? lhs-id) (int? rhs-id))
          {:lhs-field-id lhs-id
           :rhs-field-id rhs-id})))))

(defn- count-null-in-field
  "Count NULL values in a specific field of a table.
   Returns {:null-count <n> :total-count <n> :null-percent <0.0-1.0>}."
  [mp table-id field-id]
  (try
    (let [table-metadata (lib.metadata/table mp table-id)
          field-metadata (lib.metadata/field mp field-id)

          ;; Total count
          total-query (-> (lib/query mp table-metadata)
                          (lib/aggregate (lib/count)))
          total-count (run-pmbql-query total-query)

          ;; Non-null count (COUNT(field) excludes NULLs)
          non-null-query (-> (lib/query mp table-metadata)
                             (lib/aggregate (lib/count (lib/ref field-metadata))))
          non-null-count (run-pmbql-query non-null-query)

          null-count (- total-count non-null-count)
          null-percent (if (pos? total-count)
                         (double (/ null-count total-count))
                         0.0)]
      {:null-count null-count
       :total-count total-count
       :null-percent null-percent})
    (catch Exception e
      (log/warnf e "Failed to count nulls for field %d in table %d" field-id table-id)
      nil)))

(defn- query-with-n-joins
  "Return a copy of query with only the first n joins from the first stage.
   When n=0, removes all joins."
  [query n]
  (if (zero? n)
    (update-in query [:stages 0] dissoc :joins)
    (update-in query [:stages 0 :joins] #(vec (take n %)))))

(defn- strip-join-to-essentials
  "Strip a join clause down to just the essential parts for counting."
  [join]
  (-> join
      (select-keys [:lib/type :strategy :alias :conditions :stages])
      ;; Also strip down the join's inner stages
      (update :stages (fn [stages]
                        (mapv #(select-keys % [:lib/type :source-table]) stages)))))

(defn- strip-stage-to-joins
  "Strip a stage down to just source-table and joins, removing all other clauses."
  [stage]
  (let [base (-> stage
                 (select-keys [:lib/type :source-table])
                 (assoc :aggregation [[:count {:lib/uuid (str (random-uuid))}]]))]
    (if-let [joins (seq (:joins stage))]
      (assoc base :joins (mapv strip-join-to-essentials joins))
      base)))

(defn- make-count-query
  "Transform a pMBQL query into a COUNT(*) query with only FROM and JOINs.
   Removes filters, group-by, order-by, fields, etc."
  [query]
  (-> query
      (update-in [:stages 0] strip-stage-to-joins)))

(defn- fresh-uuid-field-ref
  "Copy a field reference with a fresh :lib/uuid to avoid duplicate UUID errors."
  [field-ref]
  (when field-ref
    (if (and (vector? field-ref) (= :field (first field-ref)) (map? (second field-ref)))
      (assoc-in field-ref [1 :lib/uuid] (str (random-uuid)))
      field-ref)))

(defn- make-count-field-query
  "Transform a pMBQL query into a COUNT(field) query with only FROM and JOINs.
   Removes filters, group-by, order-by, fields, etc."
  [query field-ref]
  (-> query
      (update-in [:stages 0]
                 (fn [stage]
                   (let [base (-> stage
                                  (select-keys [:lib/type :source-table])
                                  (assoc :aggregation [[:count {:lib/uuid (str (random-uuid))}
                                                        (fresh-uuid-field-ref field-ref)]]))]
                     (if-let [joins (seq (:joins stage))]
                       (assoc base :joins (mapv strip-join-to-essentials joins))
                       base))))))

(defn- run-pmbql-query
  "Execute a pMBQL query and return the first value from the first row."
  [query]
  (-> query qp/process-query :data :rows first first))

(defn- compute-iterative-join-stats
  "Compute join statistics iteratively by building up the query one join at a time.

   For a query: FROM t1 JOIN t2 ON ... JOIN t3 ON ...
   Executes counts for:
   - t1 alone (base table)
   - t1 JOIN t2
   - t1 JOIN t2 JOIN t3
   etc.

   Returns {:base-row-count <count>
            :joins [{:strategy :left-join
                     :alias \"...\"
                     :source-table <id>
                     :stats {:prev-row-count <n>
                             :row-count <n>
                             :source-row-count <n>
                             ;; for outer joins:
                             :null-count <n>
                             :matched-count <n>}}]}

   For inner/cross joins: row count shows expansion/contraction
   For left/right/full joins: null-count shows unmatched rows"
  [mp query]
  (let [source-table-id (get-in query [:stages 0 :source-table])
        all-joins (get-in query [:stages 0 :joins] [])]
    (when (and source-table-id (seq all-joins))
      (try
        ;; Get base table count first (query with no joins)
        (let [base-query (query-with-n-joins query 0)
              base-count (run-pmbql-query (make-count-query base-query))]
          ;; Now iterate through joins, building up the query
          (loop [step 1
                 prev-count base-count
                 results []]
            (if (> step (count all-joins))
              {:source-table-id source-table-id
               :base-row-count base-count
               :joins results}
              (let [current-join (nth all-joins (dec step))
                    strategy (or (:strategy current-join) :left-join)
                    alias (:alias current-join)
                    join-source-table (get-in current-join [:stages 0 :source-table])

                    ;; Query with this many joins
                    step-query (query-with-n-joins query step)
                    row-count (run-pmbql-query (make-count-query step-query))

                    ;; Get source table count (the table being joined)
                    source-count (when (int? join-source-table)
                                   (let [source-table (lib.metadata/table mp join-source-table)]
                                     (-> (lib/query mp source-table)
                                         (lib/aggregate (lib/count))
                                         qp/process-query :data :rows first first)))

                    ;; For outer joins, count nulls in RHS field to find unmatched rows
                    null-stats (when (#{:left-join :right-join :full-join} strategy)
                                 (when-let [rhs-field (get-rhs-field-from-condition (:conditions current-join))]
                                   (let [non-null-count (run-pmbql-query (make-count-field-query step-query rhs-field))
                                         null-count (- row-count non-null-count)]
                                     {:null-count null-count
                                      :matched-count non-null-count})))

                    ;; Count NULL join keys in the RHS table (table being joined)
                    rhs-null-key-stats (when-let [field-ids (get-join-key-field-ids (:conditions current-join))]
                                         (when (int? join-source-table)
                                           (count-null-in-field mp join-source-table (:rhs-field-id field-ids))))

                    ;; Map iterative stats to existing field names for FE compatibility:
                    ;; - left-row-count = prev-row-count (rows before this join)
                    ;; - right-row-count = source-row-count (the table being joined)
                    ;; - output-row-count = row-count (rows after this join)
                    stats (cond-> {:left-row-count prev-count
                                   :right-row-count source-count
                                   :output-row-count row-count}
                            ;; Merge null stats for outer joins
                            null-stats
                            (merge null-stats)

                            ;; Add null join key stats for RHS table
                            rhs-null-key-stats
                            (assoc :rhs-null-key-count (:null-count rhs-null-key-stats)
                                   :rhs-null-key-percent (:null-percent rhs-null-key-stats))

                            ;; Add derived metrics based on join type
                            (#{:inner-join :cross-join} strategy)
                            (assoc :expansion-factor
                                   (when (and prev-count (pos? prev-count))
                                     (double (/ row-count prev-count))))

                            (and (= :left-join strategy) (:matched-count null-stats))
                            (assoc :match-rate
                                   (when (and prev-count (pos? prev-count))
                                     (double (/ (:matched-count null-stats) prev-count))))

                            (and (= :right-join strategy) (:matched-count null-stats))
                            (assoc :match-rate
                                   (when (and source-count (pos? source-count))
                                     (double (/ (:matched-count null-stats) source-count))))

                            (= :full-join strategy)
                            (assoc :expansion-factor
                                   (when (and prev-count (pos? prev-count))
                                     (double (/ row-count prev-count)))))

                    result {:strategy strategy
                            :alias alias
                            :source-table join-source-table
                            :stats stats}]
                (recur (inc step) row-count (conj results result))))))
        (catch Exception e
          (log/warn e "Failed to compute iterative join stats")
          nil)))))

(defn extract-joins
  "Walk an MBQL query and extract all join information with iterative statistics.

   For a query like: FROM t1 JOIN t2 ON ... JOIN t3 ON ...
   Computes stats by progressively building up the query:
   - Count of t1 alone
   - Count of t1 JOIN t2
   - Count of t1 JOIN t2 JOIN t3
   etc.

   Returns {:base-row-count <count>
            :joins [{:strategy :left-join
                     :alias \"...\"
                     :source-table <id>
                     :stats {...}}]}

   For inner/cross joins: shows row count expansion/contraction
   For left/right/full joins: shows null counts (unmatched rows)"
  [query]
  (let [mp (lib.metadata/->metadata-provider query)]
    (compute-iterative-join-stats mp query)))

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
  "Get actual row count for a table."
  [table-id]
  (let [table (t2/select-one :model/Table :id table-id)]
    (run-count-query (:db_id table) table-id)))

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

(defn- parse-joined-column-name
  "Parse a joined column name like 'Test Customers - Customer__region'.
   Returns {:alias \"Test Customers - Customer\" :field-name \"region\"} or nil if not a joined column."
  [name]
  (when-let [[_ alias field-name] (re-find #"^(.+)__(.+)$" name)]
    {:alias alias :field-name field-name}))

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
   When joins info is provided, uses join alias to match joined columns to the correct source table.
   Returns groups: [{:output-column \"customer_id\"
                     :input-columns [{:table-id 1 :table-name \"orders\" :column \"customer_id\"}
                                     {:table-id 2 :table-name \"customers\" :column \"id\"}]}]"
  [source-stats target-stats joins]
  (let [target-fields (:fields target-stats)
        ;; Build alias → source-table-id mapping from joins
        alias->source-table (into {} (map (juxt :alias :source-table) joins))
        source-fields (for [{:keys [table-id table-name fields]} source-stats
                            field fields]
                        (assoc field :source-table-id table-id :source-table-name table-name))]
    (for [target-field target-fields
          :let [col-name (:name target-field)
                parsed (parse-joined-column-name col-name)
                ;; If it's a joined column with known alias, match to specific source table
                matching-inputs
                (if-let [source-table-id (some-> parsed :alias alias->source-table)]
                  ;; Match by alias → specific source table + field name
                  (let [field-name (normalize-column-name (:field-name parsed))]
                    (filter #(and (= (:source-table-id %) source-table-id)
                                  (= field-name (normalize-column-name (:name %))))
                            source-fields))
                  ;; No alias or unknown alias → fall back to name matching across all sources
                  (let [target-name (normalize-column-name (or (:field-name parsed) col-name))]
                    (filter #(= target-name (normalize-column-name (:name %)))
                            source-fields)))]
          :when (seq matching-inputs)]
      {:output-column col-name
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
                  #_(lib/limit 50))]
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
     :display :row
     :dataset_query query}))

(defn make-column-comparison-group
  "Generate a group of cards for comparing input/output distributions for matched columns.
   source-table-id is the main FROM table - its cards are sorted first among inputs."
  [column-match db-id target-table-id target-table-name source-table-id]
  (let [{:keys [output-column output-field input-columns]} column-match
        ;; Sort input-columns so source table comes first
        sorted-inputs (sort-by #(if (= (:table-id %) source-table-id) 0 1) input-columns)]
    {:id (str output-column "-comparison")
     :output-column output-column
     :cards (concat
             ;; Input cards (may be multiple), sorted with source table first
             (for [{:keys [table-id table-name field]} sorted-inputs
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
   Useful for inspecting transform subgraphs or arbitrary table comparisons.
   Optional joins param enables smarter column matching using join aliases.
   Optional source-table-id specifies the main FROM table for sorting column cards."
  ([input-table-ids output-table-id]
   (inspect-tables input-table-ids output-table-id nil nil))
  ([input-table-ids output-table-id joins]
   (inspect-tables input-table-ids output-table-id joins nil))
  ([input-table-ids :- [:sequential pos-int?]
    output-table-id :- pos-int?
    joins :- [:maybe [:sequential :map]]
    source-table-id :- [:maybe pos-int?]]
   (let [output-table (t2/select-one :model/Table :id output-table-id)
         db-id (:db_id output-table)

         ;; Collect stats for all tables
         source-stats (mapv collect-table-stats input-table-ids)
         target-stats (collect-table-stats output-table-id)

         ;; Column matching using join alias info when available
         column-matches (match-columns source-stats target-stats joins)

         ;; Use provided source-table-id, or fall back to first input
         source-table-id (or source-table-id (first input-table-ids))

         ;; Generate comparison cards, with source table inputs sorted first
         column-groups (mapv #(make-column-comparison-group % db-id output-table-id (:table-name target-stats) source-table-id)
                             column-matches)

         ;; Summary
         summary (make-summary-stats source-stats target-stats)]

     {:name "Table Inspector"
      :description (tru "Comparison of input tables to output table")
      :status :ready

      :summary summary
      :sources source-stats
      :target target-stats
      :column-comparisons column-groups})))

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

      ;; Target exists - extract joins first for smarter column matching
      (let [input-ids (mapv :table-id sources)
            ;; Extract joins first (MBQL only) so we can use them for column matching
            ;; Returns {:base-row-count <n> :joins [...]} or nil
            join-stats (when (= source-type :mbql)
                         (try
                           (let [query (-> transform :source :query
                                           transforms.util/massage-sql-query
                                           qp.preprocess/preprocess)]
                             (extract-joins query))
                           (catch Exception e
                             (log/warn e "Failed to extract joins")
                             nil)))
            ;; Extract just the joins seq for column matching
            joins-seq (:joins join-stats)
            ;; Get the actual source table ID from the query (the FROM table)
            query-source-table-id (:source-table-id join-stats)
            ;; Pass joins to inspect-tables for alias-aware column matching
            base-result (inspect-tables input-ids (:id target-table) joins-seq query-source-table-id)]

        (cond-> (assoc base-result
                       :name (str "Transform Inspector: " (:name transform))
                       :description (tru "Analysis of transform inputs, outputs, and joins"))
          ;; Add base-row-count at top level (row count before any joins)
          (:base-row-count join-stats)
          (assoc :base-row-count (:base-row-count join-stats))

          ;; Add joins with iterative stats
          (seq joins-seq)
          (assoc :joins (mapv #(select-keys % [:strategy :alias :source-table :stats])
                              joins-seq)))))))
