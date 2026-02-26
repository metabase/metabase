(ns metabase.transforms-inspector.lens.join-analysis
  "Join Analysis lens - analyze join quality and data flow.

   Cards returned:
   - base-count: COUNT(*) with 0 joins
   - join-step-N: [COUNT(*), COUNT(nullable_field)] for each join step
   - table-N-count: COUNT(*) for each joined table (right-row-count)

   FE derives from card results:
   - null-count = output-count - matched-count
   - left-row-count = previous step's output-count
   - match-rate = matched-count / left-row-count

   Layout: :flat (FE renders as table based on lens type)"
  (:require
   [clojure.string :as str]
   [metabase.driver.sql.query-processor :as sql.qp]
   [metabase.lib-be.core :as lib-be]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.transforms-inspector.lens.core :as lens.core]
   [metabase.transforms-inspector.lens.query-util :as query-util]
   [metabase.util.i18n :refer [tru trun]]))

(set! *warn-on-reflection* true)

(lens.core/register-lens! :join-analysis 10)

(defn- get-join-structure
  "Get join-structure from whichever sub-context is present."
  [ctx]
  (:join-structure (or (:mbql-context ctx) (:native-context ctx))))

;;; -------------------------------------------------- MBQL Query Building --------------------------------------------------

(defn- make-count-query
  [query]
  (lib/aggregate query (lib/count)))

(defn- nullable-side-field-info
  "For outer joins, return the field info for the side that becomes NULL on non-match.
   LEFT  → RHS is nullable, RIGHT → LHS is nullable, FULL → RHS (detects left-unmatched)."
  [join]
  (let [strategy (or (:strategy join) :left-join)]
    (case strategy
      (:left-join :full-join) (query-util/get-rhs-field-info (:conditions join))
      :right-join             (query-util/get-lhs-field-info (:conditions join))
      nil)))

(defn- make-join-step-query-mbql
  "Query returning [COUNT(*), COUNT(nullable_field)] for outer joins, [COUNT(*)] otherwise."
  [query step join]
  (let [field-info (nullable-side-field-info join)
        step-query (-> query (query-util/bare-query-with-n-joins step) make-count-query)]
    (if field-info
      (let [mp (lib-be/application-database-metadata-provider (:database query))
            field-meta (-> (lib.metadata/field mp (:field-id field-info))
                           (lib/with-join-alias (:join-alias field-info)))]
        (lib/aggregate step-query (lib/count field-meta)))
      step-query)))

(defn- make-table-count-query
  [db-id table-id]
  (let [mp (lib-be/application-database-metadata-provider db-id)
        table-metadata (lib.metadata/table mp table-id)]
    (-> (lib/query mp table-metadata)
        (lib/aggregate (lib/count)))))

;;; -------------------------------------------------- Native SQL Building --------------------------------------------------

(defn- nullable-side-column
  "For outer joins, return the HoneySQL column ref for the side that becomes NULL on non-match.
   LEFT/FULL → rhs-column, RIGHT → lhs-column."
  [{:keys [strategy rhs-column lhs-column]}]
  (case strategy
    (:left-join :full-join) rhs-column
    :right-join             lhs-column
    nil))

(def ^:private strategy->hsql-join-type
  "Map our join strategy keywords to HoneySQL :join-by type keywords.
   HoneySQL uses :join for INNER JOIN, not :inner-join."
  {:inner-join :join
   :left-join  :left-join
   :right-join :right-join
   :full-join  :full-join
   :cross-join :cross-join})

(defn- build-native-join-step-hsql
  "Build a HoneySQL map for [COUNT(*), COUNT(nullable_field)] with joins.
   Uses :join-by to preserve original join ordering across different join types."
  [from-table joins]
  (let [col      (nullable-side-column (last joins))
        join-by  (into [] (mapcat (fn [{:keys [strategy join-table join-condition]}]
                                    [(strategy->hsql-join-type strategy) [join-table join-condition]]))
                       joins)]
    {:select (if col
               [[[:count :*]] [[:count col]]]
               [[[:count :*]]])
     :from   [from-table]
     :join-by join-by}))

(defn- format-native-query
  "Format a HoneySQL map into a native query for the given driver and db-id."
  [driver db-id hsql]
  (let [mp (lib-be/application-database-metadata-provider db-id)]
    (lib/native-query mp (first (sql.qp/format-honeysql driver hsql)))))

;;; -------------------------------------------------- Card Generation --------------------------------------------------

(defn- base-count-card
  [ctx params]
  (let [{:keys [source-type from-table-id driver db-id]} ctx
        source-table-id from-table-id]
    {:id         (lens.core/make-card-id "base-count" params)
     :section_id "join-stats"
     :title      (tru "Base Row Count")
     :display    :scalar
     :dataset_query
     (case source-type
       :mbql   (-> (:preprocessed-query (:mbql-context ctx)) (query-util/bare-query-with-n-joins 0) make-count-query)
       :native (format-native-query driver db-id
                                    {:select [[[:count :*]]]
                                     :from   [(:from-table (:native-context ctx))]}))
     :metadata {:dedup_key [:table_count source-table-id]
                :card_type :base_count}}))

(defn- join-step-card
  [ctx step params]
  (let [{:keys [source-type driver db-id]} ctx
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
       :native (format-native-query driver db-id
                                    (build-native-join-step-hsql (:from-table (:native-context ctx))
                                                                 (take step join-structure))))
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
  (let [outer-joins (filter #(contains? #{:left-join :right-join :full-join}
                                        (:strategy %))
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
