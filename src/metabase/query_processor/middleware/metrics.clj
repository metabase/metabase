(ns metabase.query-processor.middleware.metrics
  (:require
   [medley.core :as m]
   [metabase.analytics.core :as analytics]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.lib.options :as lib.options]
   [metabase.lib.query :as lib.query]
   [metabase.lib.util :as lib.util]
   [metabase.lib.util.match :as lib.util.match]
   [metabase.lib.walk :as lib.walk]
   [metabase.util :as u]
   [metabase.util.i18n :refer [tru]]
   [metabase.util.malli :as mu]))

(defn- replace-metric-aggregation-refs [query stage-number lookup]
  (if-let [aggregations (lib/aggregations query stage-number)]
    (let [columns (lib/visible-columns query stage-number)]
      (assoc-in query [:stages stage-number :aggregation]
                (lib.util.match/replace aggregations
                  [:metric _ metric-id]
                  (if-let [{replacement :aggregation metric-name :name} (get lookup metric-id)]
                    ;; We have to replace references from the source-metric with references appropriate for
                    ;; this stage (expression/aggregation -> field, field-id to string)
                    (let [replacement (lib.util.match/replace replacement
                                        [(tag :guard #{:expression :field :aggregation}) _ _]
                                        (if-let [col (lib/find-matching-column &match columns)]
                                          (lib/ref col)
                                          ;; This is probably due to a field-id where it shouldn't be
                                          &match))]
                      (update (lib.util/fresh-uuids replacement)
                              1
                              #(merge
                                %
                                {:name metric-name}
                                (select-keys % [:name :display-name])
                                (select-keys (get &match 1) [:lib/uuid :name :display-name]))))
                    (throw (ex-info "Incompatible metric" {:match &match :lookup lookup}))))))
    query))

(defn- find-metric-ids
  [x]
  (lib.util.match/match x
    [:metric _ (id :guard pos-int?)]
    id))

(defn- fetch-referenced-metrics
  [query stage]
  (let [metric-ids (find-metric-ids stage)]
    (->> metric-ids
         (lib.metadata/bulk-metadata-or-throw query :metadata/card)
         (into {}
               (map (fn [card-metadata]
                      (let [metric-query (->> (:dataset-query card-metadata)
                                              (lib/query query)
                                              ((requiring-resolve 'metabase.query-processor.preprocess/preprocess))
                                              (lib/query query))
                            metric-name (:name card-metadata)]
                        (if-let [aggregation (first (lib/aggregations metric-query))]
                          [(:id card-metadata)
                           {:query metric-query
                            ;; Aggregation inherits `:name` of original aggregation used in a metric query. The original
                            ;; name is added in `preprocess` above if metric is defined using unnamed aggregation.
                            :aggregation aggregation
                            :name metric-name}]
                          (throw (ex-info "Source metric missing aggregation" {:source metric-query})))))))
         not-empty)))

(defn- expression-with-name-from-source
  [query agg-stage-index [_ {:lib/keys [expression-name]} :as expression]]
  (lib/expression query agg-stage-index expression-name expression))

(defn- update-metric-query-expression-names
  [metric-query unique-name-fn]
  (let [original+new-name-pairs (into []
                                      (keep (fn [[_ {:lib/keys [expression-name]}]]
                                              (let [new-name (unique-name-fn expression-name)]
                                                (when-not (= new-name expression-name)
                                                  [expression-name new-name]))))
                                      (lib/expressions metric-query))]
    (reduce
     (fn [metric-query [original-name new-name]]
       (let [expression (m/find-first (comp #{original-name} :lib/expression-name second) (lib/expressions metric-query))]
         (lib/replace-clause
          metric-query
          expression
          (lib/with-expression-name expression new-name))))
     metric-query
     original+new-name-pairs)))

(defn- temp-query-at-stage-path
  [query stage-path]
  (cond-> query
    stage-path (lib.walk/query-for-path stage-path)
    stage-path :query))

(defn- aggregation-stage-index
  [stages]
  (count (take-while (complement (comp find-metric-ids :aggregation)) stages)))

(defn- add-join-aliases
  [x source-field->join-alias]
  (lib.util.match/replace x
    [:field (opts :guard (every-pred (comp source-field->join-alias :source-field) (complement :join-alias))) _]
    (assoc-in &match [1 :join-alias] (-> opts :source-field source-field->join-alias))))

(defn- include-implicit-joins
  [query agg-stage-index metric-query]
  (let [metric-joins (lib/joins metric-query -1)
        existing-joins (into #{}
                             (map (juxt :fk-field-id :alias))
                             (lib/joins query agg-stage-index))
        new-joins (remove (comp existing-joins (juxt :fk-field-id :alias)) metric-joins)
        source-field->join-alias (dissoc (into {} (map (juxt :fk-field-id :alias)) new-joins) nil)
        query-with-joins (reduce #(lib/join %1 agg-stage-index %2)
                                 query
                                 new-joins)]
    (lib.util/update-query-stage query-with-joins agg-stage-index add-join-aliases source-field->join-alias)))

(defn- splice-compatible-metrics
  "Splices in metric definitions that are compatible with the query."
  [query path expanded-stages]
  (let [agg-stage-index (aggregation-stage-index expanded-stages)]
    (if-let [lookup (->> expanded-stages
                         (drop agg-stage-index)
                         first
                         :aggregation
                         (fetch-referenced-metrics query))]
      (let [temp-query (temp-query-at-stage-path query path)
            unique-name-fn (lib.util/unique-name-generator
                            (map
                             (comp :lib/expression-name second)
                             (lib/expressions temp-query)))
            new-query (reduce
                       (fn [query [_metric-id {metric-query :query}]]
                         (if (and (= (lib.util/source-table-id query) (lib.util/source-table-id metric-query))
                                  (or (= (lib/stage-count metric-query) 1)
                                      (= (:qp/stage-had-source-card (last (:stages metric-query)))
                                         (:qp/stage-had-source-card (lib.util/query-stage query agg-stage-index)))))
                           (let [metric-query (update-metric-query-expression-names metric-query unique-name-fn)]
                             (as-> query $q
                               (reduce #(expression-with-name-from-source %1 agg-stage-index %2)
                                       $q (lib/expressions metric-query -1))
                               (include-implicit-joins $q agg-stage-index metric-query)
                               (reduce #(lib/filter %1 agg-stage-index %2) $q (lib/filters metric-query -1))
                               (replace-metric-aggregation-refs $q agg-stage-index lookup)))
                           (throw (ex-info "Incompatible metric" {:query query
                                                                  :metric metric-query}))))
                       temp-query
                       lookup)]
        (:stages new-query))
      expanded-stages)))

(defn- find-metric-transition
  "Finds an unadjusted transition between a metric source-card and the next stage."
  [query expanded-stages]
  (some (fn [[[idx-a stage-a] [_idx-b stage-b]]]
          (let [stage-a-source (:qp/stage-is-from-source-card stage-a)
                metric-metadata (some->> stage-a-source (lib.metadata/card query))]
            (when (and
                   stage-a-source
                   (not= stage-a-source (:qp/stage-is-from-source-card stage-b))
                   (= (:type metric-metadata) :metric)
                    ;; This indicates this stage has not been processed
                    ;; because metrics must have aggregations
                    ;; if it is missing, then it has been removed in this process
                   (:aggregation stage-a))
              [idx-a metric-metadata])))
        (partition-all 2 1 (m/indexed expanded-stages))))

(defn- update-metric-transition-stages
  "Adjusts source-card metrics referencing themselves in the next stage.

   The final stage of the metric is adjusted by removing:
   ```
     :aggregation
     :breakout
     :order-by
   ```

   `:fields` are added explictly to pass previous-stage fields onto the following-stage

   The following stages will have `[:metric {} id]` clauses
   replaced with the actual aggregation of the metric."
  [query stage-path expanded-stages last-metric-stage-number metric-metadata]
  (mu/disable-enforcement
    (let [[pre-transition-stages [last-metric-stage _following-stage & following-stages]] (split-at last-metric-stage-number expanded-stages)
          metric-name (:name metric-metadata)
          metric-aggregation (-> last-metric-stage :aggregation first)
          stage-query (temp-query-at-stage-path query stage-path)
          stage-query (update-in stage-query
                                 [:stages last-metric-stage-number]
                                 (fn [stage]
                                   (dissoc stage :breakout :order-by :aggregation :fields :lib/stage-metadata)))
          ;; Needed for field references to resolve further in the pipeline
          stage-query (lib/with-fields stage-query last-metric-stage-number (lib/fieldable-columns stage-query last-metric-stage-number))
          new-metric-stage (lib.util/query-stage stage-query last-metric-stage-number)
          lookup {(:id metric-metadata)
                  {:name metric-name :aggregation metric-aggregation}}
          stage-query (replace-metric-aggregation-refs
                       stage-query
                       (inc last-metric-stage-number)
                       lookup)
          new-following-stage (lib.util/query-stage stage-query (inc last-metric-stage-number))
          combined-stages (vec (remove nil? (concat pre-transition-stages
                                                    [new-metric-stage new-following-stage]
                                                    following-stages)))]
      combined-stages)))

(defn- adjust-metric-stages
  "`expanded-stages` are the result of :stages from fetch-source-query.
   All source-card stages have been spliced in already.

   To adjust:

   We look for the transition between the last stage of a metric and the next stage following it.
   We adjust those two stages - as explained in `expand`.
   "
  [query path expanded-stages]
  ;; Find a transition point, if it exists
  (let [[idx metric-metadata] (find-metric-transition query expanded-stages)
        [first-stage] expanded-stages]
    (cond
      idx
      (let [new-stages (update-metric-transition-stages query path expanded-stages idx metric-metadata)]
        (recur (assoc-in query (conj path :stages) new-stages) path new-stages))

      (or (:source-table first-stage)
          (and (:native first-stage)
               (:qp/stage-is-from-source-card first-stage)))
      (splice-compatible-metrics query path expanded-stages)

      :else
      expanded-stages)))

(defn- find-first-metric
  [query]
  (lib.util.match/match-one query
    [:metric _ _] &match))

;;;; Rejection of incompatible metrics ===============================================================================

(def ^:private commutative-ops
  #{:+
    :*
    :=
    :!=
    :and
    :or})

(declare equal-filter?)

(defn- equal-commutative-op?
  [f1 f2]
  (let [f1-args (subvec f1 2)
        f2-args (subvec f2 2)]
    (loop [f1-indices (range (count f1-args))
           f2-indices (set (range (count f2-args)))]
      (cond
        (and (empty? f1-indices)
             (empty? f2-indices))
        true

        (or (empty? f1-indices)
            (empty? f2-indices))
        false

        :else
        (let [f1-index (first f1-indices)
              f1-elm (f1-args f1-index)
              matching (m/find-first #(equal-filter? f1-elm (f2-args %)) f2-indices)]
          (if-not matching
            false
            (recur (next f1-indices)
                   (disj f2-indices matching))))))))

;; Following fn operates on _single elements_ of filters vector (as returned from lib/filters).
(defn- equal-filter?
  [f1 f2]
  (let [f1 (cond-> f1 (lib.util/clause-of-type? f1 :value) (get 2))
        f2 (cond-> f2 (lib.util/clause-of-type? f2 :value) (get 2))]
    (cond
      (or (not (lib.util/clause? f1))
          (not (lib.util/clause? f2)))
      (= f1 f2)

      (and (lib.util/clause? f1)
           (lib.util/clause? f2)
           (= (first f1) (first f2))
           (= (count (nthnext f1 2)) (count (nthnext f2 2))))
      (if ((comp commutative-ops first) f1)
        (equal-commutative-op? f1 f2)
        (every? #(apply equal-filter? %)
                (map vector (nthnext f1 2) (nthnext f2 2))))

      :else
      false)))

(def ^:private forbidden-aggregations #{:min
                                        :stddev
                                        :count-where
                                        :cum-count
                                        :sum-where
                                        :cum-sum
                                        :distinct
                                        :percentile
                                        :var
                                        :median
                                        :share
                                        :max
                                        :count
                                        :avg
                                        :sum})

(defn- non-metric-aggregation
  [aggregation]
  (when-let [[tag _opts & args] (and (vector? aggregation) aggregation)]
    (or (and (forbidden-aggregations tag) aggregation)
        (some non-metric-aggregation args))))

(defn- assert-compatible-stage-aggregations
  "Assert that stage, specifically its aggregations, are compatible with referenced metrics. If there is aggregating
  function called on referencing stage directly, referenced metrics can not contain any filters."
  [query stage-number metrics]
  (when-some [non-metric-ag (m/find-first non-metric-aggregation (lib/aggregations query stage-number))]
    (when-some [metric-id  (some (fn [[id metric-query]]
                                   (when (seq (lib/filters metric-query))
                                     id))
                                 ;; assuming all those metrics are present in the `query`'s `stage-number`
                                 metrics)]
      (throw (ex-info (tru "It''s not allowed to combine metrics having filters with other aggregations")
                      {:meric-id metric-id
                       :metric-filter (lib/filters (metrics metric-id))
                       :non-metric-aggregation non-metric-ag}))))

  nil)

;; Following fn operates on filter's vectors (as returned from lib/filters)
(defn- filters-map-1-1?
  "Predicate that checks whether filtler clauses of `f1` equal to clauses of `f2` in terms of [[equal-filter?]]."
  [f1 f2]
  (assert (and (vector f1) (vector f2)))
  (loop [f1 f1
         f2-indices (set (range (count f2)))]
    (cond
      (and (empty? f1) (empty? f2-indices))
      true

      (or (empty? f1) (empty? f2-indices))
      false

      :else
      (let [f1-elm (first f1)
            matching (m/find-first #(equal-filter? f1-elm (get f2 %)) f2-indices)]
        (if (nil? matching)
          false
          (recur (rest f1) (disj f2-indices matching)))))))

(defn- assert-compatible-filters-in-metrics
  "Assert that metrics referenced in a stage have compatible filters. Returns nil."
  [metrics]
  (let [[base-metric-id & other-metric-ids] (keys metrics)
        base-metric-query (get metrics base-metric-id)
        base-filters (lib/filters base-metric-query)]
    (loop [metric-ids other-metric-ids]
      (when (seq metric-ids)
        (let [metric-id (first metric-ids)
              metric-query (get metrics metric-id)
              metric-filters (lib/filters metric-query)]
          (when-not (filters-map-1-1? base-filters metric-filters)
            (throw (ex-info (tru "Metrics {0} and {1} have incompatible filters."
                                 base-metric-id
                                 metric-id)
                            {:base-filters base-filters
                             :metric-filters metric-filters}))))
        (recur (rest other-metric-ids)))))
  nil)

(defn is-join-compatible?
  "Predicate that checks whether join is compatible to be used in metric or referencing stage."
  [query stage-number join]
  (every? (fn [[op _opts arg1 arg2 :as condition]]
            (when (and (= := op)
                       (lib.util/clause-of-type? arg1 :field)
                       (lib.util/clause-of-type? arg2 :field))
              (let [local-ref (some #(when (and (lib.util/clause? %)
                                                (not (:join-alias (lib.options/options %)))) %)
                                    condition)
                    _ (assert  (some? local-ref))
                    local-col (lib/find-matching-column local-ref (lib/visible-columns query stage-number))
                    _ (assert (some? local-col))
                    dummy-query (lib.query/query-with-stages query (:stages join))
                    foreign-ref (some #(when (and (lib.util/clause? %)
                                                  (:join-alias (lib.options/options %))) %)
                                      condition)
                    _ (assert (some? foreign-ref))
                    foreign-col (lib/find-matching-column
                                 (lib.options/update-options foreign-ref dissoc :join-alias)
                                 (lib/returned-columns dummy-query))
                    _ (assert (some? foreign-col))]
                (and (= :type/FK (:semantic-type local-col))
                     (= :type/PK (:semantic-type foreign-col))
                     (= (:fk-target-field-id local-col) (:id foreign-col))))))
          (:conditions join)))

(defn- assert-compatible-joins
  "Assert referencing stage and referenced metrics have no incompatible joins. Returns nil."
  [query stage-number resolved-metric-queries]
  ;; check the stage joins
  (loop [stage-joins (lib/joins query stage-number)]
    (when (seq stage-joins)
      (let [join (first stage-joins)]
        (when-not (is-join-compatible? query stage-number join)
          (throw (ex-info (tru "Incompatible join in a stage referencing a metric")
                          {:join join}))))
      (recur (rest stage-joins))))
  ;; check the metrics' joins
  (loop [metric-ids (keys resolved-metric-queries)]
    (when (seq metric-ids)
      (let [metric-id (first metric-ids)
            metric-query (get resolved-metric-queries metric-id)]
        (loop [metric-joins (lib/joins metric-query)]
          (when (seq metric-joins)
            (let [metric-join (first metric-joins)]
              (when-not (is-join-compatible? metric-query -1 metric-join)
                (throw (ex-info (tru "Incompatible join in the metric {0}" metric-id)
                                {:join metric-join}))))
            (recur (rest metric-joins)))))
      (recur (rest metric-ids))))
  nil)

(defn- assert-compatible-metrics*
  "Assert that referencing stage and referenced metric joins and filters are allowed. Returns nil."
  [query path-type path stage-or-join]
  (when (= :lib.walk/stage path-type)
    (let [aggregation (:aggregation stage-or-join)]
      (when-some [metric-ids (not-empty (set (lib.util.match/match aggregation
                                               [:metric opts id]
                                               id)))]
        (let [refq-stage-number (last path)
              refq-stages (get-in query (butlast path))
              refq (lib.query/query-with-stages query refq-stages)
              metrics (-> (->> (lib.metadata/bulk-metadata-or-throw query :metadata/card metric-ids)
                               (m/index-by :id))
                          (update-vals #(->> %
                                             :dataset-query
                                             ((requiring-resolve 'metabase.query-processor.preprocess/preprocess))
                                             (lib/query query))))]
          (try
            (assert-compatible-joins refq refq-stage-number metrics)
            (assert-compatible-filters-in-metrics metrics)
            (assert-compatible-stage-aggregations refq refq-stage-number metrics)
            (catch Throwable t
              (analytics/inc! :metabase-query-processor/metrics-adjust-incompatible-rejections)
              (throw t)))))))
  nil)

(defn- assert-compatible-metrics
  [query]
  (lib.walk/walk query assert-compatible-metrics*))

;;;; Middleware =======================================================================================================

(defn adjust
  "Looks for `[:metric {} id]` clause references and adjusts the query accordingly.

   Expects stages to have been processed by `fetch-source-query/resolve-source-cards`
   such that source card stages have been spliced in across the query.

   Metrics can be referenced in two scenarios:
   1. Compatible source table metrics.
      Multiple metrics can be referenced in the first stage of a query that references a `:source-table`
      Those metrics must:
      - Be single stage metrics.
      - Have the same `:source-table` as the query
   2. Metric source cards can reference themselves.
      A query built from a `:source-card` of `:type :metric` can reference itself."
  [query]
  (if-not (find-first-metric (:stages query))
    query
    (do
      (analytics/inc! :metabase-query-processor/metrics-adjust)
      (try
        (assert-compatible-metrics query)
        (let [query (lib.walk/walk
                     query
                     (fn [_query path-type path stage-or-join]
                       (when (= path-type :lib.walk/join)
                         (update stage-or-join :stages #(adjust-metric-stages query path %)))))]
          (u/prog1
            (update query :stages #(adjust-metric-stages query nil %))
            (when-let [metric (find-first-metric (:stages <>))]
              (throw (ex-info "Failed to replace metric" {:metric metric})))))
        (catch Throwable e
          (analytics/inc! :metabase-query-processor/metrics-adjust-errors)
          (throw e))))))
