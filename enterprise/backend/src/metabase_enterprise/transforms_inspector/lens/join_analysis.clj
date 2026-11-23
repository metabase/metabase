(ns metabase-enterprise.transforms-inspector.lens.join-analysis
  "Join Analysis lens - analyze join quality and data flow.

   Cards returned:
   - base-count: COUNT(*) with 0 joins
   - join-step-N: [output COUNT(*), matched COUNT(*)] for each join step. MBQL counts the matched rows with
     COUNT(CASE WHEN join_condition THEN 1 END); native step queries come from sql-tools, which counts them the same way
     when the condition allows it, and otherwise from the same join chain with the last join made INNER.
   - table-N-count: COUNT(*) for each joined table (right-row-count)

   FE derives from card results:
   - null-count = output-count - matched-count
   - left-row-count = previous step's output-count
   - match-rate = matched-count / left-row-count

   Layout: :flat (FE renders as table based on lens type)"
  (:require
   [clojure.string :as str]
   [metabase-enterprise.transforms-inspector.lens.core :as lens.core]
   [metabase-enterprise.transforms-inspector.lens.query-util :as query-util]
   [metabase.lib-be.core :as lib-be]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.lib.util :as lib.util]
   [metabase.util.i18n :refer [tru trun]]))

(set! *warn-on-reflection* true)

(lens.core/register-lens! :join-analysis 10)

(defn- get-join-structure
  "Get join-structure from whichever sub-context is present."
  [ctx]
  (:join-structure (or (:mbql-context ctx) (:native-context ctx))))

(defn- outer-join?
  [strategy]
  (contains? #{:left-join :right-join :full-join} strategy))

;;; -------------------------------------------------- MBQL Query Building --------------------------------------------------

(defn- make-count-query
  [query]
  (lib/aggregate query (lib/count)))

(defn- make-join-step-query-mbql
  "Query returning [COUNT(*), COUNT(CASE WHEN join_condition THEN 1 END)] for outer joins, [COUNT(*)] otherwise."
  [query step join]
  (let [strategy   (or (:strategy join) :left-join)
        outer?     (outer-join? strategy)
        step-query (-> query (query-util/bare-query-with-n-joins step) make-count-query)]
    (if outer?
      (let [conditions (:conditions join)
            combined   (if (= 1 (count conditions))
                         (first conditions)
                         (apply lib/and conditions))]
        (lib/aggregate step-query (lib/count (lib/case [[(lib.util/fresh-uuids combined) 1]]))))
      step-query)))

(defn- make-table-count-query
  [db-id table-id]
  (let [mp (lib-be/application-database-metadata-provider db-id)
        table-metadata (lib.metadata/table mp table-id)]
    (-> (lib/query mp table-metadata)
        (lib/aggregate (lib/count)))))

;;; -------------------------------------------------- Native SQL --------------------------------------------------

(defn- native-count-query
  "The count query `sql`, which [[metabase.sql-tools.core/join-steps]] generated, as a native query on `db-id`."
  [db-id sql]
  (lib/native-query (lib-be/application-database-metadata-provider db-id) sql))

;;; -------------------------------------------------- Card Generation --------------------------------------------------

(defn- base-count-card
  [ctx params]
  (let [{:keys [source-type from-table-id db-id]} ctx
        source-table-id from-table-id]
    {:id         (lens.core/make-card-id "base-count" params)
     :section_id "join-stats"
     :title      (tru "Base Row Count")
     :display    :scalar
     :dataset_query
     (case source-type
       :mbql   (-> (:preprocessed-query (:mbql-context ctx)) (query-util/bare-query-with-n-joins 0) make-count-query)
       :native (native-count-query db-id (:from-count-sql (:native-context ctx))))
     :metadata {:dedup_key [:table_count source-table-id]
                :card_type :base_count}}))

(defn- join-step-card
  [ctx step params]
  (let [{:keys [source-type db-id]} ctx
        join-structure (get-join-structure ctx)
        join (nth join-structure (dec step))
        {:keys [strategy alias]} join]
    {:id         (lens.core/make-card-id (str "join-step-" step) params)
     :section_id "join-stats"
     :title      (tru "Join {0}: {1}" step alias)
     :display    :table
     :dataset_query
     (case source-type
       :mbql   (let [preprocessed-query (:preprocessed-query (:mbql-context ctx))]
                 (make-join-step-query-mbql preprocessed-query step
                                            (nth (lib/joins preprocessed-query 0) (dec step))))
       :native (native-count-query db-id (:step-sql join)))
     :metadata {:card_type     :join_step
                :join_step     step
                :join_alias    alias
                :join_strategy strategy}}))

(defn- table-count-card
  [ctx step params]
  (let [{:keys [sources db-id]} ctx
        join-structure (get-join-structure ctx)
        join (nth join-structure (dec step))
        table-id (:source-table join)
        table (some #(when (= (:table_id %) table-id) %) sources)]
    (when table
      {:id         (lens.core/make-card-id (str "table-" step "-count") params)
       :section_id "join-stats"
       :title      (tru "{0} Row Count" (:table_name table))
       :display    :scalar
       :dataset_query (make-table-count-query (or (:db_id table) db-id) table-id)
       :metadata   {:dedup_key  [:table_count table-id]
                    :card_type  :table_count
                    :join_step  step
                    :table_id   table-id}})))

(defn- all-cards
  [ctx params]
  (let [join-count (count (get-join-structure ctx))]
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
  (and (:has-joins? ctx)
       (pos-int? (:from-table-id ctx))
       (every? #(pos-int? (:source-table %)) (get-join-structure ctx))))

(defmethod lens.core/lens-metadata :join-analysis
  [_ _ctx]
  {:id           "join-analysis"
   :display_name (tru "Join Analysis")
   :description  (tru "Analyze join quality and match rates")
   :complexity   {:level :very-slow}})

(defn- make-triggers
  "Generate alert and drill-lens triggers for join steps."
  [join-structure params]
  (let [outer-joins (filter #(outer-join? (:strategy %))
                            (map-indexed #(assoc %2 :step (inc %1)) join-structure))]
    {:alert_triggers
     (for [{:keys [step alias strategy]} outer-joins]
       {:id         (str "high-null-rate-" step)
        :condition  {:name    :high-null-rate
                     :card_id (lens.core/make-card-id (str "join-step-" step) params)}
        :severity   :warning
        :message    (tru "Join ''{0}'' has >20% unmatched rows" alias)
        :metadata   {:join_step     step
                     :join_alias    alias
                     :join_strategy strategy}})

     :drill_lens_triggers
     (for [{:keys [step alias strategy]} outer-joins]
       {:lens_id   "unmatched-rows"
        :condition {:name    :has-unmatched-rows
                    :card_id (lens.core/make-card-id (str "join-step-" step) params)}
        :params    {:join_step step}
        :reason    (tru "Unmatched rows in {0}" alias)
        :metadata  {:join_step     step
                    :join_alias    alias
                    :join_strategy strategy}})}))

(defmethod lens.core/make-lens :join-analysis
  [lens-type ctx params]
  (let [join-structure (get-join-structure ctx)
        join-count (count join-structure)
        strategies (distinct (map :strategy join-structure))
        triggers (make-triggers join-structure params)]
    (lens.core/with-metadata lens-type ctx
      {:summary              {:text       (str (trun "{0} join" "{0} joins" join-count) ": " (str/join ", " (map name strategies)))
                              :highlights [{:label (tru "Joins") :value join-count}]}
       :sections             [{:id     "join-stats"
                               :title  (tru "Join Statistics")
                               :layout :flat}]
       :cards                (all-cards ctx params)
       :alert_triggers       (vec (:alert_triggers triggers))
       :drill_lens_triggers  (vec (:drill_lens_triggers triggers))})))
