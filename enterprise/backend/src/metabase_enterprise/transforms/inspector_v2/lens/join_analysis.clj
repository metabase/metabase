(ns metabase-enterprise.transforms.inspector-v2.lens.join-analysis
  "Join Analysis lens - analyze join quality and data flow.

   Cards returned:
   - base-count: COUNT(*) with 0 joins
   - join-step-N: [COUNT(*), COUNT(rhs_field)] for each join step
   - table-N-count: COUNT(*) for each joined table (right-row-count)

   FE derives from card results:
   - null-count = output-count - matched-count
   - left-row-count = previous step's output-count
   - match-rate = matched-count / left-row-count

   Layout: :flat (FE renders as table based on lens type)"
  (:require
   [clojure.string :as str]
   [metabase-enterprise.transforms.inspector-v2.lens.core :as lens.core]
   [metabase.driver.sql.normalize :as sql.normalize]
   [metabase.driver.sql.query-processor :as sql.qp]
   [metabase.lib-be.core :as lib-be]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]))

(set! *warn-on-reflection* true)

(lens.core/register-lens! :join-analysis 10)

;;; -------------------------------------------------- MBQL Query Building --------------------------------------------------

(defn- strip-join-to-essentials
  [join]
  (-> join
      (select-keys [:lib/type :strategy :alias :conditions :stages])
      (update :stages (fn [stages]
                        (mapv #(select-keys % [:lib/type :source-table]) stages)))))

(defn- query-with-n-joins
  [query n]
  (if (zero? n)
    (update-in query [:stages 0] dissoc :joins)
    (update-in query [:stages 0 :joins] #(vec (take n %)))))

(defn- make-count-query
  [query]
  (update-in query [:stages 0]
             (fn [stage]
               (let [base (-> stage
                              (select-keys [:lib/type :source-table])
                              (assoc :aggregation [[:count {:lib/uuid (str (random-uuid))}]]))]
                 (if-let [joins (seq (:joins stage))]
                   (assoc base :joins (mapv strip-join-to-essentials joins))
                   base)))))

(defn- fresh-uuid-field-ref
  [field-ref]
  (when (and (vector? field-ref) (= :field (first field-ref)) (map? (second field-ref)))
    (assoc-in field-ref [1 :lib/uuid] (str (random-uuid)))))

(defn- get-rhs-field-from-condition
  [conditions]
  (when-let [condition (first conditions)]
    (when (and (vector? condition) (>= (count condition) 4))
      (let [[_op _opts _lhs rhs] condition]
        (when (and (vector? rhs)
                   (= :field (first rhs))
                   (:join-alias (second rhs)))
          rhs)))))

(defn- make-join-step-query-mbql
  "Query returning [COUNT(*), COUNT(rhs_field)] for outer joins, [COUNT(*)] otherwise."
  [query step join]
  (let [strategy (or (:strategy join) :left-join)
        is-outer? (contains? #{:left-join :right-join :full-join} strategy)
        rhs-field (when is-outer? (get-rhs-field-from-condition (:conditions join)))
        step-query (-> query (query-with-n-joins step) make-count-query)]
    (if rhs-field
      (update-in step-query [:stages 0 :aggregation]
                 conj [:count {:lib/uuid (str (random-uuid))}
                       (fresh-uuid-field-ref rhs-field)])
      step-query)))

(defn- make-table-count-query
  [db-id table-id]
  (let [mp (lib-be/application-database-metadata-provider db-id)
        table-metadata (lib.metadata/table mp table-id)]
    (-> (lib/query mp table-metadata)
        (lib/aggregate (lib/count)))))

;;; -------------------------------------------------- Native SQL Building --------------------------------------------------

(defn- sql-quote
  [driver-kw s]
  (let [style (sql.qp/quote-style driver-kw)
        s (sql.normalize/normalize-name driver-kw (str s))]
    (case style
      :mysql (str "`" (str/replace s "`" "``") "`")
      :sqlserver (str "[" (str/replace s "]" "]]") "]")
      (str "\"" (str/replace s "\"" "\"\"") "\""))))

(defn- sql-table-ref
  [driver-kw {:keys [schema table table-alias]}]
  (str (when schema (str (sql-quote driver-kw schema) "."))
       (sql-quote driver-kw table)
       (when table-alias (str " " (sql-quote driver-kw table-alias)))))

(defn- sql-column-ref
  [driver-kw {:keys [schema table column]}]
  (str/join "." (map (partial sql-quote driver-kw) (remove nil? [schema table column]))))

(defn- sql-literal
  "Convert a macaw literal to SQL."
  [{:keys [value]}]
  (cond
    (string? value) (str "'" (str/replace value "'" "''") "'")
    (nil? value) "NULL"
    :else (str value)))

(defn- sql-expr
  "Convert a macaw AST expression to SQL."
  [driver-kw node]
  (case (:type node)
    :macaw.ast/column (sql-column-ref driver-kw node)
    :macaw.ast/literal (sql-literal node)
    nil))

(defn- sql-condition
  "Convert a macaw AST condition to SQL. Handles AND/OR compound conditions recursively."
  [driver-kw condition]
  (when (= (:type condition) :macaw.ast/binary-expression)
    (let [{:keys [operator left right]} condition
          op-upper (str/upper-case (str operator))]
      (cond
        ;; Compound condition (AND/OR) - recurse into both sides
        (contains? #{"AND" "OR"} op-upper)
        (let [left-sql (sql-condition driver-kw left)
              right-sql (sql-condition driver-kw right)]
          (when (and left-sql right-sql)
            (str "(" left-sql " " op-upper " " right-sql ")")))

        ;; Binary comparison - handle columns, literals, etc.
        :else
        (let [left-sql (sql-expr driver-kw left)
              right-sql (sql-expr driver-kw right)]
          (when (and left-sql right-sql)
            (str left-sql " " operator " " right-sql)))))))

(def ^:private strategy->sql
  {:left-join  "LEFT JOIN"
   :right-join "RIGHT JOIN"
   :full-join  "FULL JOIN"
   :cross-join "CROSS JOIN"
   :inner-join "JOIN"})

(defn- sql-join-clause
  [driver-kw {:keys [strategy ast-node]}]
  (let [table (sql-table-ref driver-kw (:source ast-node))
        ;; :condition may be a single node or a list - normalize to list
        conditions-raw (:condition ast-node)
        conditions-list (if (sequential? conditions-raw) conditions-raw [conditions-raw])
        ;; Each condition may be compound (with AND) - sql-condition handles that
        on-parts (keep (partial sql-condition driver-kw) conditions-list)
        on-clause (when (seq on-parts) (str/join " AND " on-parts))]
    (if on-clause
      (str (strategy->sql strategy) " " table " ON " on-clause)
      (str (strategy->sql strategy) " " table))))

(defn- rhs-column-from-ast
  "Extract the first RHS column from join conditions (for COUNT(rhs_field) in outer joins).
   Handles compound AND conditions by recursively searching."
  [conditions]
  (let [conditions-list (if (sequential? conditions) conditions [conditions])]
    (some (fn find-rhs [cond]
            (when (= (:type cond) :macaw.ast/binary-expression)
              (let [{:keys [operator left right]} cond
                    op-upper (str/upper-case (str operator))]
                (if (contains? #{"AND" "OR"} op-upper)
                  ;; Compound - recurse into left side first
                  (or (find-rhs left) (find-rhs right))
                  ;; Simple comparison - check if right is a column
                  (when (= (:type right) :macaw.ast/column)
                    right)))))
          conditions-list)))

(defn- build-native-join-step-sql
  "SQL returning [COUNT(*), COUNT(rhs_field)] for outer joins."
  [driver-kw from-ast joins-so-far current-join]
  (let [strategy (:strategy current-join)
        is-outer? (contains? #{:left-join :right-join :full-join} strategy)
        rhs-col (when is-outer? (rhs-column-from-ast (:condition (:ast-node current-join))))
        from-clause (str "FROM " (sql-table-ref driver-kw from-ast)
                         (when (seq joins-so-far)
                           (str " " (str/join " " (map (partial sql-join-clause driver-kw) joins-so-far)))))]
    (if rhs-col
      (str "SELECT COUNT(*), COUNT(" (sql-column-ref driver-kw rhs-col) ") " from-clause)
      (str "SELECT COUNT(*) " from-clause))))

(defn- make-native-query
  [db-id sql]
  {:lib/type :mbql/query
   :database db-id
   :stages   [{:lib/type :mbql.stage/native
               :native   sql}]})

;;; -------------------------------------------------- Card Generation --------------------------------------------------

(defn- resolve-from-table-id
  "Find the table-id for the FROM table."
  [{:keys [source-type preprocessed-query parsed-ast driver-kw sources]}]
  (case source-type
    :mbql (get-in preprocessed-query [:stages 0 :source-table])
    :native (let [from-name (get-in parsed-ast [:from :table])]
              (->> sources
                   (some #(when (= (sql.normalize/normalize-name driver-kw (:table-name %))
                                   (sql.normalize/normalize-name driver-kw from-name))
                            (:table-id %)))))))

(defn- base-count-card
  [ctx]
  (let [{:keys [source-type preprocessed-query parsed-ast driver-kw db-id]} ctx
        source-table-id (resolve-from-table-id ctx)]
    {:id         "base-count"
     :section-id "join-stats"
     :title      "Base Row Count"
     :display    :scalar
     :dataset-query
     (case source-type
       :mbql (-> preprocessed-query (query-with-n-joins 0) make-count-query)
       :native (make-native-query db-id
                 (str "SELECT COUNT(*) FROM " (sql-table-ref driver-kw (:from parsed-ast)))))
     :metadata {:dedup-key [:table-count source-table-id]
                :card-type :base-count}}))

(defn- join-step-card
  [ctx step]
  (let [{:keys [source-type preprocessed-query parsed-ast driver-kw db-id join-structure]} ctx
        join (nth join-structure (dec step))
        {:keys [strategy alias]} join]
    {:id         (str "join-step-" step)
     :section-id "join-stats"
     :title      (str "Join " step ": " alias)
     :display    :table
     :dataset-query
     (case source-type
       :mbql (make-join-step-query-mbql preprocessed-query step
               (nth (get-in preprocessed-query [:stages 0 :joins]) (dec step)))
       :native (make-native-query db-id
                 (build-native-join-step-sql driver-kw (:from parsed-ast)
                                             (take step join-structure) join)))
     :metadata {:card-type     :join-step
                :join-step     step
                :join-alias    alias
                :join-strategy strategy}}))

(defn- table-count-card
  [ctx step]
  (let [{:keys [join-structure sources db-id]} ctx
        join (nth join-structure (dec step))
        table-id (:source-table join)
        table (some #(when (= (:table-id %) table-id) %) sources)]
    (when table
      {:id         (str "table-" step "-count")
       :section-id "join-stats"
       :title      (str (:table-name table) " Row Count")
       :display    :scalar
       :dataset-query (make-table-count-query (or (:db-id table) db-id) table-id)
       :metadata   {:dedup-key  [:table-count table-id]
                    :card-type  :table-count
                    :join-step  step
                    :table-id   table-id}})))

(defn- all-cards
  [ctx]
  (let [join-count (count (:join-structure ctx))]
    (into [(base-count-card ctx)]
          (mapcat (fn [step]
                    (let [step-card (join-step-card ctx step)
                          table-card (table-count-card ctx step)]
                      (if table-card
                        [step-card table-card]
                        [step-card])))
                  (range 1 (inc join-count))))))

;;; -------------------------------------------------- Lens Implementation --------------------------------------------------

(defmethod lens.core/lens-applicable? :join-analysis
  [_ ctx]
  (:has-joins? ctx))

(defmethod lens.core/lens-metadata :join-analysis
  [_ _ctx]
  {:id           "join-analysis"
   :display-name "Join Analysis"
   :description  "Analyze join quality and match rates"})

(defn- make-triggers
  "Generate alert and drill-lens triggers for join steps."
  [join-structure]
  (let [outer-joins (filter #(contains? #{:left-join :right-join :full-join}
                                        (:strategy %))
                            (map-indexed #(assoc %2 :step (inc %1)) join-structure))]
    {:alert-triggers
     (for [{:keys [step alias]} outer-joins]
       {:id         (str "high-null-rate-" step)
        :condition  {:name    :high-null-rate
                     :card-id (str "join-step-" step)}
        :severity   :warning
        :message    (str "Join '" alias "' has >20% unmatched rows")})

     :drill-lens-triggers
     (for [{:keys [step alias]} outer-joins]
       {:lens-id   "unmatched-rows"
        :condition {:name    :has-unmatched-rows
                    :card-id (str "join-step-" step)}
        :params    {:join-step step}
        :reason    (str "Unmatched rows in " alias)})}))

(defmethod lens.core/make-lens :join-analysis
  [_ ctx _params]
  (let [{:keys [join-structure]} ctx
        join-count (count join-structure)
        strategies (distinct (map :strategy join-structure))
        triggers (make-triggers join-structure)]
    {:id                   "join-analysis"
     :display-name         "Join Analysis"
     :summary              {:text       (str join-count " join(s): " (str/join ", " (map name strategies)))
                            :highlights [{:label "Joins" :value join-count}]}
     :sections             [{:id     "join-stats"
                             :title  "Join Statistics"
                             :layout :flat}]
     :cards                (all-cards ctx)
     :alert-triggers       (vec (:alert-triggers triggers))
     :drill-lens-triggers  (vec (:drill-lens-triggers triggers))}))
