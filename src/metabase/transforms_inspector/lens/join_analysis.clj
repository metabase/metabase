(ns metabase.transforms-inspector.lens.join-analysis
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
   [metabase.lib-be.core :as lib-be]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.transforms-inspector.lens.core :as lens.core]))

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
;;; Uses prebuilt SQL strings from query-analysis (no macaw AST knowledge needed here)

(defn- build-native-join-step-sql
  "SQL returning [COUNT(*), COUNT(rhs_field)] for outer joins.
   Uses prebuilt :join-clause-sql and :rhs-column-sql from join-structure."
  [from-clause-sql joins-so-far current-join]
  (let [strategy (:strategy current-join)
        is-outer? (contains? #{:left-join :right-join :full-join} strategy)
        rhs-col-sql (when is-outer? (:rhs-column-sql current-join))
        from-clause (str "FROM " from-clause-sql
                         (when (seq joins-so-far)
                           (str " " (str/join " " (map :join-clause-sql joins-so-far)))))]
    (if rhs-col-sql
      (str "SELECT COUNT(*), COUNT(" rhs-col-sql ") " from-clause)
      (str "SELECT COUNT(*) " from-clause))))

(defn- make-native-query
  [db-id sql]
  {:lib/type :mbql/query
   :database db-id
   :stages   [{:lib/type :mbql.stage/native
               :native   sql}]})

;;; -------------------------------------------------- Card Generation --------------------------------------------------

(defn- resolve-from-table-id
  "Find the table_id for the FROM table."
  [{:keys [source-type preprocessed-query sources]}]
  (case source-type
    :mbql (get-in preprocessed-query [:stages 0 :source-table])
    ;; For native, first source is the FROM table
    :native (:table_id (first sources))))

(defn- base-count-card
  [ctx params]
  (let [{:keys [source-type preprocessed-query from-clause-sql db-id]} ctx
        source-table-id (resolve-from-table-id ctx)]
    {:id         (lens.core/make-card-id "base-count" params)
     :section_id "join-stats"
     :title      "Base Row Count"
     :display    :scalar
     :dataset_query
     (case source-type
       :mbql (-> preprocessed-query (query-with-n-joins 0) make-count-query)
       :native (make-native-query db-id
                                  (str "SELECT COUNT(*) FROM " from-clause-sql)))
     :metadata {:dedup_key [:table_count source-table-id]
                :card_type :base_count}}))

(defn- join-step-card
  [ctx step params]
  (let [{:keys [source-type preprocessed-query from-clause-sql db-id join-structure]} ctx
        join (nth join-structure (dec step))
        {:keys [strategy alias]} join]
    {:id         (lens.core/make-card-id (str "join-step-" step) params)
     :section_id "join-stats"
     :title      (str "Join " step ": " alias)
     :display    :table
     :dataset_query
     (case source-type
       :mbql (make-join-step-query-mbql preprocessed-query step
                                        (nth (get-in preprocessed-query [:stages 0 :joins]) (dec step)))
       :native (make-native-query db-id
                                  (build-native-join-step-sql from-clause-sql
                                                              (take step join-structure) join)))
     :metadata {:card_type     :join_step
                :join_step     step
                :join_alias    alias
                :join_strategy strategy}}))

(defn- table-count-card
  [ctx step params]
  (let [{:keys [join-structure sources db-id]} ctx
        join (nth join-structure (dec step))
        table-id (:source-table join)
        table (some #(when (= (:table_id %) table-id) %) sources)]
    (when table
      {:id         (lens.core/make-card-id (str "table-" step "-count") params)
       :section_id "join-stats"
       :title      (str (:table_name table) " Row Count")
       :display    :scalar
       :dataset_query (make-table-count-query (or (:db_id table) db-id) table-id)
       :metadata   {:dedup_key  [:table_count table-id]
                    :card_type  :table_count
                    :join_step  step
                    :table_id   table-id}})))

(defn- all-cards
  [ctx params]
  (let [join-count (count (:join-structure ctx))]
    (into [(base-count-card ctx params)]
          (mapcat (fn [step]
                    (let [step-card (join-step-card ctx step params)
                          table-card (table-count-card ctx step params)]
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
   :display_name "Join Analysis"
   :description  "Analyze join quality and match rates"
   :complexity   {:level :very-slow}})

(defn- make-triggers
  "Generate alert and drill-lens triggers for join steps."
  [join-structure params]
  (let [outer-joins (filter #(contains? #{:left-join :right-join :full-join}
                                        (:strategy %))
                            (map-indexed #(assoc %2 :step (inc %1)) join-structure))]
    {:alert_triggers
     (for [{:keys [step alias strategy]} outer-joins]
       {:id         (str "high-null-rate-" step)
        :condition  {:name    :high-null-rate
                     :card_id (lens.core/make-card-id (str "join-step-" step) params)}
        :severity   :warning
        :message    (str "Join '" alias "' has >20% unmatched rows")
        :metadata   {:join_step     step
                     :join_alias    alias
                     :join_strategy strategy}})

     :drill_lens_triggers
     (for [{:keys [step alias strategy]} outer-joins]
       {:lens_id   "unmatched-rows"
        :condition {:name    :has-unmatched-rows
                    :card_id (lens.core/make-card-id (str "join-step-" step) params)}
        :params    {:join_step step}
        :reason    (str "Unmatched rows in " alias)
        :metadata  {:join_step     step
                    :join_alias    alias
                    :join_strategy strategy}})}))

(defmethod lens.core/make-lens :join-analysis
  [lens-type ctx params]
  (let [{:keys [join-structure]} ctx
        join-count (count join-structure)
        strategies (distinct (map :strategy join-structure))
        triggers (make-triggers join-structure params)]
    (lens.core/with-metadata lens-type ctx
      {:summary              {:text       (str join-count " join(s): " (str/join ", " (map name strategies)))
                              :highlights [{:label "Joins" :value join-count}]}
       :sections             [{:id     "join-stats"
                               :title  "Join Statistics"
                               :layout :flat}]
       :cards                (all-cards ctx params)
       :alert_triggers       (vec (:alert_triggers triggers))
       :drill_lens_triggers  (vec (:drill_lens_triggers triggers))})))
