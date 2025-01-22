(ns metabase.query-processor.middleware.metrics.joined-subquery-expansion
  "TBD"
  (:require
   [medley.core :as m]
   [metabase.lib.core :as lib]
   [metabase.lib.expression :as lib.expression]
   [metabase.lib.hierarchy :as lib.hierarchy]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.lib.options :as lib.options]
   [metabase.lib.order-by :as lib.order-by]
   [metabase.lib.query :as lib.query]
   [metabase.lib.schema.aggregation :as lib.schema.aggregation]
   [metabase.lib.util :as lib.util]
   [metabase.lib.util.match :as lib.util.match]
   [metabase.util :as u]))

;;
;; Util
;;

;; TODO: This should be a lib function.
;; TODO: Should use (find-matching-column ref [column])?
(defn- matching-column-index
  [ref columns]
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

;; TODO: test with implicit joins in other places: filters, join conditions
(defn- raw-metric-query
  "Generate metric query from metric card.

  Order of operations is significant. Breakouts must be removed prior preprocess call, in case those contain
  fields to be implicitly joined."
  [metadata-providerable card]
  (->> (lib/query metadata-providerable (:dataset-query card))
       lib/remove-all-breakouts
       ((requiring-resolve 'metabase.query-processor.preprocess/preprocess))
       ;; Following call transforms legacy result of preprocess into pMBQL.
       (lib/query metadata-providerable)))

;; OK (probably will be modfying some stuff, fields, aliases, references?; but not now)
(defn- combine-joins
  [query stage-number raw-metric-query]
  (reduce #(lib/join %1 -1 %2)
          raw-metric-query
          (lib/joins query stage-number)))

;; OK
(defn- expression-name
  [expr-ref]
  (:lib/expression-name (lib.options/options expr-ref)))

;; OK
;; ATM following is verbatim copy of what can be found in join.cljc due to circ dep reasons
(defn- generate-unique-name [metadata-providerable base-name taken-names]
  (let [generator (lib.util/unique-name-generator (lib.metadata/->metadata-provider metadata-providerable))]
    (run! generator taken-names)
    (generator base-name)))

;; OK
(defn- expression-mapping
  [mquery a-name]
  (get-in (lib.util/query-stage mquery -1) [::expr-names a-name] #_a-name))

;; OK
;; lib replace should not be used against queries outside the lib
(defn- adjust-expressions
  [mquery clause]
  (lib.util.match/replace
   clause
   [:expression _opts a-name]
   (assoc &match 2 (expression-mapping mquery a-name))))

;; OK?
(defn combine-an-expression
  [mquery expr-clause]
  (let [expr-name (expression-name expr-clause)
        new-expr-name (generate-unique-name mquery expr-name
                                            (map (comp :lib/expression-name lib.options/options)
                                                 (lib/expressions mquery)))
        ;; This seems to be incorrect! Verify on another pass; at least naming is weird
        new-expr-clause (->> (lib.expression/with-expression-name expr-clause new-expr-name)
                             (adjust-expressions mquery))]
    (-> mquery
        (lib.util/update-query-stage -1 update ::expr-names assoc expr-name new-expr-name)
        (lib/expression new-expr-name new-expr-clause))))

;; OK
;; TODO: TEST name collisions handling!
(defn- combine-expressions
  [query stage-number raw-metric-query]
  (reduce
   combine-an-expression
   raw-metric-query
   (lib/expressions query stage-number)))

(defn- combine-a-filter
  [mquery filter]
  (lib/filter mquery -1 (adjust-expressions mquery filter)))

;; TEST!
;; TODO: colliding expression names logic!!!
;; 
(defn- combine-filters
  [query stage-number raw-metric-query]
  (reduce combine-a-filter
          raw-metric-query
          (lib/filters query stage-number)))

;; This should be consistent with the rest
(defn combine-a-breakout
  [mq breakout]
  (lib/breakout mq -1 (adjust-expressions mq breakout)))

(defn- combine-breakout
  [query stage-number raw-metric-query]
  (reduce combine-a-breakout
          raw-metric-query
          (lib/breakouts query stage-number)))

(defonce capt (atom []))

(comment
  
  (-> @capt count)
  capt

  )

;; TODO: Consider adding dummy empty stage here!
(defn- metric-query
  "Generate a meteric query combining metric `card` and referencing `query`. The metric reference is present
  on the `stage-number` stage.

  Resulting metric query has follwing keys set. Those are necessary in expansion steps that follow.

  - `::metric-id`,
  - `::display-name`: Display name of metric's aggregation.

  The metric query is a query from the metric `card`, with merged joins, expressions, filters and breakout."
  [query stage-number card]
  (let [;; The metric column could be based on the `raw-metric-query`.
        metric-column (fn [metric-query]
                        (let [aggregation-columns (filter (comp #{:source/aggregations} :lib/source)
                                                          (lib/returned-columns metric-query))]
                          (def aaa aggregation-columns)
                          (assert (>= 1 (count aggregation-columns))
                                  "Metric query should have one aggregation sourced column")
                          (first aggregation-columns)))
        metric-query-wip (->> @(def rara (raw-metric-query query card))
                              (combine-joins query stage-number)
                              (combine-expressions query stage-number)
                              (combine-filters query stage-number)
                              (combine-breakout query stage-number)
                              ;; TODO: Is following call necessary?
                              (lib.util/fresh-query-instance))]
    (assoc metric-query-wip
           ::display-name (:display-name (metric-column metric-query-wip))
           ::metric-id (:id card))))

;;
;; Joining of metric query
;;

;; OK
(defn- always-true-conditions
  []
  [(lib/= (lib/+ 1 1) 2)])

(defn- join-conditions
  "Generated join conditions for joining `metric-query` into the referencing query.

  Join conditions are used in call to `with-join-conditions` that adds appropriate alias."
  [query stage-number metric-query]
  (let [;; TODO: put the following into standalone function
        original-breakouts (filter (comp ::original-column-number lib.options/options)
                                   (lib/breakouts query stage-number))
        joined-cols (lib/returned-columns metric-query)]
    (or (not-empty (vec (for [[breakout-col joined-col] (map vector original-breakouts joined-cols)]
                          (lib/= (lib.util/fresh-uuids (lib/ref breakout-col)) (lib/ref joined-col)))))
        (always-true-conditions))))

(defn metric-join-alias
  [metric-id]
  (assert (int metric-id) "Metric id must be an int.")
  (str "metric_" metric-id "__" (u/generate-nano-id)))

(defn- join-metric-query
  "Generate a metric join from `metric-query` and referencing `query` that is being expnaded.

  Convey `metric-query` keys need for next phases of the expansion."
  [query stage-number metric-query]
  ;; WIP: If append-stage missing from join-clause-method is not causing problems elsewehere throughout this
  ;; implementation, it could stay within scope of this ns.
  (let [metric-join (-> (lib/join-clause #_metric-query (lib/append-stage metric-query))
                        (lib/with-join-strategy :left-join)
                        (lib/with-join-alias (metric-join-alias (::metric-id metric-query)))
                        (lib/with-join-conditions (join-conditions query stage-number metric-query))
                        (merge (select-keys metric-query [::metric-id ::display-name])))
        query-with-join (lib/join query stage-number metric-join)
        _ (assert (= (count (lib/joins query stage-number))
                     (dec (count (lib/joins query-with-join stage-number)))))
        joined-join-clause @(def ll (last (lib/joins query-with-join stage-number)))
        join-columns @(def jooj (lib/returned-columns query-with-join stage-number joined-join-clause))
        #_#__ (def aaas [query-with-join stage-number join-columns])
        query-with-join-with-fields #_query-with-join (lib.util/update-query-stage
                                                       query-with-join stage-number update :joins
                                                       (fn [joins]
                                                         (let [but-last-joins (subvec joins 0 (dec (count joins)))
                                                               last-join (joins (dec (count joins)))]
                                                           (conj but-last-joins (lib/with-join-fields last-join
                                                                                  join-columns)))))]
    (def qqq [query-with-join metric-join query stage-number metric-query query-with-join-with-fields])
    (assert (= (-> metric-join :stages last) {:lib/type :mbql.stage/mbql})
            "Metric join's stages must end with empty stage.")

    query-with-join-with-fields))

(comment
  
  (lib.util/update-query-stage
   (first aaas) (second aaas) update :joins
   (fn [joins]
     (def joo joins)
     (let [but-last-joins (subvec joins 0 (dec (count joins)))
           last-join @(def lj (joins (dec (count joins))))]
       @(def ahoj (conj @(def blj but-last-joins) (lib/with-join-fields last-join
                                                              (nth aaas 2)))))))
  )

(defonce asd (atom []))

(defn- metric-columns
  "Generate map of metric id -> metric column. Columns are used reconciliation phase of metric expansion."
  [query stage-number]
  (swap! asd conj [query stage-number])
  (->> (for [join (lib/joins query stage-number)
             :when (::metric-id join)
             ;; returned columns -- guaranteed that are inorder?
             ;; TODO: Revert!
             :let [metric-column (last @(def coco (lib/returned-columns query stage-number join)))]]
         (do (assert (-> metric-column :lib/type (#{:metadata/column})))
             (merge metric-column (select-keys join [::metric-id ::display-name]))))
       (m/index-by ::metric-id)))

;;
;; Preprocessing of referencing query
;;

;; OK
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

;; TODO: Should this throw?
(defn- metric-column
  [query stage-number id]
  (let [res (get-in (lib.util/query-stage query stage-number) [::id->column id])]
    (when (nil? res)
      (throw (ex-info "Metric column is missing"
                      {:query query
                       :stage-number stage-number
                       :stage (lib.util/query-stage query stage-number)
                       :id id})))
    res))

(defn- attach-metric-columns
  [query stage-number]
  (lib.util/update-query-stage query stage-number assoc ::id->column (metric-columns query stage-number)))

;; Redundant now as preprocess and joining are interdependent
#_(defn- preprocess-for-expansion
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

(defn- contains-any-metrics?
  [x]
  (boolean (lib.util.match/match x
             [:metric _opts id]
             id)))

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

;; TODO WIP: metric-id temporarily here for window fn expansion
(def ^:private ordering-keys [::original-column-number ::original-sort-order ::original-sort-dir ::metric-id])

;; TODO: Probably remove those convey functions?
;; TODO: Ensure this works correctly for refs and columns -- now it works for refs only
;;
;; TODO: This is wrong?
(defn- convey-ordering-metadata
  "from c1 to c2!"
  [c1 c2]
  (lib.options/update-options c2 merge (select-keys (lib.options/options c1) ordering-keys)))

(def ^:private naming-keys [::display-name])

(defn- convey-naming-metadata
  [col ref]
  (lib.options/update-options ref merge (select-keys col naming-keys)))

(defn- convey-naming-options
  [col ref]
  (lib.options/update-options ref merge (select-keys col naming-keys)))

;;
;; Reconciliation
;;

(defn- breakout
  "Temporary: wrapper that ensures following stages were not removed! lib/breakout removes those for bla bla

  Case with 'if there was breakout already' not relevant, or is it?"
  [query stage-number ref]
  (let [stages (:stages query)
        stages-after (subvec stages (inc stage-number) (count stages))
        new-query (lib/breakout query stage-number ref)]
    (update new-query :stages into stages-after)))

(defn- add-metric-breakout
  [query stage-number ref]
  (if-some [index (some->> (lib/breakouts-metadata query stage-number)
                           (matching-column-index ref))]
    ;; this branch works weirdly
    ;; metric can come only from same join! -- I should iterate differntly here!
    (lib.util/update-query-stage query stage-number
                                 update-in [:breakout index]
                                 (partial convey-ordering-metadata ref))
    (breakout query stage-number ref)))

;; TODO: Is it necessary to retain uuids?
(defn- remove-aggregation
  "This is necessary to avoid removal of refs that depend on the aggregation eg. in following stages."
  [query stage-number index]
  (let [aggregations (lib/aggregations query stage-number)]
    (lib.util/update-query-stage query stage-number u/assoc-dissoc :aggregation
                                 (not-empty (into [] cat [(subvec aggregations 0 index)
                                                          (subvec aggregations (inc index))])))))

(defn- reconcile-single-metric-aggregation
  [query stage-number [index [_op _opts id :as metric-ref] :as _indexed-metric-ref]]
  (let [index (- index (or (::aggregations-removed (lib.util/query-stage query stage-number)) 0))]
    (-> query
        (remove-aggregation stage-number index)
        ;; TODO: Should this be performed in metadata methods or should it be isolated in this ns?
        (add-metric-breakout stage-number (->> (lib/ref ;; this is missing ::display-name
                                                (metric-column query stage-number id))
                                               (convey-naming-metadata (metric-column query stage-number id))
                                               (convey-ordering-metadata metric-ref)))
        (lib.util/update-query-stage stage-number update ::aggregations-removed (fnil inc 0)))))

(defn- reconcile-with-non-metric-aggregation
  [query stage-number [index aggregation]]
  (let [index (- index (or (::aggregations-removed (lib.util/query-stage query stage-number)) 0))]
    (letfn [(metric-ref [id]
              ;; TODO: Resolve! It should not be necessary to pass ordering metdata, but metric-id should be passed for
                        ;; every breakout that 
                        ;; convey 
                        (lib.options/update-options
                         (->> (lib/ref ;; this is missing ::display-name
                               (metric-column query stage-number id))
                                                      ;; this ought to be???
                              (convey-naming-metadata (metric-column query stage-number id))
                                                      ;; eg this is redundant for this case
                              (convey-ordering-metadata metric-ref))
                         m/assoc-some ::metric-id id)
                        #_(let [col @(def mc (metric-column query stage-number id))]
                            @(def pa (lib.options/update-options (lib/ref (metric-column query stage-number id))
                                                                 m/assoc-some ::metric-id (::metric-id col)))))
            (swap-metrics [aggregation]
              (lib.util.match/replace aggregation [:metric _opts id] (metric-ref id)))
            (add-metric-breakouts [query stage-number]
              (reduce #(add-metric-breakout %1 stage-number %2)
                      query
                      (map metric-ref (lib.util.match/match aggregation [:metric _opts id] id))))]
      (-> query
          (lib.util/update-query-stage stage-number update-in [:aggregation index] swap-metrics)
          (add-metric-breakouts stage-number)))))

;; TODO: Verify why unnamed arg could not be handled and whether it is still a case!
(defn- reconcile-multiple-metrics-aggregation
  "Note on removal, dependent clauses should not be and are not removed."
  [query stage-number [index aggregation]]
  ;; TODO: Should unnamed aggregation be somehow handled?
  (assert (string? ((some-fn :display-name :name) (lib.options/options aggregation)))
          "Found unnamed aggregation expression with metric reference")
  (let [index (- index (or (::aggregations-removed (lib.util/query-stage query stage-number)) 0))
        expr-name ((some-fn :display-name :name) (lib.options/options aggregation))
        expr-body (lib.util.match/replace
                   aggregation
                   [:metric _opts id]
                   (lib/ref (metric-column query stage-number id)))]
    (as-> query $
      (remove-aggregation $ stage-number index)
      (lib/expression $ stage-number expr-name expr-body)
      (add-metric-breakout $ stage-number (->> (lib/expression-ref $ stage-number expr-name)
                                               (convey-ordering-metadata aggregation)))
      (lib.util/update-query-stage $ stage-number update ::aggregations-removed (fnil inc 0)))))

(defn- reconcile-an-aggregation
  "TBD. Order is significant!"
  [query stage-number [_index aggregation :as indexed-aggregation]]
  (cond (is-sole-metric? aggregation)
        (reconcile-single-metric-aggregation query stage-number indexed-aggregation)

        (contains-non-metric-aggregation? aggregation)
        (reconcile-with-non-metric-aggregation query stage-number indexed-aggregation)

        (contains-any-metrics? aggregation)
        (reconcile-multiple-metrics-aggregation query stage-number indexed-aggregation)

        ;; TODO: add qp error info.
        :else
        (throw (ex-info "Aggregation reconciliation failed"
                        {:query query
                         :stage-number stage-number
                         :aggregation-index _index
                         :aggregation aggregation}))))

(defn- reconcile-aggregations
  [query stage-number]
  (reduce #(reconcile-an-aggregation %1 stage-number %2)
          query
          (map vector (range) (lib/aggregations query stage-number))))

;;
;; Ordering stage
;;

;; TODO: lib function
(defn inject-stage-after
  "Inject stage after stage-number stage"
  [query stage-number]
  (let [[pre post] (split-at (inc stage-number) (:stages query))]
    (assoc query :stages (into [] cat [pre [{:lib/type :mbql.stage/mbql}] post]))))

(defn- reconstruct-fields
  "Reconstruct fields for ordering stage in correct column order.

  This opration entails:
  1. Get breakout and aggregation refs from expnasion stage
  2. Order those
  3. For ref, get appropriate column as in ordering stage.
  4. Generate refs out of that column and convery metric relevant options.
  5. Then set new refs as ordering stage fields."
  [query ordering-stage-number]
  (let [expanded-stage-number (dec ordering-stage-number)
        source-uuid->column (m/index-by :lib/source-uuid (lib/fieldable-columns query ordering-stage-number))
        ordered-summary-refs (->> (concat (lib/breakouts query expanded-stage-number)
                                          (lib/aggregations query expanded-stage-number))
                                  (filter (comp ::original-column-number lib.options/options))
                                  (sort-by (comp ::original-column-number lib.options/options)))
        field-refs (map (fn [summary-ref]
                          (let [ref-opts (lib.options/options summary-ref)
                                ref-uuid (:lib/uuid ref-opts)
                                ;; is this actually redundant?
                                metric-opts (doto (select-keys ref-opts [::metric-id ::display-name]) println)]
                            (lib.options/update-options (lib/ref (source-uuid->column ref-uuid))
                                                        merge metric-opts)))
                        ordered-summary-refs)]
    (lib/with-fields query ordering-stage-number field-refs)))

;; TODO: This does not convey metrics specific options to order by reference.
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
    (do
      (-> query
          (mark-original-column-order stage-number)
          (mark-original-sort-order stage-number)
          (join-metric-queries stage-number
                               (map (partial metric-query query stage-number)
                                    (lib.metadata/bulk-metadata-or-throw query :metadata/card ids)))
          (lib.order-by/remove-all-order-bys stage-number)
          (attach-metric-columns stage-number)
          #_(preprocess-for-expansion stage-number)
          (reconcile-aggregations stage-number)
          #_(as-> $ (do (def rere $) $))
          (inject-ordering-stage stage-number)))
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
  #_query
  (let [res (reduce expand-referenced-metrics-in-stage
                      query
                      (range (count (:stages query))))]
      res))
