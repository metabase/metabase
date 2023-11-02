(ns metabase.query-processor.middleware.expand-macros
  "Middleware for expanding `:metric` and `:segment` 'macros' in *unexpanded* MBQL queries.

  (`:metric` forms are expanded into aggregations and sometimes filter clauses, while `:segment` forms are expanded
  into filter clauses.)

   TODO - this namespace is ancient and written with MBQL '95 in mind, e.g. it is case-sensitive.
   At some point this ought to be reworked to be case-insensitive and cleaned up.

   # Metrics and joins

   Metrics, when created, are bound to specific database table, hence query that uses metric aggregations should use
   corresponding source table. Query can then contain any joins or be used as join source.

   # Metrics and \"groupped by\"

   Even though interface for metric modelling contains \"groupped by\" column, there is no groupping functionality
   in place as per [flamber's comment](https://discourse.metabase.com/t/cannot-use-grouped-by-in-metrics/11339/2).
   Related issue can be found [here](https://github.com/metabase/metabase/issues/13167). Because of that, metric is
   expected to have no `:breakout` set and it is up to query that is using the metrics to set `:breakout` that will be
   common for all metrics contained in that query.

   # Metrics and filters or segments

   Metric and query containing it can have `:filter` set. Those filters can differ. Query can contain multiple metrics
   with a different filters. That implies metrics in one query could aggregate on a different sets of rows. This
   problem is handled by groupping metrics by filters, computing common filter metrics value in sub query. [TODO Refer
   this for further explanation].

   Same holds for segments. Containing query's segments should get expanded before metric expansion takes place.

   # Metrics and expressions

   Expressions won't appear in metric definition. But can be used:
   1. In aggregation expression with metrics arg.
   2. In breakout.

   TODO: describe expression handling during query compilation in context of metrics expansion!

   # Solution overview

   This section contains descriptions of steps of the expansion as they follow.

   ## Metrics are groupped by filters and generation of `metrics-query`s

   Metrics are groupped by filters. [TODO For reasons why refer to metrics and filter section] For every group
   `metrics-query` is created. It is a sub query:
   1. Filter of which is result of combining filters of containing (original) query and filter that is common for 
      metrics group.
   2. Breakout is the same as in containing (original) query.*
   3. Aggregations are taken from metric definitions of the group and have `::metric` aggregation option added, which
      is later used, while joining aggregations back to the original query, to decide which joined field represnt
      which metric.

   * As metrics can be defined recursively, `metrics-query` can contain `:metric` clauses after the first round of
     expansion. If that is the case, metrics are expanded further, hence final `:breakout` of `metrics-query` may be
     different from breakout of containing (original) query. [TODO For details refer to...]

   ### Rationale on combining filters

   Not to confuse with groupping. [[mbql.u/combine-filter-clauses]] is used to combine containing (original) query's
   filter with metrics group filter. `metrics-query` row set is same or smaller than of the containing (original)
   query. That is taken advantage of when joining `metrics-query` back to the containing (original) query.

   Alternative designs could involve giving user ability to choose which filters are applied to the metric - both, ony
   metric filter or only containing (original) query filter. But that would require also FE modifications, that are 
   out of the scope of this bug fix.

   ## `metrics-query`s are joined to the containing (original) query

   First question to naturally arise is how to model join conditions for the `metrics-query`. Original query breakout
   fields are used in metrics queries. Because of that, every row of result of `metrics-query` contain unique
   combination of breakout fields' values and columns with computed metrics aggregations. In sql terms, groupping and
   aggregation functions are performed after joins. So while joining the `metrics-query` to the original query,
   equality of original breakout fields in original query and in `metrics-query` is taken advantage of.

   Join condition checks for the equality of breakout values in original query and `metrics-query`. So one row from
   `metrics-query`, and its values of metrics columns, corresponds to the rows of original query with equivalent
   breakout set.

   Original query is then adjusted to use fields from joined `metrics-query`s instead of `:metric` clauses. More on
   that in following sections.

   ### Using left join operator

   As explained in [### Rationale on combining filters] and [## `metrics-query`s are joined to the containing 
   (original) query], it is guaranteed that every row of `metrics-query` result set will correspond to at least one
   row of original query by its breakout. To phrase it differently, left join can be used because every row in
   joined data (rhs) corresponds to at least one row in data that is being joined to (lhs), hence no results are
   discarded.

   This way, if some breakout combination is contained in original query's source data and is missing in 
   `metrics-query`'s results because of more strict filtering, left join will result in NULL value field for this
   breakout combination.

   ## Transformation of original query

   ### Swapping metric clauses in aggregation for joined fields

   During modification of joins by [[join-metrics-query]], `::metirc-id->field` is added. This key contains map from
   metric id to field usable in joining query. [[swap-metric-clauses]] uses this map to swap metric clauses for fields.
   In case only one metric clause and nothing else is used in aggregation, whole aggregation is swapped for a field.

   [[move-ag-fields-to-breakout]] later moves those fields to breakout, but more on that in later sections.

   ### Preserving original order of query columns

   [[infer-ordered-clause-refs-for-fields]] analyzes contents of `:aggregation` after [[swap-metric-clauses]] and adds
   ::ordered-clause-refs-for-fields key to the transformed query. Value of this key is vector where index is order
   of columns from original query and value is reference to clause representing that column after transformation. Value
   has a form [clause-type index], eg. [:breakout 2].

   This data is further used in [[maybe-wrap-in-ordering-query]], but more on that later.

   ### Update of references in `:order-by`

   As some aggregations of transformed query could become breakout fields, references to those former aggregations,
   now breakout fields are adjusted accordingly in [[update-order-by-ag-refs]].

   ### Move fields that are result of transformed aggregations to breakout

   ## Wrapping into ordering query

   If metrics are in top level root query and not in joins or source query, this query, after it gets transformed,
   is wrapped into ordering query. That is necessary, because if some aggregation becomes breakout field, it could
   potentially change order of columns in resulting query.

   Example. Let's have query as following (only relevant snippet is used):
   
   ```
   {:aggregation [[:count]
                  [:metric 1]]}
   ```
   
   Metric one aggregation would become a breakout field during transformation. That would change the order of
   the result columns. Because of that [[maybe-warp-in-ordering-query]] is used. It wraps transformerd query
   into ordering query and uses `::ordered-clause-refs-for-fields` to recreate original order of query columns.

   # Naming of metrics columns

   TBD"
  (:require
   [clojure.walk :as walk]
   [malli.core :as mc]
   [malli.error :as me]
   [medley.core :as m]
   [metabase.mbql.schema :as mbql.s]
   [metabase.mbql.schema.helpers :as helpers]
   [metabase.mbql.util :as mbql.u]
   [metabase.models.metric :refer [Metric]]
   [metabase.models.segment :refer [Segment]]
   [metabase.query-processor.error-type :as qp.error-type]
   [metabase.query-processor.middleware.add-source-metadata :as qp.add-source-metadata]
   [metabase.query-processor.middleware.annotate :as annotate]
   [metabase.util :as u]
   [metabase.util.i18n :refer [trs tru]]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu]
   [metabase.util.malli.schema :as ms]
   [toucan2.core :as t2]
   [clojure.set :as set]))

(set! *warn-on-reflection* true)

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                                    SEGMENTS                                                    |
;;; +----------------------------------------------------------------------------------------------------------------+

(defn- segment-clauses->id->definition [segment-clauses]
  (when-let [segment-ids (seq (filter integer? (map second segment-clauses)))]
    (t2/select-pk->fn :definition Segment, :id [:in (set segment-ids)])))

(defn- replace-segment-clauses [form segment-id->definition]
  (mbql.u/replace form
    [:segment (segment-id :guard (complement mbql.u/ga-id?))]
    (or (:filter (segment-id->definition segment-id))
        (throw (IllegalArgumentException. (tru "Segment {0} does not exist, or is invalid." segment-id))))))

(defn- expand-segments
  "Recursively expand segments in the `form`."
  [form]
  (loop [form-to-expand form
         depth 0]
    (if-let [segments (mbql.u/match form-to-expand [:segment (_ :guard (complement mbql.u/ga-id?))])]
      (let [segment-id->definition (segment-clauses->id->definition segments)
            expanded-form (replace-segment-clauses form-to-expand segment-id->definition)]
        ;; Following line is in place to avoid infinite recursion caused by mutually recursive
        ;; segment definitions or other unforseen circumstances. Number 41 is arbitrary.
        (if (or (= expanded-form form-to-expand) (= depth 41))
          (throw (ex-info (tru "Segment expansion failed. Check mutually recursive segment definitions.")
                          {:type qp.error-type/invalid-query
                           :original-form form
                           :expanded-form expanded-form
                           :segment-id->definition segment-id->definition
                           :depth depth}))
          (recur expanded-form (inc depth))))
      form-to-expand)))

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                                    METRICS                                                     |
;;; +----------------------------------------------------------------------------------------------------------------+

(defn- metrics
  "Return a sequence of any (non-GA) `:metric` MBQL clauses in `query`."
  [query]
  ;; metrics won't be in a native query but they could be in source-query or aggregation clause
  (mbql.u/match query [:metric (_ :guard (complement mbql.u/ga-id?))]))

(def ^:private MetricInfo
  [:map
   [:id         ms/PositiveInt]
   [:name       ms/NonBlankString]
   [:definition [:map
                 [:aggregation [:tuple mbql.s/Aggregation]]
                 [:filter {:optional true} [:maybe mbql.s/Filter]]]]])

(defn- metric-info-validation-errors [metric-info]
  (me/humanize (mc/explain MetricInfo metric-info)))

(mu/defn ^:private metric-clauses->id->info :- [:map-of ms/PositiveInt MetricInfo]
  [metric-clauses :- [:sequential mbql.s/metric]]
  (when (seq metric-clauses)
    (m/index-by :id (for [metric (t2/select [Metric :id :name :definition] :id [:in (set (map second metric-clauses))])
                          :let   [errors (u/prog1 (metric-info-validation-errors metric)
                                           (when <>
                                             (log/warn (trs "Invalid metric: {0} reason: {1}" metric <>))))]
                          :when  (not errors)]
                      metric))))

(mu/defn ^:private add-metrics-filters-this-level :- mbql.s/MBQLQuery
  [inner-query                :- mbql.s/MBQLQuery
   this-level-metric-id->info :- [:map-of ms/PositiveInt MetricInfo]]
  (let [filters (for [{{filter-clause :filter} :definition} (vals this-level-metric-id->info)
                      :when filter-clause]
                  filter-clause)]
    (reduce mbql.u/add-filter-clause-to-inner-query inner-query filters)))

(mu/defn ^:private metric-info->ag-clause :- mbql.s/Aggregation
  "Return an appropriate aggregation clause from `metric-info`."
  [{{[aggregation] :aggregation} :definition, metric-name :name} :- MetricInfo
   {:keys [use-metric-name-as-display-name?]}                    :- [:map [:use-metric-name-as-display-name? :boolean]]]
  (if-not use-metric-name-as-display-name?
    aggregation
    ;; try to give the resulting aggregation the name of the Metric it came from, unless it already has a display
    ;; name in which case keep that name
    (mbql.u/match-one aggregation
      [:aggregation-options _ (_ :guard :display-name)]
      &match

      [:aggregation-options ag options]
      [:aggregation-options ag (assoc options :display-name metric-name)]

      _
      [:aggregation-options &match {:display-name metric-name}])))

(mu/defn ^:private replace-metrics-aggregations-this-level :- mbql.s/MBQLQuery
  [inner-query                :- mbql.s/MBQLQuery
   this-level-metric-id->info :- [:map-of ms/PositiveInt MetricInfo]]
  (letfn [(metric [metric-id]
            (or (get this-level-metric-id->info metric-id)
                (throw (ex-info (tru "Metric {0} does not exist, or is invalid." metric-id)
                                {:type   :invalid-query
                                 :metric metric-id
                                 :query  inner-query}))))]
    (mbql.u/replace-in inner-query [:aggregation]
                       ;; so case where we do nothing with regards to names
      ;; if metric is wrapped in aggregation options that give it a display name, expand the metric but do not name it
      [:aggregation-options [:metric (metric-id :guard (complement mbql.u/ga-id?))] (options :guard :display-name)]
      [:aggregation-options
       (metric-info->ag-clause (metric metric-id) {:use-metric-name-as-display-name? false})
       options]

                       ;; this means that 
      ;; if metric is wrapped in aggregation options that *do not* give it a display name, expand the metric and then
      ;; merge the options
      [:aggregation-options [:metric (metric-id :guard (complement mbql.u/ga-id?))] options]
      (let [[_ ag ag-options] (metric-info->ag-clause (metric metric-id) {:use-metric-name-as-display-name? true})]
        [:aggregation-options ag (merge ag-options options)])

      ;; otherwise for unwrapped metrics expand them in-place
      [:metric (metric-id :guard (complement mbql.u/ga-id?))]
      (metric-info->ag-clause (metric metric-id) {:use-metric-name-as-display-name? true}))))

(mu/defn ^:private metric-ids-this-level :- [:maybe [:set ms/PositiveInt]]
  [inner-query]
  (when (map? inner-query)
    (when-let [aggregations (:aggregation inner-query)]
      (not-empty
       (set
        (mbql.u/match aggregations
          [:metric (metric-id :guard (complement mbql.u/ga-id?))]
          metric-id))))))

(mu/defn ^:private expand-metrics-clauses-this-level :- [:and
                                                         mbql.s/MBQLQuery
                                                         [:fn
                                                          {:error/message "Inner MBQL query with no :metric clauses at this level"}
                                                          (complement metric-ids-this-level)]]
  [inner-query     :- mbql.s/MBQLQuery
   metric-id->info :- [:map-of ms/PositiveInt MetricInfo]]
  (let [this-level-metric-ids      (metric-ids-this-level inner-query)
        this-level-metric-id->info (select-keys metric-id->info this-level-metric-ids)]
    (-> inner-query
        (add-metrics-filters-this-level this-level-metric-id->info)
        (replace-metrics-aggregations-this-level this-level-metric-id->info))))

(mu/defn ^:private expand-metrics-clauses :- ms/Map
  "Add appropriate `filter` and `aggregation` clauses for a sequence of Metrics.

    (expand-metrics-clauses {:query {}} [[:metric 10]])
    ;; -> {:query {:aggregation [[:count]], :filter [:= [:field-id 10] 20]}}"
  [query :- ms/Map metric-id->info :- (helpers/non-empty [:map-of ms/PositiveInt MetricInfo])]
  (mbql.u/replace query
    (m :guard metric-ids-this-level)
    (-> m
        ;; expand this this level...
        (expand-metrics-clauses-this-level metric-id->info)
        ;; then recursively expand things at any other levels.
        (expand-metrics-clauses metric-id->info))))

(mu/defn ^:private expand-metrics-old :- mbql.s/Query
  [query :- mbql.s/Query]
  (if-let [metrics (metrics query)]
    (expand-metrics-clauses query (metric-clauses->id->info metrics))
    query))

;;;; METRICS REVAMP

;;;; TODO: which keys do we really need?
(defn- remove-metrics-internals [query]
  (walk/postwalk
   (fn [form]
     (if (map? form)
       (dissoc form ::metric-id ::metric-id->field ::ordered-clause-refs-for-fields
               ::original-breakout-count ::original-display-name ::original-name ::metric-name)
       form))
   query))

(defn- mbql-query->metadata
  "1. ensure vector, 2. assertion"
  [query]
  (def mbql-qq query)
  (let [metadata (vec (qp.add-source-metadata/mbql-source-query->metadata 
                       (remove-metrics-internals query)))]
    (if (seq metadata)
      metadata
      (throw (ex-info "Expected not-empty metdata."
                      {:type qp.error-type/invalid-query
                       :query query
                       :metadata metadata})))))


;;;; TODO maybe try catch
(defn- hash-hex-str
  [hashable]
  (->> hashable hash Integer/toHexString))

;;;; OK
(mu/defn ^:private metric-info->aggregation :- mbql.s/Aggregation
  ;;;; I'm using here metric-name as name and display-name and name for the aggregation
  ;;;; This is necessary
  ;;;; default
  ;;;; If that aggregation is contained in aggregation options, this will be overriden. Or not necessary
  ;;;
  ;; TODO: I must use metric nameas default name, explain in docstring why is that necessary
  ;;
  ;; I probably do not need metric-name set
  [{{[ag] :aggregation filter :filter} :definition id :id name :name :as _metric-info} :- MetricInfo]
  (let [raw-metric-ag (mbql.u/match-one ag
                                        [:aggregation-options unnamed-ag _]
                                        unnamed-ag

                                        _
                                        &match)]
    [:aggregation-options raw-metric-ag {::metric-id id
                                         ::metric-name name
                                         :name name
                                         :display-name name}]))

(def ^:dynamic ^:private *expansion-depth*
  "Track depth of exapansion of metrics defined with use of other metrics. Used to avoid infinite recursion in case of
   any unforseen circumstances."
  0)

;;;; TODO: Leave it in the back of your head for now. :source-query is redundant, :joins are necessary.
;;;; TODO: Elaborate on why :limit and :order-by can be left out!
(def ^:private metrics-query-keys
  "Keys that are copied from original query into metrics query.
   `:source-table`, `:joins and `:filter` impact source data before aggregation. `:breakout` is also same as in
   original query. `:breakout` or `:filter` could also contain expressions, so those are included too."
  [:source-table :joins :filter :breakout :expressions])

(declare expand-metrics*)

;;;; TODO: doc
(mu/defn ^:private metrics-query :- mbql.s/MBQLQuery
  [original-query :- mbql.s/MBQLQuery metric-infos :- [:sequential MetricInfo]]
  (assert (apply = (map (comp :filter :definition) metric-infos)) "Metrics have different filters.")
  (let [filter (get-in (first metric-infos) [:definition :filter])
        metrics-query-expanded-this-level
        (loop [[metric-info & ms] metric-infos
               query (-> (select-keys original-query metrics-query-keys)
                         (m/assoc-some :filter filter))]
          (if (some? metric-info)
            (recur ms (update query :aggregation #(conj (vec %1) %2)
                              (metric-info->aggregation metric-info)))
            query))]
    (binding [*expansion-depth* (inc *expansion-depth*)]
      (-> (expand-metrics* metrics-query-expanded-this-level)
          ;;;; `::ordered-clause-refs-for-fields` is removed because it is relevant only in top level call
          ;;;;   ie. in expand-metrics.
          ;;;; TODO maybe remove, just noise...
          (dissoc ::ordered-clause-refs-for-fields)))))

(defn- query->join-alias [query]
  (->> query :filter hash-hex-str (str "metric__")))

(defn- clause->field
  ;;;; clauses from breakout or aggregation
  ;;;; respect field options in source clause
  [query [type :as clause] {base-type :base_type name :name :as _metadata}]
  (def xq [query clause _metadata])
  ;;;; it is heavily overloaded but looks working
  (case type
    :field clause
    :expression (let [expr-name (second clause)
                      [expr-type :as expr-val] (get-in query [:expressions expr-name])]
                  (case expr-type
                    :field [:field expr-name (assoc (get expr-val 2) :base-type base-type)]
                    [:field expr-name {:base-type base-type}]))
    :aggregation-options [:field name (assoc (get clause 2) :base-type base-type)]
    [:field name {:base-type base-type}]))

(defn- metrics-query-join-condition
  [join-alias joining-query joined-query metrics-query-metadata]
  (let [conditions (for [[index breakout] (map vector (range) (:breakout joining-query))]
                     [:= breakout 
                      (-> (clause->field joined-query breakout (metrics-query-metadata index))
                          (mbql.u/update-field-options assoc :join-alias join-alias))])]
    ;;;; TODO: Using [:= 1 1] as condition is problematic. Hence changed to [:= [:+ 1 1] 2]. [:= 1 1] is changed 
    ;;;;       to [:= [:field 1 nil] 1] during preprocess and main cultprit is some middleware. Investigate!
    (case (count conditions)
      0 [:= [:+ 1 1] 2]
      1 (first conditions)
      (into [:and] conditions))))

;;;; this also needs some cleanup
(mu/defn ^:private metrics-join
  "Something"
  [query :- mbql.s/MBQLQuery metrics-query :- mbql.s/MBQLQuery]
  (assert (every? #(some #{%} (:breakout metrics-query)) (:breakout query))
    "Original breakout missing in metrics query.")
  (let [join-alias (query->join-alias metrics-query)
        metrics-query-metadata (mbql-query->metadata metrics-query)]
    {:alias join-alias
     :strategy :left-join
     :condition (metrics-query-join-condition join-alias query metrics-query metrics-query-metadata)
     :source-query metrics-query
     :source-metadata metrics-query-metadata
     :fields :all}))

;;;; TODO following is hairy!!!
(defn- provides
  "Return map of metric-id -> field usable in joining query."
  [{:keys [breakout aggregation] :as query} metadatas join-alias]
  (let [original-breakout-count (or (::original-breakout-count query) (count breakout))
        _ (def cq [query metadatas join-alias original-breakout-count])
        ;;;; !!! breakout can be empty which does not play well with subvec
        fields @(def xi (map (partial clause->field query)
                             @(def df (into (subvec (vec breakout) original-breakout-count)
                                            aggregation))
                             (subvec metadatas original-breakout-count)))]
    (m/index-by #(get-in % [2 ::metric-id])
                (mapv #(update % 2 assoc
                               :join-alias join-alias
                               ::annotate/avoid-display-name-prefix? true)
                      fields)))
  )

(comment
  (clause->field (cq 0) (get-in cq [1 1]))
  (apply provides (take 3 cq))
  )

;;; DOUBLE-check
(defn- join-metrics-query
  "Joins [[metrics-query]] into original query.
   Sets `::metric-id->field` which is later used during original query transformation, in [[swap-metric-clauses]]."
  [query metrics-query]
  (let [{:keys [alias source-metadata source-query] :as join} (metrics-join query metrics-query)]
    (-> query
        (update :joins #(conj (vec %1) %2) join)
        (update ::metric-id->field merge (provides source-query source-metadata alias)))))

(mu/defn ^:private expand-and-combine-filters
  "Something"
  [{query-filter :filter} :- mbql.s/MBQLQuery {{metric-filter :filter} :definition :as metric-info} :- MetricInfo]
  (if-let [combined-filter (if (nil? query-filter)
                             (expand-segments metric-filter)
                             (mbql.u/combine-filter-clauses query-filter (expand-segments metric-filter)))]
    (assoc-in metric-info [:definition :filter] combined-filter)
    metric-info))

;;;; OK
(defn- metrics!
  "Get metric infos from app database. Every distinct metric id provided, is expected to have metric info fetched."
  [inner-query]
  (when-let [metrics-ids (not-empty (set (map second (metrics inner-query))))]
    (doto (t2/select :model/Metric :id [:in metrics-ids])
      (as-> $ (assert (= (count metrics-ids) (count $)) "Metric id and fetched metric model count mismatch.")))))

;;;; OK
(defn- swap-ag-for-field
  "Swap aggregation containing one and only metric and nothing else for appropriate field.
   If the aggregation was coming from a metric its options are used to override field options. That ensures metrics
   defined using other metrics works ok."
  [ag metric-id->field]
  (def aaa ag)
  (def metmet metric-id->field)
  ;;;
  ;; here it shoudl be guaranteed that only aggregation options are passed in
  (mbql.u/match-one ag
                    [:aggregation-options [:metric id] opts]
                    #_:clj-kondo/ignore
                    #_(into (recur inner-ag) opts)
                    (update (metric-id->field id) 2 m/assoc-some
                            ::metric-id (::metric-id opts)
                            ::metric-name (::metric-name opts)
                            ::name (:name opts)
                            ::display-name (:display-name opts))
                    [:metric id]
                    (metric-id->field id))
  #_(def mmmid metric-id)
  #_(def mmmopts opts)
  #_(update (metric-id->field metric-id) 2 m/assoc-some
          ::metric-id (::metric-id opts)
          ::metric-name (::metric-name opts)
          ::name (:name opts)
          ::display-name (:display-name opts)))

(comment
  (swap-ag-for-field aaa metmet)
  mmmid
  (count ahoj)
  (def ahoj
    ;;;; match-one does not work properly with recur stuffffffff
    (mbql.u/match-one aaa
                              [:aggregation-options inner-ag opts]
                              #_:clj-kondo/ignore
                              (recur inner-ag)
                              #_(update (recur inner-ag) 2 m/assoc-some
                              ;;;; TODO: which keys do we actually need?
                                        ::metric-id (::metric-id opts)
                                        ::metric-name (::metric-name opts)
                                        ::name (:name opts)
                                        ::display-name (:display-name opts))
                              [:metric id]
                              (metmet 148)))
  )

;;;; DONE
(defn- one-and-only-metric?
  "Determine if aggregation consists of one metric only, possibly wrapped in `:aggregation-options`."
  [ag]
  (boolean (mbql.u/match-one ag
             [:metric _]
             (or (empty? &parents)
                 (= [:aggregation-options] &parents)))))

(defn- swap-metric-clauses-in-aggregation
  "Something"
  [query ag]
  (tap> ["swap-metric-clauses-in-aggregation args" query ag])
  (if (one-and-only-metric? ag)
    (swap-ag-for-field ag (::metric-id->field query))
    (mbql.u/replace ag [:metric id] (get-in query [::metric-id->field id]))))

;;;; Following is only relevant for fields that were swapped for aggregation
;;;; There are multiple cases to consider
;;;; 1. ag opts with display-name
;;;; 2. ag opts with name
;;;; 3. unnamed ag containing metric
;;;; 4. unnamed ag containing expression with metric/s
(defn- desired-name-for-field
  "Choose name for a field being renamed during metric aggregation to field transformation.
   Field is expected to have at least some of the following keys set in field options:
   - ::display-name from ag
   - ::name from ag
   - ::metric-name from metric.
   "
  [[_ _ field-opts]]
  (tap> ["desired-name-for-field" field-opts])
  (or (::display-name field-opts)
      (::name field-opts)
      (::metric-name field-opts)))

;; LOOKS OK
(defn- name-for-renamed-field
  "Name for field that was result of metrics aggregation transformation."
  [used-names desired-name]
  (if-not (contains? used-names desired-name)
    desired-name
    (let [similar-pattern (re-pattern (str "(?<=\\Q" desired-name "\\E \\()\\d+(?=\\))"))
          similar-names-indices (into [] (comp (keep (partial re-find similar-pattern))
                                               (map #(Integer/parseInt %)))
                                      used-names)
          new-index (inc (apply max 0 similar-names-indices))]
      (str desired-name " (" new-index ")"))))

(defn- fields->renaming-map+order
  [used-names fields]
  (loop [[[_ _ field-opts :as field] & rest-fields] fields
         used-names (set used-names)
         result {:ordered-names []
                 :name->field {}}]
    (if (nil? field-opts)
      result
      (let [desired-name (desired-name-for-field field)
            new-name (name-for-renamed-field used-names desired-name)]
        (recur rest-fields
               (conj used-names new-name)
               (-> result
                   (update :ordered-names conj new-name)
                   (assoc-in [:name->field new-name] field)))))))

(defn- swap-metric-clauses
  "! Query is expected to have metrics queries joined in and ::metric-id->field set."
  [{:keys [aggregation expressions breakout] :as query}]
  (tap> ["swap-metric-clauses args" query])
  (let [swapped-ags (doto (map (partial swap-metric-clauses-in-aggregation query) aggregation)
                      (as-> $ (tap> ["xixix" $])))
        {:keys [remaining-ags fields-from-ags]}
        (group-by (fn [[type]] (case type :field :fields-from-ags :remaining-ags)) swapped-ags)
        {:keys [ordered-names name->field]}
        (fields->renaming-map+order (keys expressions) fields-from-ags)
        ordered-expression-references (mapv (partial vector :expression) ordered-names)]
    (-> query
        (u/assoc-dissoc :aggregation (not-empty (vec remaining-ags)))
        (m/assoc-some :expressions (not-empty (merge expressions name->field)))
        (m/assoc-some :breakout (not-empty (into (vec breakout) ordered-expression-references))))))

(defn- ordered-clause-refs-for-fields
  "Something"
  [breakout-idx ag-idx [[_type :as ag] & ags] acc]
  (cond (nil? ag)
        acc

        (one-and-only-metric? ag)
        (recur (inc breakout-idx) ag-idx ags (conj acc [:breakout breakout-idx]))

        :else
        (recur breakout-idx (inc ag-idx) ags (conj acc [:aggregation ag-idx]))))

(defn- infer-ordered-clause-refs-for-fields
  "Something"
  [{:keys [breakout] :as query}]
  (let [orig-breakout-count (count breakout)
        clauses-from-orig-breakout (mapv #(vector :breakout %) (range orig-breakout-count))]
    (assoc query ::ordered-clause-refs-for-fields
           (ordered-clause-refs-for-fields orig-breakout-count 0 (:aggregation query) clauses-from-orig-breakout))))

;;;; TODO: docstring!
(defn- clause-ref->order-by-element
  "Only expressions and are in breakout! aggregation"
  [query [clause-type :as clause-ref]]
  (case clause-type
    :breakout (get-in query clause-ref)
    clause-ref))

;;;; TODO: Docstring!
(defn- update-order-by-ag-refs
  "Expects aggregations processed. And ::ordered-clause-refs-for-fields set."
  [{::keys [ordered-clause-refs-for-fields] :as query}]
  (assert (and (vector? ordered-clause-refs-for-fields)
               (seq ordered-clause-refs-for-fields))
          (trs "Expected not empty vector of `ordered-clause-refs-for-fields`."))
  (let [original-ag-index->clause-ref (subvec ordered-clause-refs-for-fields (::original-breakout-count query))]
    (mbql.u/replace-in query [:order-by]
      [:aggregation idx]
      (clause-ref->order-by-element query (original-ag-index->clause-ref idx)))))

;;;; DONE
(defn- metric-infos->metrics-queries
  "Transforms metric infos into metrics queries."
  [original-query metric-infos]
  (->> metric-infos
       (map (partial expand-and-combine-filters original-query))
       (sort-by (comp :filter :definition))
       (partition-by (comp :filter :definition))
       (mapv (partial metrics-query original-query))))

(mu/defn ^:private expand-metrics*
  "Recursively expand metrics."
  [query :- mbql.s/MBQLQuery]
  (when (= *expansion-depth* 41)
    (throw (ex-info (tru "Exceeded recursion limit for metric expansion.")
                    {:type qp.error-type/invalid-query
                     :query query
                     :depth *expansion-depth*})))
  (assert (empty? (metrics (:joins query))) "Joins contain unexpanded metrics.")
  (if-let [metric-infos (metrics! query)]
    (let [with-joined-metrics-queries (->> metric-infos
                                           (metric-infos->metrics-queries query)
                                           (reduce join-metrics-query query))]
      (-> with-joined-metrics-queries
          (assoc ::original-breakout-count (count (:breakout query)))
          (infer-ordered-clause-refs-for-fields)
          (swap-metric-clauses)
          ;;;; TODO: confirm it is safe to remove this guy!
          #_(dissoc ::metric-id->field)
          (update-order-by-ag-refs)))
    query))

(defn- clause-ref->column-index
  [{:keys [breakout]} [type ref]]
  (case type
    :aggregation (+ ref (count breakout))
    :breakout ref))

(defn- clause-ref->clause
  ;; :aggregation or breakout
  [query [type :as clause-ref]]
  (assert (contains? #{:aggregation :breakout} type))
  (get-in query clause-ref))

(comment
  rrr
  (clause-ref->clause fds [:breakout 0])
  (def fds {:limit 5,
            :joins
            [{:alias "metric__0",
              :strategy :left-join,
              :condition [:= [:field 85 nil] [:field 85 {:join-alias "metric__0"}]],
              :source-query
              {:source-table 9,
               :breakout [[:field 85 nil] [:expression "Just nesting"]],
               :joins
               [{:alias "metric__0",
                 :strategy :left-join,
                 :condition [:= [:field 85 nil] [:field 85 {:join-alias "metric__0"}]],
                 :source-query
                 {:source-table 9,
                  :breakout [[:field 85 nil]],
                  :aggregation
                  [[:aggregation-options
                    [:count]
                    {:metabase.query-processor.middleware.expand-macros/metric-id 483,
                     :metabase.query-processor.middleware.expand-macros/metric-name "venues, count",
                     :name "venues, count",
                     :display-name "venues, count"}]]},
                 :source-metadata
                 [{:semantic_type :type/FK,
                   :table_id 9,
                   :coercion_strategy nil,
                   :name "CATEGORY_ID",
                   :settings nil,
                   :field_ref [:field 85 nil],
                   :effective_type :type/Integer,
                   :nfc_path nil,
                   :parent_id nil,
                   :id 85,
                   :display_name "Category ID",
                   :fingerprint {:global {:distinct-count 28, :nil% 0.0}},
                   :base_type :type/Integer}
                  {:name "venues, count",
                   :display_name "venues, count",
                   :base_type :type/Integer,
                   :semantic_type :type/Quantity,
                   :field_ref [:aggregation 0]}],
                 :fields :all}],
               :metabase.query-processor.middleware.expand-macros/metric-id->field
               {483
                [:field
                 "venues, count"
                 {:metabase.query-processor.middleware.expand-macros/metric-id 483,
                  :metabase.query-processor.middleware.expand-macros/metric-name "venues, count",
                  :name "venues, count",
                  :display-name "venues, count",
                  :base-type :type/Integer,
                  :join-alias "metric__0",
                  :metabase.query-processor.middleware.annotate/avoid-display-name-prefix? true}]},
               :metabase.query-processor.middleware.expand-macros/original-breakout-count 1,
               :expressions
               {"Just nesting"
                [:field
                 "venues, count"
                 {:metabase.query-processor.middleware.expand-macros/display-name "Just nesting",
                  :base-type :type/Integer,
                  :metabase.query-processor.middleware.expand-macros/metric-name "Just nesting",
                  :metabase.query-processor.middleware.annotate/avoid-display-name-prefix? true,
                  :name "venues, count",
                  :join-alias "metric__0",
                  :metabase.query-processor.middleware.expand-macros/metric-id 482,
                  :metabase.query-processor.middleware.expand-macros/name "Just nesting",
                  :display-name "venues, count"}]}},
              :source-metadata
              [{:semantic_type :type/FK,
                :table_id 9,
                :coercion_strategy nil,
                :name "CATEGORY_ID",
                :settings nil,
                :field_ref [:field 85 nil],
                :effective_type :type/Integer,
                :nfc_path nil,
                :parent_id nil,
                :id 85,
                :display_name "Category ID",
                :fingerprint {:global {:distinct-count 28, :nil% 0.0}},
                :base_type :type/Integer}
               {:name "Just nesting",
                :display_name "Just nesting",
                :base_type :type/Integer,
                :source_alias "metric__0",
                :field_ref [:expression "Just nesting"]}],
              :fields :all}],
            :source-table 9,
            :expressions
            {"Just nesting"
             [:field
              "Just nesting"
              {:metabase.query-processor.middleware.expand-macros/display-name "Just nesting",
               :base-type :type/Integer,
               :metabase.query-processor.middleware.expand-macros/metric-name "Just nesting",
               :metabase.query-processor.middleware.annotate/avoid-display-name-prefix? true,
               :name "venues, count",
               :join-alias "metric__0",
               :metabase.query-processor.middleware.expand-macros/metric-id 482,
               :metabase.query-processor.middleware.expand-macros/name "Just nesting",
               :display-name "venues, count"}]},
            :metabase.query-processor.middleware.expand-macros/original-breakout-count 1,
            :breakout [[:field 85 nil] [:expression "Just nesting"]],
            :order-by [[:asc [:field 85 nil]]],
            :metabase.query-processor.middleware.expand-macros/metric-id->field
            {482
             [:field
              "Just nesting"
              {:metabase.query-processor.middleware.expand-macros/display-name "Just nesting",
               :base-type :type/Integer,
               :metabase.query-processor.middleware.expand-macros/metric-name "Just nesting",
               :metabase.query-processor.middleware.annotate/avoid-display-name-prefix? true,
               :name "venues, count",
               :join-alias "metric__0",
               :metabase.query-processor.middleware.expand-macros/metric-id 482,
               :metabase.query-processor.middleware.expand-macros/name "Just nesting",
               :display-name "venues, count"}]}})
               )

(defn- clause-ref->field
  "Transform clause reference from :ordered-clause-refs-for-fields of format [type index] to field usable in wrapping query."
  [query metadatas clause-ref]
  (let [column-index (clause-ref->column-index query clause-ref)
        metadata (metadatas column-index)
        clause (clause-ref->clause query clause-ref)]
    (clause->field query clause metadata)))

(defn- maybe-wrap-in-ordering-query
  ;;;; TODO: doc!
  "Wrap query that previously contained metrics aggregations and was transformed by [[expand-metrics*]] into ordering
   query. Order of fields can change [[expand-metrics*]]"
  [{ordered-clause-refs-for-fields ::ordered-clause-refs-for-fields :as inner-query}]
  (if (some? ordered-clause-refs-for-fields)
    (let [inner-query* (dissoc inner-query ::ordered-clause-refs-for-fields)
          metadatas (mbql-query->metadata inner-query*)]
      {:fields (mapv (partial clause-ref->field inner-query* metadatas) ordered-clause-refs-for-fields)
       :source-query inner-query*
       :source-metadata metadatas})
    inner-query))

;;;; TODO: Add something like `remove-metric-internals`. That's necessary because if there are some metrics
;;;;       expanded in deeper levels of query either in joins or source query, no wrapping occurs and queries
;;;;       are left with ::ordered-clause-refs-for-fields set.
(mu/defn expand-metrics :- mbql.s/Query
  ;;;; TODO: Proper docstring!
  "Expand metric macros. Expects expanded segments. If query contained metrics and expansion occured, query is wrapped
   into ordering query. Details on that in namespace docstring.
       ;;;; TODO: Condition should probably check whether query is modified, but ignoring source-query and joins. Metircs
    ;;;;       could apper at deeper levels, but column ordering there is insignificant, as not presented to user and
    ;;;;       upper level query uses sub query's results by some identifier (ie. column name) and not by column order.
   "
  [{inner-query :query :as outer-query} :- mbql.s/Query]
  ;;;; TODO: Here we should check if provided query conforms preconditions for metrics computation
  ;;;;       ie. (1) is not native, ...
  (-> outer-query
      (assoc :query (walk/postwalk
                     (fn [{:keys [source-table condition] :as form}]
                       (cond-> form
                         (and (some? source-table) (nil? condition))
                         expand-metrics*))
                     inner-query))
      (update :query maybe-wrap-in-ordering-query)
      (update :query remove-metrics-internals)))

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                                   MIDDLEWARE                                                   |
;;; +----------------------------------------------------------------------------------------------------------------+

;;;; TODO?: Factor out following function? With current, and probably upcomming state of this module, I think it is 
;;;;        redundant.
(mu/defn ^:private expand-metrics-and-segments :- mbql.s/Query
  "Expand the macros (`segment`, `metric`) in a `query`."
  [query :- mbql.s/Query]
  (doto (-> query
            expand-segments
            expand-metrics)
    (as-> $ (tap> ["expand-metrics-and-segments result" $]))))

(defn expand-macros
  "Middleware that looks for `:metric` and `:segment` macros in an unexpanded MBQL query and substitute the macros for
  their contents."
  [{query-type :type, :as query}]
  (if-not (= query-type :query)
    query
    (expand-metrics-and-segments query)))
