(ns metabase.query-processor.middleware.metrics
  (:require
   [medley.core :as m]
   [metabase.analytics.prometheus :as prometheus]
   [metabase.lib.convert :as lib.convert]
   [metabase.lib.core :as lib]
   [metabase.lib.hierarchy :as lib.hierarchy]
   [metabase.lib.join :as lib.join]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.lib.options :as lib.options]
   [metabase.lib.order-by :as lib.order-by]
   [metabase.lib.query :as lib.query]
   [metabase.lib.schema.aggregation :as lib.schema.aggregation]
   [metabase.lib.util :as lib.util]
   [metabase.lib.util.match :as lib.util.match]
   [metabase.lib.walk :as lib.walk]
   [metabase.util :as u]
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
                      (let [metric-query (lib.convert/->pMBQL
                                          ((requiring-resolve 'metabase.query-processor.preprocess/preprocess)
                                           (lib/query query (:dataset-query card-metadata))))
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
                            (:lib/metadata query)
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
      (prometheus/inc! :metabase-query-processor/metrics-adjust)
      (try
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
          (prometheus/inc! :metabase-query-processor/metrics-adjust-errors)
          (throw e))))))

#_(defonce deb (atom {}))


;;
;; Util
;;

;; TODO: This should be a lib function.
;; TODO: Should use (find-matching-column ref [column])?
(defn- matching-column-index
  [ref columns]
  ;; todo : proper nil punning
  (when-some [matching (lib/find-matching-column ref columns)]
    (some (fn [[index column]]
            (when (= column matching)
              index))
          (map vector (range) columns))))

(defn- metric-ids-from-stage
  [query stage-number]
  (seq (lib.util.match/match (lib/aggregations query stage-number)
         [:metric _opts id]
         id)))

;;
;; Metric query generation
;;

(defn- raw-metric-query
  [metadata-providerable card]
  (->> ((requiring-resolve 'metabase.query-processor.preprocess/preprocess)
        (lib/query metadata-providerable (:dataset-query card)))
       (lib/query metadata-providerable)
       lib/remove-all-breakouts))

(defn- combine-joins
  [query stage-number raw-metric-query]
  (reduce #(lib/join %1 0 %2)
          raw-metric-query
          (lib/joins query stage-number)))

;; TODO: TEST! and handle name collisions
(defn- combine-expressions
  [query stage-number raw-metric-query]
  (reduce (fn [q [_ {expr-name :lib/expression-name} :as expr]]
            (lib/expression q expr-name expr))
          raw-metric-query
          (lib/expressions query stage-number)))

;; TEST!
(defn- combine-filters
  [query stage-number raw-metric-query]
  (reduce lib/filter
          raw-metric-query
          (lib/filters query stage-number)))

(defn- combine-breakout
  [query stage-number raw-metric-query]
  (reduce lib/breakout
          raw-metric-query
          (lib/breakouts query stage-number)))

(defn- metric-query
  [query stage-number card]
  (assoc (->> (raw-metric-query query card)
              (combine-joins query stage-number)
              (combine-expressions query stage-number)
              (combine-filters query stage-number)
              (combine-breakout query stage-number)
              ;; TODO: Is following call necessary?
              (lib.util/fresh-query-instance))
         ::metric (:id card)))

;;
;; Joining of metric query
;;

(defn- always-true-conditions
  []
  [(lib/= (lib/+ 1 1) 2)])

(defn- join-conditions
  [query stage-number metric-query]
  (let [breakouts (lib/breakouts query stage-number)
        joined-cols (lib/returned-columns metric-query)]
    (or (not-empty (vec (for [[breakout-col joined-col] (map vector breakouts joined-cols)]
                          (lib/= (lib.util/fresh-uuids breakout-col) (lib/ref joined-col)))))
        (always-true-conditions))))

(defn- join-metric-query
  [query stage-number metric-query]
  (lib/join query stage-number (as-> (lib/join-clause metric-query) $
                                 (lib/with-join-strategy $ :left-join)
                                 (lib.join/add-default-alias query stage-number $)
                                 ;; alias to rhs is added inside the `with-join-conditions`!
                                 (lib/with-join-conditions $ (join-conditions query stage-number metric-query))
                                 (assoc $ ::metric (::metric metric-query)))))

(defn- metric-columns
  [query stage-number]
  (->> (for [join (lib/joins query stage-number)
             :when (::metric join)
             :let [metric-column (-> (lib/returned-columns query stage-number join) last)]]
         (do (assert (-> metric-column :lib/type (#{:metadata/column})))
             (merge metric-column
                    (select-keys join [::metric]))))
       (m/index-by ::metric)))

;;
;; Preprocessing of referencing query
;;

(defn- mark-original-column-order
  [query stage-number]
  (letfn [(mark-a-clause [clause original-column-number]
                         (lib.options/update-options clause assoc
                                                     ::original-column-number original-column-number))
          (mark-clauses [clauses start]
                        (mapv mark-a-clause clauses (map (partial + start) (range))))
          (mark-top-level-clause [query' clause-type start]
                                 (m/update-existing-in query' [:stages stage-number clause-type]
                                                       mark-clauses start))]
    (-> query
        (mark-top-level-clause :breakout 0)
        (mark-top-level-clause :aggregation (count (lib/breakouts query stage-number))))))

(defn- mark-original-sort-order
  [query stage-number]
  (letfn [(top-level-clause-coordinate [ref coord0 columns-fn]
            (some->> (columns-fn query stage-number)
                     (not-empty)
                     (matching-column-index ref)
                     (vector coord0)))
          (summary-coordinate [ref]
            (or (top-level-clause-coordinate ref :breakout    lib/breakouts-metadata)
                (top-level-clause-coordinate ref :aggregation lib/aggregations-metadata)))
          (mark-original-sort-order-rf [query' [order-by-index order-by]]
            (let [[dir _opts ref] order-by]
              (lib.util/update-query-stage query' stage-number
                                           update-in (summary-coordinate ref)
                                           lib.options/update-options merge {::original-sort-order order-by-index
                                                                             ::original-sort-dir   dir})))]
    (reduce mark-original-sort-order-rf
            query
            (map vector (range) (lib/order-bys query stage-number)))))

(defn- metric-column
  [query stage-number id]
  (get-in (lib.util/query-stage query stage-number) [::id->column id]))

(defn- attach-metric-columns
  [query stage-number]
  (lib.util/update-query-stage query stage-number assoc ::id->column (metric-columns query stage-number)))

(defn- preprocess-for-expansion
  [query stage-number]
  (-> query
      (mark-original-column-order stage-number)
      (mark-original-sort-order stage-number)
      (lib.order-by/remove-all-order-bys stage-number)
      (attach-metric-columns stage-number)))

;;
;; Predicates
;;

(defn- is-sole-metric?
  [x]
  (boolean (and (vector? x) (= :metric (first x)))))

(defn- contains-multiple-metrics?
  [x]
  (< 1 (count (lib.util.match/match x
                [:metric _opts id]
                id))))

(defn- is-non-metric-aggregation?
  [x]
  (and (vector? x)
       (not (is-sole-metric? x))
       (lib.hierarchy/isa? (first x) ::lib.schema.aggregation/aggregation-clause-tag)))

(defn- contains-non-metric-aggregation?
  [x]
  (boolean (and (vector? x)
                (loop [[y & queue] [x]]
                  (cond (nil? y) false
                        (not (vector? y)) (recur queue)
                        (is-non-metric-aggregation? y) true
                        :else (let [[_tag _opts & args] y]
                                (recur (into (vec queue) args))))))))

(def ^:private ordering-keys [::original-column-number ::original-sort-order ::original-sort-dir])

(defn- convey-ordering-metadata
  "from c1 to c2!"
  [c1 c2]
  (lib.options/update-options c2 merge (select-keys (lib.options/options c1) ordering-keys)))

;;
;; Reconciliation
;;

(defn- add-metric-breakout
  [query stage-number ref]
  (if-some [index (some->> (lib/breakouts-metadata query stage-number)
                           (matching-column-index ref))]
    (lib.util/update-query-stage query stage-number
                                 update-in [:breakout index]
                                 (partial convey-ordering-metadata ref))
    (lib/breakout query stage-number ref)))

;; TODO: Is it necessary to retain uuids?
(defn- remove-aggregation
  [query stage-number index]
  (let [aggregations (lib/aggregations query stage-number)]
    (lib.util/update-query-stage query stage-number u/assoc-dissoc :aggregation
                                 (not-empty (into [] cat [(subvec aggregations 0 index)
                                                          (subvec aggregations (inc index))])))))

(defn- reconcile-single-metric-aggregation
  [query stage-number [index [_op _opts id :as metric-ref]]]
  (let [index (- index (or (::aggregations-removed (lib.util/query-stage query stage-number)) 0))]
    (-> query
        #_(lib/remove-clause stage-number metric-ref)
        (remove-aggregation stage-number index)
        (add-metric-breakout stage-number (->> (lib/ref (metric-column query stage-number id))
                                               (convey-ordering-metadata metric-ref)))
        (lib.util/update-query-stage stage-number update ::aggregations-removed (fnil inc 0)))))

(defn- reconcile-with-non-metric-aggregation
  [query stage-number [index aggregation]]
  (let [index (- index (or (::aggregations-removed (lib.util/query-stage query stage-number)) 0))]
    (letfn [(metric-ref [id]
              (lib/ref (metric-column query stage-number id)))
            (swap-metrics [aggregation]
              (lib.util.match/replace aggregation [:metric _opts id] (metric-ref id)))
            (add-metric-breakouts [query stage-number]
              (reduce #(add-metric-breakout %1 stage-number %2)
                      query
                      (map metric-ref (lib.util.match/match aggregation [:metric _opts id] id))))]
      (-> query
          (lib.util/update-query-stage stage-number update-in [:aggregation index] swap-metrics)
          (add-metric-breakouts stage-number)))))

(defn- reconcile-multiple-metrics-aggregation
  [query stage-number [index aggregation]]
  (let [index (- index (or (::aggregations-removed (lib.util/query-stage query stage-number)) 0))
        expr-name ((some-fn :display-name :name) (lib.options/options aggregation))
        expr-body (lib.util.match/replace
                   aggregation
                   [:metric _opts id]
                   (lib/ref (metric-column query stage-number id)))]
    (as-> query $
      ;; TODO: If I do remove and there is something that depends on that metric it will be removed also probably!
      ;;       This should be resolved! This is worth examining also for other reconciliation methods.
      #_(lib/remove-clause $ stage-number aggregation)
      (remove-aggregation $ stage-number index)
      (lib/expression $ stage-number expr-name expr-body)
      (add-metric-breakout $ stage-number (->> (lib/expression-ref $ stage-number expr-name)
                                               (convey-ordering-metadata aggregation)))
      (lib.util/update-query-stage $ stage-number update ::aggregations-removed (fnil inc 0)))))

(defn- reconcile-an-aggregation
  "Order is significant!"
  [query stage-number [_index aggregation :as indexed-aggregation]]
  (cond (is-sole-metric? aggregation)
        (reconcile-single-metric-aggregation query stage-number indexed-aggregation)

        (contains-non-metric-aggregation? aggregation)
        (reconcile-with-non-metric-aggregation query stage-number indexed-aggregation)

        (contains-multiple-metrics? aggregation)
        (reconcile-multiple-metrics-aggregation query stage-number indexed-aggregation)

        :else
          (throw (ex-info "Aggregation reconciliation failed"
                          {:query query
                           :stage-number stage-number
                           :aggregation-index _index
                           :aggregation aggregation}))))

(defn- reconcile-aggregations
  [query stage-number]
  (let [res
        (reduce #(reconcile-an-aggregation %1 stage-number %2)
                query
                (map vector (range) (lib/aggregations query stage-number)))]
    res))

;;
;; Ordering stage!
;;

(defn inject-stage-after
  "Inject stage after stage-number stage"
  [query stage-number]
  (let [[pre post] (split-at (inc stage-number) (:stages query))]
    (assoc query :stages (into [] cat [pre [{:lib/type :mbql.stage/mbql}] post]))))

(defn- reconstruct-fields
  [query ordering-stage-number]
  (let [expanded-stage-number (dec ordering-stage-number)
        source-uuid->column (m/index-by :lib/source-uuid (lib/fieldable-columns query ordering-stage-number))]
    (lib/with-fields query ordering-stage-number
      (->> (concat (lib/breakouts query expanded-stage-number)
                   (lib/aggregations query expanded-stage-number))
           (filter (comp ::original-column-number lib.options/options))
           (sort-by (comp ::original-column-number lib.options/options))
           (map (comp source-uuid->column :lib/uuid lib.options/options))))))

(defn- reconstruct-order-by
  [query ordering-stage-number]
  (let [expanded-stage-number (dec ordering-stage-number)
        source-uuid->column (m/index-by :lib/source-uuid (lib/orderable-columns query ordering-stage-number))]
    (reduce (fn [query' [dir uuid]]
              (lib/order-by query' ordering-stage-number (source-uuid->column uuid) dir))
            query
            (for [ref (->> (concat (lib/breakouts query expanded-stage-number)
                                   (lib/aggregations query expanded-stage-number))
                           (filter (comp ::original-sort-order lib.options/options))
                           (sort-by (comp ::original-sort-order lib.options/options)))
                  :let [{:keys [lib/uuid ::original-sort-dir]} (lib.options/options ref)]]
              [original-sort-dir uuid]))))

(defn- inject-ordering-stage
  [query stage-number]
  (let [ordering-stage-number (inc stage-number)]
    (-> query
        (inject-stage-after stage-number)
        (reconstruct-fields ordering-stage-number)
        (reconstruct-order-by ordering-stage-number)
        (update ::stages-added (fnil inc 0)))))

;;
;; Transformation
;;

(declare expand-referenced-metrics)

;; TODO: This function will probably have to perform :fields adjustments for the join!!!
(defn- expand-referenced-metrics-in-a-join
  [query join]
  (merge join (-> (lib.query/query-with-stages query (:stages join))
                  (expand-referenced-metrics)
                  (select-keys [:stages]))))

(defn- expand-referenced-metrics-in-joins
  [query stage-number]
  (let [expand-in-a-join-with-query (partial expand-referenced-metrics-in-a-join query)]
    (lib.util/update-query-stage query stage-number m/update-existing :joins
                                 (partial mapv expand-in-a-join-with-query))))

(defn- join-metric-queries
  [query stage-number metric-queries]
  (reduce #(join-metric-query %1 stage-number %2)
          query
          metric-queries))

(defn- expand-referenced-metrics-in-stage*
  [query stage-number]
  (if-some [ids (metric-ids-from-stage query stage-number)]
    (-> query
        (join-metric-queries stage-number
                             (map (partial metric-query query stage-number)
                                  (lib.metadata/bulk-metadata-or-throw query :metadata/card ids)))
        (preprocess-for-expansion stage-number)
        (reconcile-aggregations stage-number)
        (inject-ordering-stage stage-number))
    query))

(defn- expand-referenced-metrics-in-stage
  [query original-stage-number]
  (let [stage-number (+ original-stage-number (::stages-added query 0))]
    (-> query
        ;; TODO: Resolve: Calling expansion on joins is _probably_ redundant *with current implementation*. Currently
        ;;                preprocess is called on every card during expansion. Joins can be card or table sourced.
        (expand-referenced-metrics-in-joins stage-number)
        (expand-referenced-metrics-in-stage* stage-number))))

(defn expand-referenced-metrics
  "TBD"
  [query]
  (assert (= :mbql/query (:lib/type query)))

  (let [res (reduce expand-referenced-metrics-in-stage
                    query
                    (range (count (:stages query))))]
    #_(swap! deb update metabase.query-processor.preprocess/*run-id* assoc :zzz [query res])
    res))
