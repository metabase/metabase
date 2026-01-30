(ns metabase-enterprise.transforms.inspector.lenses.join-analysis
  "Join Analysis lens - analyze join quality and data flow.

   This lens is applicable when the transform has JOINs and provides:
   - Iterative join statistics (row count at each join step)
   - Join match rate for outer joins
   - Row expansion/contraction factor for inner/cross joins
   - Null rate in joined columns
   - Alerts for low match rates, high null rates, cross-products

   Layout: :flat (cards in grid layout)

   The lens generates cards whose results feed into heuristic triggers
   to generate alerts and activate drill-down lenses.

   Cards are generated to compute:
   - COUNT(*) with 0 joins (base table only)
   - COUNT(*) with 1 join
   - COUNT(*) with 2 joins... etc
   - COUNT(rhs_join_key) for outer joins (to compute matched rows)
   - COUNT(*) for each joined table (right side row count)"
  (:require
   [clojure.string :as str]
   [metabase-enterprise.transforms.inspector.cards :as cards]
   [metabase-enterprise.transforms.inspector.lenses.core :as lenses.core]
   [metabase.driver.sql.query-processor :as sql.qp]))

(set! *warn-on-reflection* true)

;;; -------------------------------------------------- Native SQL Building --------------------------------------------------
;; For native queries, we build SQL strings directly from the macaw AST to compute
;; iterative join statistics. This is necessary because we can't manipulate native
;; SQL queries the way we can with pMBQL.

(defn- strip-existing-quotes
  "Strip any existing SQL quotes from an identifier.
   Handles double-quotes (ANSI), backticks (MySQL), and square brackets (SQL Server)."
  [s]
  (let [s (str s)]
    (cond
      ;; Double-quoted (ANSI style)
      (and (str/starts-with? s "\"") (str/ends-with? s "\""))
      (-> s (subs 1 (dec (count s))) (str/replace "\"\"" "\""))

      ;; Backtick-quoted (MySQL style)
      (and (str/starts-with? s "`") (str/ends-with? s "`"))
      (-> s (subs 1 (dec (count s))) (str/replace "``" "`"))

      ;; Bracket-quoted (SQL Server style)
      (and (str/starts-with? s "[") (str/ends-with? s "]"))
      (-> s (subs 1 (dec (count s))) (str/replace "]]" "]"))

      :else s)))

(defn- sql-quote-name
  "Quote a SQL identifier using the driver's quoting convention.
   Strips any existing quotes first to avoid double-quoting."
  [driver-kw s]
  (let [style (sql.qp/quote-style driver-kw)
        s (strip-existing-quotes (str s))]
    (case style
      :mysql    (str "`" (str/replace s "`" "``") "`")
      :sqlserver (str "[" (str/replace s "]" "]]") "]")
      ;; :ansi and everything else
      (str "\"" (str/replace s "\"" "\"\"") "\""))))

(defn- sql-table-ref
  "Format a macaw AST table node as a SQL table reference."
  [driver-kw {:keys [schema table table-alias]}]
  (str (when schema (str (sql-quote-name driver-kw schema) "."))
       (sql-quote-name driver-kw table)
       (when table-alias (str " AS " (sql-quote-name driver-kw table-alias)))))

(defn- sql-column-ref
  "Format a macaw AST column node as a SQL column reference."
  [driver-kw {:keys [schema table column]}]
  (str/join "." (map (partial sql-quote-name driver-kw) (remove nil? [schema table column]))))

(defn- sql-condition
  "Format a macaw AST condition as a SQL string. Returns nil for unsupported expressions."
  [driver-kw condition]
  (when (= (:type condition) :macaw.ast/binary-expression)
    (let [{:keys [operator left right]} condition]
      (when (and (= (:type left) :macaw.ast/column)
                 (= (:type right) :macaw.ast/column))
        (str (sql-column-ref driver-kw left) " " operator " " (sql-column-ref driver-kw right))))))

(defn- sql-conditions
  "Format a seq of macaw AST conditions as a SQL ON clause string."
  [driver-kw conditions]
  (let [parts (keep (partial sql-condition driver-kw) conditions)]
    (when (seq parts)
      (str/join " AND " parts))))

(def ^:private strategy->sql-keyword
  {:left-join  "LEFT JOIN"
   :right-join "RIGHT JOIN"
   :full-join  "FULL JOIN"
   :cross-join "CROSS JOIN"
   :inner-join "JOIN"})

(defn- ast-join-type->strategy
  "Map macaw AST join-type to metabase join strategy keyword."
  [join-type]
  (case join-type
    :left    :left-join
    :right   :right-join
    :full    :full-join
    :cross   :cross-join
    :natural :inner-join
    :inner   :inner-join
    :inner-join))

(defn- sql-join-clause
  "Format a macaw AST join node as a SQL JOIN clause."
  [driver-kw join-node]
  (let [strategy (ast-join-type->strategy (:join-type join-node))
        join-kw  (strategy->sql-keyword strategy)
        table    (sql-table-ref driver-kw (:source join-node))
        on-clause (sql-conditions driver-kw (:condition join-node))]
    (if on-clause
      (str join-kw " " table " ON " on-clause)
      (str join-kw " " table))))

(defn- build-count-sql
  "Build a COUNT(*) SQL string from a macaw AST FROM node and first N join nodes."
  [driver-kw from-node joins]
  (str "SELECT COUNT(*) FROM " (sql-table-ref driver-kw from-node)
       (when (seq joins)
         (str " " (str/join " " (map (partial sql-join-clause driver-kw) joins))))))

(defn- build-count-field-sql
  "Build a COUNT(field) SQL string for null detection in outer joins.
   rhs-column is a macaw AST column node with :table and :column keys."
  [driver-kw from-node joins rhs-column]
  (str "SELECT COUNT(" (sql-column-ref driver-kw rhs-column) ") FROM "
       (sql-table-ref driver-kw from-node)
       (when (seq joins)
         (str " " (str/join " " (map (partial sql-join-clause driver-kw) joins))))))

(defn- rhs-column-from-ast-condition
  "Extract the RHS column node from a macaw AST join condition.
   For simple equijoins, returns the full column AST node from the right side."
  [conditions]
  (when-let [condition (first conditions)]
    (when (= (:type condition) :macaw.ast/binary-expression)
      (let [right (:right condition)]
        (when (= (:type right) :macaw.ast/column)
          right)))))

;;; -------------------------------------------------- Lens Implementation --------------------------------------------------

(defmethod lenses.core/lens-applicable? :join-analysis
  [_ ctx]
  ;; Only applicable if the transform has joins
  (:has-joins? ctx))

(defmethod lenses.core/lens-metadata :join-analysis
  [_ _ctx]
  {:id           "join-analysis"
   :display-name "Join Analysis"
   :description  "Analyze join quality and match rates"})

;;; -------------------------------------------------- Summary --------------------------------------------------

(defn- make-summary
  "Create the summary section with highlights.
   Values are nil initially - populated after card execution via feedback."
  [ctx]
  (let [join-structure (:join-structure ctx)
        join-count     (count join-structure)
        strategies     (distinct (map :strategy join-structure))]
    {:text       (str join-count " join(s): "
                      (str/join ", " (map name strategies)))
     :highlights [{:label   "Match Rate"
                   :value   nil  ; Computed from card results
                   :card-id "computed-join-stats"}
                  {:label   "Joins"
                   :value   join-count}]
     :alerts     []}))  ; Populated via feedback

;;; -------------------------------------------------- Sections --------------------------------------------------

(defn- make-sections
  "Create sections for the join analysis lens."
  []
  [{:id          "overview"
    :title       "Join Overview"
    :description "High-level join statistics"}
   {:id          "join-details"
    :title       "Join Details"
    :description "Per-join statistics"}
   {:id          "data-quality"
    :title       "Data Quality"
    :description "Null rates and anomalies"}])

;;; -------------------------------------------------- Alert Triggers --------------------------------------------------

(defn- make-alert-triggers
  "Define alert triggers based on card results.
   These are evaluated by the heuristics module after card execution.

   The heuristics module computes derived stats (match-rate, expansion-factor)
   from the raw step-N-count and step-N-matched card values, then stores them
   in a synthetic 'computed-join-stats' card that these conditions reference."
  [_ctx]
  [;; Low match rate alert (for outer joins)
   ;; Triggered when match-rate < 0.9 (computed from step-N-matched / step-(N-1)-count)
   {:id            "low-match-rate"
    :type          :low-match-rate
    :severity      :warning
    :condition     [:card-id "computed-join-stats" :match-rate :< 0.9]
    :context-cards [[:match-rate "computed-join-stats" :match-rate]
                    [:unmatched-count "computed-join-stats" :unmatched-count]]
    :card-ids      ["step-0-count"]
    :drill-lens-id "unmatched-analysis"}

   ;; Row expansion alert (possible cross-product)
   ;; Triggered when final count > 2x base count
   {:id            "row-expansion"
    :type          :row-expansion
    :severity      :warning
    :condition     [:card-id "computed-join-stats" :expansion-factor :> 2.0]
    :context-cards [[:expansion-factor "computed-join-stats" :expansion-factor]
                    [:base-count "computed-join-stats" :base-count]
                    [:final-count "computed-join-stats" :final-count]]
    :card-ids      ["step-0-count"]}

   ;; Row contraction alert (possible data loss or aggressive filtering)
   ;; Triggered when final count < 50% of base count
   {:id            "row-contraction"
    :type          :row-contraction
    :severity      :info
    :condition     [:card-id "computed-join-stats" :expansion-factor :< 0.5]
    :context-cards [[:contraction-factor "computed-join-stats" :expansion-factor]
                    [:base-count "computed-join-stats" :base-count]
                    [:final-count "computed-join-stats" :final-count]]
    :card-ids      ["step-0-count"]}])

;;; -------------------------------------------------- Drill Lens Triggers --------------------------------------------------

(defn- make-drill-lens-triggers
  "Define drill lens triggers.
   These determine when drill-down lenses become available.
   Conditions reference computed stats from the synthetic 'computed-join-stats' card."
  []
  [{:id                    "unmatched-analysis"
    :display-name          "Unmatched Rows"
    :description           "Investigate unmatched join rows"
    :condition             [:card-id "computed-join-stats" :match-rate :< 0.95]
    :display-name-template (fn [{:keys [unmatched-count]}]
                             (if unmatched-count
                               (str "Investigate " unmatched-count " Unmatched Rows")
                               "Investigate Unmatched Rows"))
    :context-cards         [[:unmatched-count "computed-join-stats" :unmatched-count]
                            [:match-rate "computed-join-stats" :match-rate]]}

   {:id           "join-key-distribution"
    :display-name "Join Key Distribution"
    :description  "Analyze distribution of join key values"
    :condition    :always}])

;;; -------------------------------------------------- Drill Lenses --------------------------------------------------

(defn- make-drill-lenses
  "Create drill lens definitions (inactive by default)."
  []
  [{:id           "unmatched-analysis"
    :display-name "Unmatched Rows"
    :description  "Investigate unmatched join rows"}
   {:id           "join-key-distribution"
    :display-name "Join Key Distribution"
    :description  "Analyze distribution of join key values"}])

;;; -------------------------------------------------- Lens Definition --------------------------------------------------

(defmethod lenses.core/make-lens-definition :join-analysis
  [_ ctx]
  {:id                  "join-analysis"
   :display-name        "Join Analysis"
   :layout              :flat
   :summary             (make-summary ctx)
   :sections            (make-sections)
   :drill-lenses        (make-drill-lenses)
   :alert-triggers      (make-alert-triggers ctx)
   :drill-lens-triggers (make-drill-lens-triggers)})

;;; -------------------------------------------------- Query Building Helpers --------------------------------------------------

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
      (update :stages (fn [stages]
                        (mapv #(select-keys % [:lib/type :source-table]) stages)))))

(defn- strip-stage-to-count
  "Strip a stage down to just source-table, joins, and COUNT(*) aggregation."
  [stage]
  (let [base (-> stage
                 (select-keys [:lib/type :source-table])
                 (assoc :aggregation [[:count {:lib/uuid (str (random-uuid))}]]))]
    (if-let [joins (seq (:joins stage))]
      (assoc base :joins (mapv strip-join-to-essentials joins))
      base)))

(defn- make-count-query-with-n-joins
  "Create a COUNT(*) query with only the first n joins.
   Removes filters, group-by, order-by, etc."
  [query n]
  (-> query
      (query-with-n-joins n)
      (update-in [:stages 0] strip-stage-to-count)))

(defn- fresh-uuid-field-ref
  "Copy a field reference with a fresh :lib/uuid."
  [field-ref]
  (when field-ref
    (if (and (vector? field-ref) (= :field (first field-ref)) (map? (second field-ref)))
      (assoc-in field-ref [1 :lib/uuid] (str (random-uuid)))
      field-ref)))

(defn- get-rhs-field-from-condition
  "Extract the RHS field reference from a join condition.
   The RHS field is the one with :join-alias."
  [conditions]
  (when-let [condition (first conditions)]
    (when (and (vector? condition) (>= (count condition) 4))
      (let [[_op _opts _lhs rhs] condition]
        (when (and (vector? rhs)
                   (= :field (first rhs))
                   (:join-alias (second rhs)))
          rhs)))))

(defn- make-count-field-query-with-n-joins
  "Create a COUNT(field) query with only the first n joins.
   Used to count non-null values (matched rows) in outer joins."
  [query n field-ref]
  (-> query
      (query-with-n-joins n)
      (update-in [:stages 0]
                 (fn [stage]
                   (let [base (-> stage
                                  (select-keys [:lib/type :source-table])
                                  (assoc :aggregation [[:count {:lib/uuid (str (random-uuid))}
                                                        (fresh-uuid-field-ref field-ref)]]))]
                     (if-let [joins (seq (:joins stage))]
                       (assoc base :joins (mapv strip-join-to-essentials joins))
                       base))))))

;;; -------------------------------------------------- Card Generation --------------------------------------------------

(defn- make-iterative-join-cards-mbql
  "Generate iterative join cards for MBQL queries.
   For a query: FROM t1 JOIN t2 JOIN t3
   Generates:
   - step-0-count: COUNT(*) from t1 only (base count)
   - step-1-count: COUNT(*) from t1 JOIN t2
   - step-2-count: COUNT(*) from t1 JOIN t2 JOIN t3 (final count)
   - step-1-matched: COUNT(rhs_field) for step 1 if outer join
   - step-2-matched: COUNT(rhs_field) for step 2 if outer join"
  [preprocessed-query]
  (let [joins (get-in preprocessed-query [:stages 0 :joins] [])
        join-count (count joins)]
    (concat
     ;; Step 0: Base count (no joins)
     [{:id            "step-0-count"
       :section-id    "join-details"
       :title         "Base Row Count (before joins)"
       :display       :scalar
       :dataset-query (make-count-query-with-n-joins preprocessed-query 0)
       :summary       true
       :interestingness 1.0}]

     ;; For each join step
     (mapcat
      (fn [step]
        (let [join (nth joins (dec step))
              strategy (or (:strategy join) :left-join)
              alias (or (:alias join) (str "join-" step))
              is-outer? (contains? #{:left-join :right-join :full-join} strategy)
              rhs-field (when is-outer?
                          (get-rhs-field-from-condition (:conditions join)))]
          (cond-> []
            ;; Row count after this join
            true
            (conj {:id            (str "step-" step "-count")
                   :section-id    "join-details"
                   :title         (str "Row Count after " (name strategy) " with " alias)
                   :display       :scalar
                   :dataset-query (make-count-query-with-n-joins preprocessed-query step)
                   :summary       true
                   :interestingness 1.0})

            ;; For outer joins: COUNT(rhs_field) to get matched count
            (and is-outer? rhs-field)
            (conj {:id            (str "step-" step "-matched")
                   :section-id    "join-details"
                   :title         (str "Matched Rows in " alias)
                   :display       :scalar
                   :dataset-query (make-count-field-query-with-n-joins preprocessed-query step rhs-field)
                   :summary       true
                   :interestingness 1.0}))))
      (range 1 (inc join-count))))))

(defn- make-native-count-query
  "Create a native COUNT query dataset-query map."
  [db-id sql]
  {:lib/type :mbql/query
   :database db-id
   :stages [{:lib/type :mbql.stage/native
             :native sql}]})

(defn- make-native-join-cards
  "Generate join cards for native queries.
   Builds SQL strings from the macaw AST to compute iterative join statistics:
   - step-0-count: COUNT(*) from base table only (no joins)
   - step-1-count: COUNT(*) with first join
   - step-2-count: COUNT(*) with first two joins
   - etc.
   - step-N-matched: COUNT(rhs_field) for outer joins"
  [ctx]
  (let [{:keys [db-id parsed-ast driver-kw]} ctx
        from-node (:from parsed-ast)
        join-nodes (:join parsed-ast)]
    (when (and from-node (seq join-nodes))
      (let [join-count (count join-nodes)]
        (concat
         ;; Step 0: Base count (no joins)
         [{:id            "step-0-count"
           :section-id    "join-details"
           :title         "Base Row Count (before joins)"
           :display       :scalar
           :dataset-query (make-native-count-query db-id (build-count-sql driver-kw from-node []))
           :summary       true
           :interestingness 1.0}]

         ;; For each join step
         (mapcat
          (fn [step]
            (let [joins-so-far (take step join-nodes)
                  join-node (nth join-nodes (dec step))
                  strategy (ast-join-type->strategy (:join-type join-node))
                  alias (or (get-in join-node [:source :table-alias])
                            (get-in join-node [:source :table])
                            (str "join-" step))
                  is-outer? (contains? #{:left-join :right-join :full-join} strategy)
                  rhs-col (when is-outer?
                            (rhs-column-from-ast-condition (:condition join-node)))]
              (cond-> []
                ;; Row count after this join
                true
                (conj {:id            (str "step-" step "-count")
                       :section-id    "join-details"
                       :title         (str "Row Count after " (name strategy) " with " alias)
                       :display       :scalar
                       :dataset-query (make-native-count-query db-id (build-count-sql driver-kw from-node joins-so-far))
                       :summary       true
                       :interestingness 1.0})

                ;; For outer joins: COUNT(rhs_field) to get matched count
                (and is-outer? rhs-col)
                (conj {:id            (str "step-" step "-matched")
                       :section-id    "join-details"
                       :title         (str "Matched Rows in " alias)
                       :display       :scalar
                       :dataset-query (make-native-count-query db-id (build-count-field-sql driver-kw from-node joins-so-far rhs-col))
                       :summary       true
                       :interestingness 1.0}))))
          (range 1 (inc join-count))))))))

(defn- make-iterative-join-cards
  "Generate cards that compute row counts at each join step.
   Dispatches to MBQL-specific or native-specific implementation."
  [ctx]
  (let [{:keys [preprocessed-query source-type]} ctx]
    (if preprocessed-query
      ;; MBQL: can manipulate query to compute iterative counts
      (make-iterative-join-cards-mbql preprocessed-query)
      ;; Native: limited to base and final counts
      (when (= source-type :native)
        (make-native-join-cards ctx)))))

(defn- make-joined-table-count-cards
  "Generate row count cards for each joined table (right-side counts)."
  [ctx]
  (let [{:keys [db-id join-structure sources]} ctx]
    (keep
     (fn [{:keys [alias source-table]}]
       (when source-table
         (let [source (some #(when (= (:table-id %) source-table) %) sources)
               table-name (or (:table-name source) (str "table-" source-table))]
           (cards/row-count-card (or (:db-id source) db-id) source-table table-name "join-details"))))
     join-structure)))

(defn- make-null-rate-cards
  "Create cards for null rate analysis on join keys.
   Returns all cards flattened (main + stats cards)."
  [ctx]
  (let [{:keys [db-id visited-fields sources]} ctx
        join-field-ids (:join-fields visited-fields)]
    ;; Create distribution cards for join key fields
    (when (seq join-field-ids)
      (->> (for [{:keys [table-id table-name fields]} sources
                 field fields
                 :when (contains? join-field-ids (:id field))]
             (cards/distribution-card db-id table-id table-name field
                                      :section-id "data-quality"
                                      :summary true))
           (keep identity)
           (apply concat)))))

(defmethod lenses.core/generate-cards :join-analysis
  [_ ctx]
  (vec (concat (make-iterative-join-cards ctx)
               (make-joined-table-count-cards ctx)
               (make-null-rate-cards ctx))))

;;; -------------------------------------------------- Drill Lens: Unmatched Analysis --------------------------------------------------

(defmethod lenses.core/lens-applicable? :unmatched-analysis
  [_ ctx]
  ;; Only applicable when join-analysis lens is applicable
  (:has-joins? ctx))

(defmethod lenses.core/lens-metadata :unmatched-analysis
  [_ _ctx]
  {:id           "unmatched-analysis"
   :display-name "Unmatched Rows"
   :description  "Investigate unmatched join rows"})

(defmethod lenses.core/make-lens-definition :unmatched-analysis
  [_ _ctx]
  ;; Drill lens for investigating unmatched rows
  {:id                  "unmatched-analysis"
   :display-name        "Unmatched Rows Analysis"
   :layout              :flat
   :summary             {:text "Analysis of rows that didn't match in the join"
                         :highlights []
                         :alerts []}
   :sections            [{:id "unmatched" :title "Unmatched Rows"}]
   :drill-lenses        []
   :alert-triggers      []
   :drill-lens-triggers []})

(defmethod lenses.core/generate-cards :unmatched-analysis
  [_ _ctx]
  ;; Drill lens for investigating unmatched rows
  ;; Would generate cards filtered to NULL join keys
  [])  ; Cards would be generated here for filtered queries

;;; -------------------------------------------------- Drill Lens: Join Key Distribution --------------------------------------------------

(defmethod lenses.core/lens-applicable? :join-key-distribution
  [_ ctx]
  (:has-joins? ctx))

(defmethod lenses.core/lens-metadata :join-key-distribution
  [_ _ctx]
  {:id           "join-key-distribution"
   :display-name "Join Key Distribution"
   :description  "Analyze distribution of join key values"})

(defmethod lenses.core/make-lens-definition :join-key-distribution
  [_ _ctx]
  ;; Drill lens for join key distribution
  {:id                  "join-key-distribution"
   :display-name        "Join Key Distribution"
   :layout              :comparison
   :summary             {:text "Distribution of values in join key columns"
                         :highlights []
                         :alerts []}
   :sections            [{:id "distributions" :title "Join Key Distributions"}]
   :drill-lenses        []
   :alert-triggers      []
   :drill-lens-triggers []})

(defmethod lenses.core/generate-cards :join-key-distribution
  [_ ctx]
  ;; Drill lens for join key distribution - reuses null rate cards
  (vec (make-null-rate-cards ctx)))
