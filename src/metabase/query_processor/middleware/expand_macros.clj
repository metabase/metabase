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

   [[infer-ordered-clauses-for-fields]] analyzes contents of `:aggregation` after [[swap-metric-clauses]] and adds
   ::ordered-clauses-for-fields key to the transformed query. Value of this key is vector where index is order
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
   into ordering query and uses `::ordered-clauses-for-fields` to recreate original order of query columns.

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
   [toucan2.core :as t2]))

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
      ;; if metric is wrapped in aggregation options that give it a display name, expand the metric but do not name it
      [:aggregation-options [:metric (metric-id :guard (complement mbql.u/ga-id?))] (options :guard :display-name)]
      [:aggregation-options
       (metric-info->ag-clause (metric metric-id) {:use-metric-name-as-display-name? false})
       options]

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

(defn- mbql-query->metadata
  "1. ensure vector, 2. assertion"
  [query]
  (let [metadata (vec (qp.add-source-metadata/mbql-source-query->metadata query))]
    (if (seq metadata)
      metadata
      (throw (ex-info "Expected not-empty metdata."
                      {:type qp.error-type/invalid-query
                       :query query
                       :metadata metadata})))))

(mu/defn ^:private top-display-name
  "Get display name of aggregation that contains metric with `id`.
   When aggregation becomes field by act of joining, which is inevitable for metric queries, name of the field can
   not be further changed. To overcome that overcome that name from aggregation that contains the metric is used
   to name aggregation in [[metrics-query]]."
  [{:keys [aggregation]} :- mbql.s/MBQLQuery {:keys [id] :as _metric-info} :- MetricInfo]
  (mbql.u/match-one aggregation
    [:aggregation-options [:metric examined-id] (opts :guard #(contains? % :display-name))]
    (when (= id examined-id)
      (:display-name opts))))

;;;; TODO: doc!
;;;; TODO: check correspondence with old naming logic!
(mu/defn ^:private metric-info->aggregation :- mbql.s/Aggregation
  [query :- mbql.s/MBQLQuery
   {{[ag] :aggregation} :definition id :id metric-name :name :as metric-info} :- MetricInfo]
  (let [top-display-name (top-display-name query metric-info)]
    (-> (mbql.u/match-one ag
          [:aggregation-options _ (opts :guard :display-name)]
          (assoc-in &match [2 :name] (:display-name opts))

          [:aggregation-options _ _]
          (update &match 2 assoc
                  :name metric-name
                  :display-name metric-name)

          _
          [:aggregation-options &match {:display-name metric-name :name metric-name}])
        (update 2 m/assoc-some :display-name top-display-name :name top-display-name)
        (update 2 assoc ::metric id))))

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
                              (metric-info->aggregation original-query metric-info)))
            query))]
    (binding [*expansion-depth* (inc *expansion-depth*)]
      (-> (expand-metrics* metrics-query-expanded-this-level)
          (dissoc ::ordered-clauses-for-fields)))))

(defn- query->join-alias [query]
  (->> query :filter hash Integer/toHexString (str "metric__")))

;;;; TODO: Is naming of the field correct?, also check for [[top-display-name]].
(defn- metadata->field
  [{base-type :base_type
    name :name
    display-name :display_name}]
  [:field (or name display-name) {:base-type base-type}])

(defn- clause-with-metric-opt? [form]
  (and (vector? form)
       (= 3 (count form))
       (contains? (form 2) ::metric)))

(defn- metric-field-opt [form]
  (when (clause-with-metric-opt? form)
    (::metric (form 2))))

(defn- clause->field
  "Transform `clause` of some source-query to field usable in joining or parent query.
   Conveys ::metric field option of aggregation and field, so fields are usable in [[provides]]"
  [[clause-type :as clause] metadata]
  (case clause-type
    :field clause
    (update (metadata->field metadata) 2 m/assoc-some ::metric (metric-field-opt clause))))

(defn metrics-query-join-condition
  "Generate join condition used to join [[metrics-query]] into original query.
   Used by [[metrics-join]]. For explanation of modelling join on breakout fields equality refer to this ns docstring,
   section [## `metrics-query`s are joined to the containing (original) query]."
  [join-alias joining-query metrics-query-metadata]
  (let [conditions (for [[index breakout] (map vector (range) (:breakout joining-query))]
                     [:= breakout (-> (clause->field breakout (metrics-query-metadata index))
                                      (mbql.u/update-field-options assoc :join-alias join-alias))])]
    ;;;; TODO: Using [:= 1 1] as condition is problematic. Hence changed to [:= [:+ 1 1] 2]. [:= 1 1] is changed 
    ;;;;       to [:= [:field 1 nil] 1] during preprocess and main cultprit is some middleware. Investigate!
    (condp = (count conditions)
      0 [:= [:+ 1 1] 2]
      1 (first conditions)
      (into [:and] conditions))))

(mu/defn ^:private metrics-join
  "Generate join used to join [[metrics-query]] into query being transformed.
   It is expected, that all breakout fields from transformed query are used also in `metrics-query`. For further
   explanation on modelling join as follows, refer to this namespace's docstring, section
   [## `metrics-query`s are joined to the containing (original) query]."
  [query :- mbql.s/MBQLQuery metrics-query :- mbql.s/MBQLQuery]
  (assert (every? #(some #{%} (:breakout metrics-query)) (:breakout query))
    "Original breakout missing in metrics query.")
  (let [join-alias (query->join-alias metrics-query)
        metrics-query-metadata (mbql-query->metadata metrics-query)]
    {:alias join-alias
     :strategy :left-join
     :condition (metrics-query-join-condition join-alias query metrics-query-metadata)
     :source-query metrics-query
     :source-metadata metrics-query-metadata
     :fields :all}))

;;;; TODO: because of expressions I must transform also breakout elements to fields?
;;;;       -- check later when tackling exprs!
(defn- provides
  "Generate mapping of metric id to field.
   Takes breakout and aggregation of query. Further checks which of those clauses contain `::metric` key in options.
   Presence of that key signals that clause represents column for some metric. Clauses from aggregations are
   transformed to fields. `::annotate/avoid-display-name-prefix?` ensures that annotate middleware won't prefix
   display name with join alias. That is not desired for fields comming from metrics, because they come from internal
   joins."
  [{:keys [breakout aggregation] :as _metrics-query} metadatas join-alias]
  ;;;; TODO: subvec
  (let [fields-from-ags (doto (map clause->field aggregation (drop (count breakout) metadatas))
                          (as-> $ (assert (= (count aggregation) (count $)) "Aggregation count mismatch.")))
        fields-to-provide (->> fields-from-ags
                               (into (filterv clause-with-metric-opt? breakout))
                               (map #(update % 2 assoc
                                              :join-alias join-alias
                                              ::annotate/avoid-display-name-prefix? true)))]
    (m/index-by metric-field-opt fields-to-provide)))

(defn- join-metrics-query
  "Joins [[metrics-query]] into original query.
   Sets `::metric-id->field` which is later used during original query transformation, in [[swap-metric-clauses]]."
  [query metrics-query]
  (let [{:keys [alias source-metadata source-query] :as join} (metrics-join query metrics-query)]
    (-> query
        (update :joins #(conj (vec %1) %2) join)
        (update ::metric-id->field merge (provides source-query source-metadata alias)))))

(mu/defn ^:private expand-and-combine-filters
  "Update filter definition in `metric-info` by combining original query's filter with metrics definition filter.
   Also expand segments in metric info filter definition. For explanation on combining filters refer to namespace's
   docstring, section [### Rationale on combining filters]."
  [{query-filter :filter} :- mbql.s/MBQLQuery {{metric-filter :filter} :definition :as metric-info} :- MetricInfo]
  (if-let [combined-filter (if (nil? query-filter)
                             (expand-segments metric-filter)
                             (mbql.u/combine-filter-clauses query-filter (expand-segments metric-filter)))]
    (assoc-in metric-info [:definition :filter] combined-filter)
    metric-info))

(defn- metrics!
  "Get metric infos from app database. Every distinct metric id provided, is expected to have metric info fetched."
  [inner-query]
  (when-let [metrics-ids (not-empty (set (map second (metrics inner-query))))]
    (doto (t2/select :model/Metric :id [:in metrics-ids])
      (as-> $ (assert (= (count metrics-ids) (count $)) "Metric id and fetched metric model count mismatch.")))))

(defn- swap-ag-for-field
  "Adjust field from `::metric-id->field` to be swappable for aggregation containing only one metric. If the
   aggregation that field is being swapped for was also coming from metric, ::metric opt is updated. That is
   necessary, so field can be correctly provided using [[provides]] when swapping metric uplevel."
  [ag metric-id->field]
  (mbql.u/match-one ag
    [:metric swapped-metric-id]
    (update (metric-id->field swapped-metric-id) 2
            m/assoc-some ::metric (metric-field-opt ag))))

(defn- one-and-only-metric?
  "Determine if aggregation consists of one and only metric, hence will later be swapped for a field and moved
   to breakout during transformation of query containing metrics."
  [ag]
  (mbql.u/match-one ag
    [:metric _]
    (or (empty? &parents)
        (= [:aggregation-options] &parents))))

(defn- swap-metric-clauses-in-aggregation
  "Transform one aggregation containing metrics clauses.
   Query is expected to have `::metric-id->field` key, so has joins modified with [[join-metrics-query]], joinin
   [[metrics-query]]s. If aggregation contains only one metric and nothing else, it is swapped for field, that 
   will be moved to breakout later by [[move-ag-fields-to-breakout]]."
  [query ag]
  (if (one-and-only-metric? ag)
    (swap-ag-for-field ag (::metric-id->field query))
    (mbql.u/replace ag [:metric id] (get-in query [::metric-id->field id]))))

(defn- swap-metric-clauses
  "Swap metric clauses in aggregation clauses of `query`. For details refer to [[swap-metric-clauses-in-aggregation]].
   It is guaranteed that :aggregations are not empty, because this functions is to be called only on query, that
   contains metric clauses, hence aggregations."
  [query]
  (update query :aggregation (partial mapv #(swap-metric-clauses-in-aggregation query %))))

(defn- ordered-clauses-for-fields
  "At this point of transformation `:aggregations` contain aggregation clauses or field clauses, which are result of
   [[swap-metric-clauses]]. Field clauses will be moved later to breakout. Result of this function is vector, where
   index is original query column index and value is reference to clause that represents that column after
   query transformation. Resulting map is later used by [[maybe-wrap-in-ordering-query]]."
  [breakout-idx ag-idx [[type :as ag] & ags] acc]
  (cond (nil? ag)
        acc

        (= :field type)
        (recur (inc breakout-idx) ag-idx ags (conj acc [:breakout breakout-idx]))

        :else
        (recur breakout-idx (inc ag-idx) ags (conj acc [:aggregation ag-idx]))))

(defn- infer-ordered-clauses-for-fields
  "Add ::ordered-clauses-for-fields to `query`.
   This key is later used to preserve original column order after metric expansion. It maps original column order to
   clause in query after transformation."
  [query]
  (let [clauses-from-orig-breakout (mapv #(vector :breakout %) (range (count (:breakout query))))
        orig-breakout-count (count clauses-from-orig-breakout)]
    (assoc query ::ordered-clauses-for-fields 
           (ordered-clauses-for-fields orig-breakout-count 0 (:aggregation query) clauses-from-orig-breakout))))

(defn- move-ag-fields-to-breakout
  "Move fields, which are currently in :aggregation and are result of [[swap-metric-clauses]], into :breakout."
  [query]
  (let [{:keys [aggregation breakout]}
        (group-by (fn [[type]]
                    (if (= :field type) :breakout :aggregation))
                  (:aggregation query))]
    (cond-> query
      (seq aggregation) (assoc :aggregation aggregation)
      (empty? aggregation) (dissoc :aggregation)
      (seq breakout) (update :breakout #(into (vec %1) %2) breakout))))

(defn- update-order-by-ag-refs
  "`:order-by` contains references to aggregations, breakout or expressions. Metric expansion could cause some
   aggregations becoming breakout fields. This function ensures aggregation indices in order by clause are updated
   accordingly."
  [{breakout :breakout
    ordered-clauses-for-fields ::ordered-clauses-for-fields
    :as query}]
  (assert (and (vector? ordered-clauses-for-fields)
               (seq ordered-clauses-for-fields))
    "Expected not empty vector of `ordered-clauses-for-fields`.")
  (let [original-ag-index->clause-ref (subvec ordered-clauses-for-fields (count breakout))]
    (mbql.u/replace-in query [:order-by]
      [:aggregation idx]
      (original-ag-index->clause-ref idx))))

(defn- metric-infos->metrics-queries
  "Transforms metric infos into metrics query. Groupping (partitioning in practice) of metrics is further described
   in namespace docstring, section [# Metrics and filters or segments]."
  [original-query metric-infos]
  (->> metric-infos
       (map (partial expand-and-combine-filters original-query))
       (sort-by (comp :filter :definition))
       (partition-by (comp :filter :definition))
       (mapv (partial metrics-query original-query))))

;;;; TODO: mutually recursive metrics definition guard!
;;;; TODO: Robust expressions handling!
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
          (swap-metric-clauses)
          (dissoc ::metric-id->field)
          (infer-ordered-clauses-for-fields)
          (update-order-by-ag-refs)
          (move-ag-fields-to-breakout)))
    query))

(defn- clause-ref->field
  "Transform clause reference of format [type index] to field usable in wrapping query."
  [{:keys [breakout] :as query} metadatas [clause-type index :as clause-ref]]
  (clause->field (get-in query clause-ref) (metadatas (+ index (case clause-type
                                                                 :aggregation (count breakout)
                                                                 0)))))

(defn- maybe-wrap-in-ordering-query
  ;;;; TODO: doc!
  [{ordered-clauses-for-fields ::ordered-clauses-for-fields :as inner-query}]
  (if (some? ordered-clauses-for-fields)
    (let [inner-query* (dissoc inner-query ::ordered-clauses-for-fields)
          metadatas (mbql-query->metadata inner-query*)]
      {:fields (mapv (partial clause-ref->field inner-query* metadatas) ordered-clauses-for-fields)
       :source-query inner-query*
       :source-metadata metadatas})
    inner-query))

(mu/defn expand-metrics :- mbql.s/Query
  ;;;; TODO: Proper docstring!
  "Expand metric macros. Expects expanded segments. If query contained metrics and expansion occured, query is wrapped
   into ordering query. Details on that in namespace docstring.
       ;;;; TODO: Condition should probably check whether query is modified, but ignoring source-query and joins. Metircs
    ;;;;       could apper at deeper levels, but column ordering there is insignificant, as not presented to user and
    ;;;;       upper level query uses sub query's results by some identifier (ie. column name) and not by column order.
   "
  [{inner-query :query :as outer-query} :- mbql.s/Query]
  (-> outer-query
      (assoc :query (walk/postwalk
                     (fn [{:keys [source-table condition] :as form}]
                       (cond-> form
                         (and (some? source-table) (nil? condition))
                         expand-metrics*))
                     inner-query))
      (update :query maybe-wrap-in-ordering-query)))

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                                   MIDDLEWARE                                                   |
;;; +----------------------------------------------------------------------------------------------------------------+

;;;; TODO?: Factor out following function? With current, and probably upcomming state of this module, I think it is 
;;;;        redundant.
(mu/defn ^:private expand-metrics-and-segments :- mbql.s/Query
  "Expand the macros (`segment`, `metric`) in a `query`."
  [query :- mbql.s/Query]
  (-> query
      expand-segments
      expand-metrics))

(defn expand-macros
  "Middleware that looks for `:metric` and `:segment` macros in an unexpanded MBQL query and substitute the macros for
  their contents."
  [{query-type :type, :as query}]
  (if-not (= query-type :query)
    query
    (expand-metrics-and-segments query)))
