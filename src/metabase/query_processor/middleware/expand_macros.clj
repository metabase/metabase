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

(defmacro dotap> [where something]
  `(doto ~something
     (as-> $# (tap> [~where $#]))))

(comment
  (dotap "xix" (-> 1 (+ 1)))
  )

(declare remove-metrics-internals)

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

(comment
  
  (metabase.test/with-db (t2/select-one :model/Database :id 2)
    (metabase.test/with-everything-store
      (mbql-query->metadata (dissoc mbql-qq :order-by) #_mbql-qq)))
  
  mbql-qq
  (remove-metrics-internals (dissoc mbql-qq :order-by))
  )

(comment
  (metabase.test/with-db (toucan2.core/select-one :model/Database :id 2)
    (metabase.test/with-everything-store
      (mbql-query->metadata mbql-qq)))
  )

(mu/defn ^:private top-display-name
  "Get display name of aggregation that contains metric with `id`.
   When aggregation becomes field by act of joining, which is inevitable for metric queries, name of the field can
   not be further changed. To overcome that overcome that name from aggregation that contains the metric is used
   to name aggregation in [[metrics-query]]."
  [{:keys [aggregation]} :- mbql.s/MBQLQuery {:keys [id] :as _metric-info} :- MetricInfo]
  (mbql.u/match-one aggregation
    [:aggregation-options [:metric examined-id] (opts :guard (every-pred #(contains? % :display-name)
                                                                         #_#(not(contains? % ::metric))))]
    (when (= id examined-id)
      (:display-name opts))))

;;;; TODO: doc!
;;;; TODO: check correspondence with old naming logic!
(mu/defn ^:private metric-info->aggregation :- mbql.s/Aggregation
  [query :- mbql.s/MBQLQuery
   {{[ag] :aggregation} :definition id :id metric-name :name :as metric-info} :- MetricInfo]
  ;;;; TODO: aggregations that are transformed to fields should use display name of containing aggregation
  ;;;;       as field name!
  ;;;;       otherwise it does not matter...
  (let [top-display-name-x (str "metric__" id) #_(top-display-name query metric-info)]
    (-> (mbql.u/match-one ag
          [:aggregation-options _ (opts :guard :display-name)]
          (assoc-in &match [2 :name] (:display-name opts))

          [:aggregation-options _ _]
          (update &match 2 assoc
                  :name metric-name
                  :display-name metric-name)

          _
          [:aggregation-options &match {:display-name metric-name :name metric-name}])
        #_(update 2 m/assoc-some :display-name top-display-name-x :name top-display-name-x)
        (update 2 assoc ::metric id)
        (update 2 assoc 
                ::original-display-name (top-display-name query metric-info) 
                ::original-name (top-display-name query metric-info))
        (update 2 assoc ::metric-name metric-name))))

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
          ;;;; Here I'm removing just `::ordered-clauses-for-fields`, because other internal metrics keys will be needed
          ;;;;   This key is of use only on top level call to expand-metrics, ie. in [[expand-metrics]]
          (dissoc ::ordered-clauses-for-fields)))))

;;;; TODO: Shouldn't I try-catch here?
(defn- query->join-alias [query]
  (->> query :filter hash Integer/toHexString (str "metric__")))

;;;; TODO: Is naming of the field correct?, also check for [[top-display-name]].
(defn- metadata->field
  [{base-type :base_type
    name :name
    display-name :display_name}]
  #_[:field (or name display-name) {:base-type base-type}]
  (update [:field (or name display-name) {:base-type base-type}] 2
            m/assoc-some :display-name display-name))

(defn- clause-with-metric-opt? [form]
  (and (vector? form)
       (= 3 (count form))
       (contains? (form 2) ::metric)))

(def ^:private metric-field-opts-keys #{::metric ::metric-name})

(defn- metric-field-opt [form]
    (when (clause-with-metric-opt? form)
      (::metric (form 2))))

(defn- metric-field-opts [form]
  (when (clause-with-metric-opt? form)
    (doto (select-keys (nth form 2) metric-field-opts-keys)
      (as-> $ (tap> ["metric-field-opt result" $])))))

(defn- clause->field
  "Transform `clause` of some source-query to field usable in joining or parent query.
   Conveys ::metric field option of aggregation and field, so fields are usable in [[provides]]"
  [[clause-type :as clause] metadata]
  (doto (case clause-type
          :field clause
          (update (metadata->field metadata) 2 merge (doto (metric-field-opts clause)
                                                       (as-> $ (tap> ["mfo" $]))))
          #_(update (metadata->field metadata) 2 m/assoc-some ::metric (doto (metric-field-opt clause)
                                                              (as-> $ (tap> ["mfo" $])))))
    (as-> $ (tap> ["clause->field result" $]))))

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
    ;;;; TODO: condp -> case?
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

;;;; This also does not work if I consider multiple aggregations pointing to metric
(defn- provides
  "Generate mapping of metric id to field.
   Takes breakout and aggregation of query. Further checks which of those clauses contain `::metric` key in options.
   Presence of that key signals that clause represents column for some metric. Clauses from aggregations are
   transformed to fields. `::annotate/avoid-display-name-prefix?` ensures that annotate middleware won't prefix
   display name with join alias. That is not desired for fields comming from metrics, because they come from internal
   joins."
  [{:keys [breakout aggregation] :as _metrics-query} metadatas join-alias]
  (let [fields-from-ags (doto (map clause->field aggregation (subvec metadatas (count breakout)))
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

;;;; TODO: I think here could be a problem.
;;;; This must be reworked! Case where there are 2 aggregations that contain only metric and that metric is the same.
;;;; Metric must be computed twice. Which looks silly, but right now I'm unable to come up with better way to handle
;;;; that.
;;;;
;;;; Maybe if I used expression with metrics resulting field as "just field". But than probably, there is another
;;;;   problem -- 
;; follo is wrong!!! like all wrong!
;;
;; try with renaming first!
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
  ;;;; does this actually do the right thing?
  ;;;; i'm swapping metric in aggregation
  ;;;; but there can be aggregation options
  ;;;;
  ;;;; testcase for that!
  (dotap> "swap-ag-for-field" ag)
  (dotap> "swap-ag-for-field result"
          (mbql.u/match-one ag
                            [:aggregation-options [:metric metric-id] opts]
                            (update (metric-id->field metric-id) 2
                                    m/assoc-some
                                    ::metric (metric-field-opt ag)
                                    ::original-display-name (:display-name opts)
                                    ::original-name (:name opts))

                            [:metric swapped-metric-id]
                            (update (metric-id->field swapped-metric-id) 2
                                    m/assoc-some ::metric (metric-field-opt ag)))))

(comment
  #_(mbql.u/match-one [:aggregation-options [:metric 43] {:name "First one", :display-name "First one"}]
                    [:metric swapped-metric-id]
                    "kokocit"
                    #_(update (metric-id->field swapped-metric-id) 2
                            m/assoc-some ::metric (metric-field-opt ag) ::original-name))
  )

;; TODO: be consistent with returns, true or false!
(defn- one-and-only-metric?
  "Determine if aggregation consists of one and only metric, hence will later be swapped for a field and moved
   to breakout during transformation of a query containing metrics."
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
  (tap> ["swap-metric-clauses-in-aggregation" query ag])
  (doto (if (one-and-only-metric? ag)
          #_(let [] (swap-ag-for-field ag (::metric-id->field query)))
          (swap-ag-for-field ag (::metric-id->field query))
          (mbql.u/replace ag [:metric id] (get-in query [::metric-id->field id])))
    (as-> $ (tap> ["swap-metric-clauses-in-aggregation result" $]))))

(comment
  
  ;;;; TODO names! how!

  (keys (get-in qwq [::metric-id->field]))
  (def qwq {:source-table 9,
            :breakout [[:field 85 {:base-type :type/Integer}]],
            :filter [:> [:field 85 nil] 20],
            :aggregation
            [[:aggregation-options
              [:/ [:metric 4] [:metric 5]]
              {:name "metric__6",
               :display-name "metric__6",
               :metabase.query-processor.middleware.expand-macros/metric 6,
               :metabase.query-processor.middleware.expand-macros/original-display-name nil,
               :metabase.query-processor.middleware.expand-macros/original-name nil,
               :metabase.query-processor.middleware.expand-macros/metric-name
               "venues, count metric div sum metric, cat id gt 30"}]],
            :joins
            [{:alias "metric__f2a8054d",
              :strategy :left-join,
              :condition
              [:=
               [:field 85 {:base-type :type/Integer}]
               [:field 85 {:base-type :type/Integer, :join-alias "metric__f2a8054d"}]],
              :source-query
              {:source-table 9,
               :filter [:> [:field 85 nil] 20],
               :breakout [[:field 85 {:base-type :type/Integer}]],
               :aggregation
               [[:aggregation-options
                 [:count]
                 {:display-name "metric__4",
                  :name "metric__4",
                  :metabase.query-processor.middleware.expand-macros/metric 4,
                  :metabase.query-processor.middleware.expand-macros/original-display-name nil,
                  :metabase.query-processor.middleware.expand-macros/original-name nil,
                  :metabase.query-processor.middleware.expand-macros/metric-name "venues, count"}]]},
              :source-metadata
              [{:semantic_type :type/FK,
                :table_id 9,
                :coercion_strategy nil,
                :name "CATEGORY_ID",
                :settings nil,
                :field_ref [:field 85 {:base-type :type/Integer}],
                :effective_type :type/Integer,
                :nfc_path nil,
                :parent_id nil,
                :id 85,
                :display_name "Category ID",
                :fingerprint {:global {:distinct-count 28, :nil% 0.0}},
                :base_type :type/Integer}
               {:name "metric__4",
                :display_name "metric__4",
                :base_type :type/Integer,
                :semantic_type :type/Quantity,
                :field_ref [:aggregation 0]}],
              :fields :all}
             {:alias "metric__dbe80f1b",
              :strategy :left-join,
              :condition
              [:=
               [:field 85 {:base-type :type/Integer}]
               [:field 85 {:base-type :type/Integer, :join-alias "metric__dbe80f1b"}]],
              :source-query
              {:source-table 9,
               :filter [:and [:> [:field 85 nil] 20] [:< [:field 85 nil] 50]],
               :breakout [[:field 85 {:base-type :type/Integer}]],
               :aggregation
               [[:aggregation-options
                 [:sum [:field 84 nil]]
                 {:display-name "metric__5",
                  :name "metric__5",
                  :metabase.query-processor.middleware.expand-macros/metric 5,
                  :metabase.query-processor.middleware.expand-macros/original-display-name nil,
                  :metabase.query-processor.middleware.expand-macros/original-name nil,
                  :metabase.query-processor.middleware.expand-macros/metric-name "venues, sum price, cat id lt 50"}]]},
              :source-metadata
              [{:semantic_type :type/FK,
                :table_id 9,
                :coercion_strategy nil,
                :name "CATEGORY_ID",
                :settings nil,
                :field_ref [:field 85 {:base-type :type/Integer}],
                :effective_type :type/Integer,
                :nfc_path nil,
                :parent_id nil,
                :id 85,
                :display_name "Category ID",
                :fingerprint {:global {:distinct-count 28, :nil% 0.0}},
                :base_type :type/Integer}
               {:name "metric__5",
                :display_name "metric__5",
                :base_type :type/Integer,
                :settings nil,
                :field_ref [:aggregation 0]}],
              :fields :all}],
            :metabase.query-processor.middleware.expand-macros/metric-id->field
            {#:metabase.query-processor.middleware.expand-macros{:metric 4}
             [:field
              "metric__4"
              {:base-type :type/Integer,
               :display-name "metric__4",
               :metabase.query-processor.middleware.expand-macros/metric 4,
               :join-alias "metric__f2a8054d",
               :metabase.query-processor.middleware.annotate/avoid-display-name-prefix? true}],
             #:metabase.query-processor.middleware.expand-macros{:metric 5}
             [:field
              "metric__5"
              {:base-type :type/Integer,
               :display-name "metric__5",
               :metabase.query-processor.middleware.expand-macros/metric 5,
               :join-alias "metric__dbe80f1b",
               :metabase.query-processor.middleware.annotate/avoid-display-name-prefix? true}]},
            :metabase.query-processor.middleware.expand-macros/original-breakout-count 1,
            :metabase.query-processor.middleware.expand-macros/ordered-clauses-for-fields [[:breakout 0] [:aggregation 0]]})
            )

(defn- construct-expression-name
  [])

;;;; There are multiple cases to consider
;;;; 1. ag opts with display-name
;;;; 2. ag opts with name
;;;; 3. unnamed ag containing metric
;;;; 4. unnamed ag containing expression with metric/s
;;
 ;; Right now i expect to be all data necessary for name generation
  ;; stored field options!
  ;; This needs either original stuff or metric name
  ;; code original stuff only first
(defn- name-for-field
  [existing-expression-names field]
  (def fff field)
  (let [opts (get field 2)
        ;; currently considering only
        original-name-for-field (or (::original-display-name opts)
                                    (::original-name opts)
                                    (::metric-name opts)
                                    "kokocit" ;; tmp
                                    (throw (ex-info (tru "Unable to choose name for field.")
                                                    {:type qp.error-type/invalid-query
                                                     :field field})))
        name-already-taken? (some #(re-matches (re-pattern (str "\\Q" original-name-for-field "\\E")) %)
                                  existing-expression-names)]
    (if-not name-already-taken?
      original-name-for-field
      (let [similar-names @(def sns (keep #(re-find (re-pattern (str "\\Q" original-name-for-field "\\E \\((\\d+)\\)")) %)
                                          existing-expression-names))
            highest-index (try (apply max (map (fn [[_ index-str]] (Integer/parseInt index-str))
                                               similar-names))
                               (catch Throwable _
                                 0))
            new-index (inc highest-index)]
        (str original-name-for-field " (" new-index ")")))))

(comment
  
  (re-find (re-pattern (str "\\Q" original-name-for-field "\\E \\((d+)\\)")) "xixi (1)")
  (re-find (re-pattern (str "\\Q" original-name-for-field "\\E \\((\\d+)\\)")) "xixi (1)")

  sns
  (def original-name-for-field "xixi")
  (def existing-expression-names ["xixi" "xixi (1)" "ix"])
  (keep #(re-find (re-pattern (str "\\Q" original-name-for-field "\\E \\((d+)\\)")) %)
        existing-expression-names)
  (name-for-field ["xixi" "xixi (1)" "ix"] [:field "metric-1000" {:base-type :type/Integer
                                                       ::original-display-name "xixi"
                                                       ::original-name "First one"}])
  )

(comment
  (key-for)
  )

(defn- not-empty-or-some? [x]
  (or (and (coll? x)
           (not-empty x))
      (some? x)))

(defn- empty-or-nil? [x]
  (or (and (coll? x)
           (empty? x))
      (nil? x)))

;;;; update-dissoc makes more sense
(defn- update-some [m k f & args]
  (let [x (apply f (get m k) args)]
    (def xxx x)
    (if (empty-or-nil? x)
      m
      (assoc m k x))))

u/assoc-dissoc
#_(defn assoc-or-dissoc [m k v]
  )

;;;; First I'm considering that aggregations will be modified to fields
(defn- add-fields-from-aggregations-to-expressions
  [query]
  (let [expressions (:expressions query)
        expr-keys (keys expressions)
        ags (:aggregation query)
        {:keys [fields aggregations]} (group-by #(if (= :field (first %)) :fields :aggregations) ags)
        ;; follwoing should go reduce!
        expressions-kv-pairs (:name->field-kv-pairs
                              (reduce (fn [{used-names :used-names :as acc} [:as field]]
                                        (let [new-name (name-for-field used-names field)]
                                          (-> acc
                                              (update :used-names conj new-name)
                                              (update :name->field-kv-pairs conj [new-name field]))))
                                      {:used-names (set expr-keys)
                                       :name->field-kv-pairs []}
                                      fields))
        new-expressions (into {} expressions-kv-pairs)]
    @(def eee (-> query
                  (u/assoc-dissoc :aggregation (not-empty (vec aggregations)))
                  (update :expressions merge new-expressions)
                  (update :breakout into (map #(vector :expression (first %))) expressions-kv-pairs)))))

(comment
  (def qq {:expressions {"xixi" 1}
           :aggregation [[:aggregation-options [:sum [:field "price" {:base-type :type/Integer}]] {:display-name "ahoj"}]
                         [:field "metric-1000" {::original-display-name "xixi"
                                                ::original-name "helou"}]]
           :breakout [[:field "category" {:base-type :type/String}]]})
  (add-fields-from-aggregations-to-expressions qq)
  )

(defn- swap-metric-clauses
  "Swap metric clauses in aggregation clauses of `query`. For details refer to [[swap-metric-clauses-in-aggregation]].
   It is guaranteed that :aggregations are not empty, because this functions is to be called only on query, that
   contains metric clauses, hence aggregations."
  [query]
  (let [with-swapped (update query :aggregation (partial mapv #(swap-metric-clauses-in-aggregation query %)))]
    ;;;; this is bleh -- probably right!
    (-> with-swapped
        add-fields-from-aggregations-to-expressions)))


(comment
  (re-find (re-pattern (str "\\Q" "kokocit" "\\E (\\(\\d+\\))")) "kokocit (1)")
  (re-find (re-pattern (str "\\Q" "kokocit" "\\E (\\(\\d+\\))")) "kokocit (1)")
  )

(defn- ordered-clauses-for-fields
  "At this point of transformation `:aggregations` contain aggregation clauses or field clauses, which are result of
   [[swap-metric-clauses]]. Field clauses will be moved later to breakout. Result of this function is vector, where
   index is original query column index and value is reference to clause that represents that column after
   query transformation. Resulting map is later used by [[maybe-wrap-in-ordering-query]]."
  [breakout-idx ag-idx [[_type :as ag] & ags] acc]
  (cond (nil? ag)
        acc

        ;; here I could use one and only metric
        (one-and-only-metric? ag)
        #_(= :field type)
        (recur (inc breakout-idx) ag-idx ags (conj acc [:breakout breakout-idx]))

        :else
        (recur breakout-idx (inc ag-idx) ags (conj acc [:aggregation ag-idx]))))

;; this is fine, but that other stuff should not use this
(defn- infer-ordered-clauses-for-fields
  "Add ::ordered-clauses-for-fields to `query`.
   This key is later used to preserve original column order after metric expansion. It maps original column order to
   clause in query after transformation. This function is expected to be called prior to
   [[move-ag-fields-to-breakout]], so query has still its breakout unmodified."
  [{:keys [breakout] :as query}]
  (let [orig-breakout-count (count breakout)
        clauses-from-orig-breakout (mapv #(vector :breakout %) (range orig-breakout-count))]
    (assoc query ::ordered-clauses-for-fields
           (ordered-clauses-for-fields orig-breakout-count 0 (:aggregation query) clauses-from-orig-breakout))))

#_(defn- move-ag-fields-to-breakout
  "Move fields, which are currently in :aggregation and are result of [[swap-metric-clauses]], into :breakout."
  [query]
  ;;;; This is also no good!
  #_(dotap> "move-ag-fields-to-breakout" query)
  
  (let [{:keys [aggregation breakout]}
        (group-by (fn [[type]]
                    (if (= :field type) :breakout :aggregation))
                  (:aggregation query))]
  
    (cond-> query
      (seq aggregation) (assoc :aggregation aggregation)
      (empty? aggregation) (dissoc :aggregation)
      (seq breakout) (-> (update :breakout #(into (vec %1) %2) breakout)))))

;;;; TODO: Do I have breakout done at this point? I mean, ready to just copy?
(defn- this-is-temporary [query [clause-type clause-index :as clause-ref]]
  (case clause-type
    :breakout (get-in query clause-ref)
    clause-ref))

(defn- update-order-by-ag-refs
  ;;;; TODO: my precondition is wrong here!
  ;;;;         allowed values = fields, aggregation references, expression references!
  "`:order-by` contains references to aggregations, breakout or expressions. Metric expansion could cause some
   aggregations becoming breakout fields. This function ensures aggregation indices in order by clause are updated
   accordingly."
  [{breakout :breakout
    ;;;; ordered clauses for fields are not usable here...
    ordered-clauses-for-fields ::ordered-clauses-for-fields
    :as query}]
  (def uo-query query)
  (assert (and (vector? ordered-clauses-for-fields)
               (seq ordered-clauses-for-fields))
    "Expected not empty vector of `ordered-clauses-for-fields`.")
  ;;;; this also sets "[:breakout 1] -- but for that, there should be direct reference!"
  (let [original-ag-index->clause-ref (subvec ordered-clauses-for-fields (::original-breakout-count query))]
    (mbql.u/replace-in query [:order-by]
                       [:aggregation idx]
                       #_(original-ag-index->clause-ref idx)
                       (this-is-temporary query (original-ag-index->clause-ref idx))))
  )



(defn- metric-infos->metrics-queries
  "Transforms metric infos into metrics query. Groupping (partitioning in practice) of metrics is further described
   in namespace docstring, section [# Metrics and filters or segments]."
  [original-query metric-infos]
  (->> metric-infos
       (map (partial expand-and-combine-filters original-query))
       (sort-by (comp :filter :definition))
       (partition-by (comp :filter :definition))
       
       (mapv (partial metrics-query original-query))))

(defn- swap-breakout [query]
  (mbql.u/replace-in query [:order-by]
                     [:breakout index]
                     (get-in query [:breakout index])))

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
  ;;;; TODO: Why it does not make sense to check for unexpanded in source-query?
  ;;;;       Because metrics are associated to specific table. And should not be used with queries containing
  ;;;;       `:source-query`.
  (assert (empty? (metrics (:joins query))) "Joins contain unexpanded metrics.")
  (if-let [metric-infos (metrics! query)]
    (let [with-joined-metrics-queries (->> metric-infos
                                           (metric-infos->metrics-queries query)
                                           (reduce join-metrics-query query))]
      (-> with-joined-metrics-queries
          (assoc ::original-breakout-count (count (:breakout query)))
          (infer-ordered-clauses-for-fields)
          (swap-metric-clauses)
          ;;;; this is just noise and does not have to be here
          (dissoc ::metric-id->field)
          ;;;; THIS MUST COME AFTER MOVE...
          (update-order-by-ag-refs)
          
          #_(move-ag-fields-to-breakout)
          
          #_(swap-breakout)

          #_(doto (as-> $ (def xix $)))
          ))
    query))

(defn- clause-ref->field
  "Transform clause reference of format [type index] to field usable in wrapping query."
  [{:keys [breakout] :as query} metadatas [clause-type index :as clause-ref]]
  (clause->field (get-in query clause-ref) (metadatas (+ index (case clause-type
                                                                 :aggregation (count breakout)
                                                                 0)))))

(defn- maybe-wrap-in-ordering-query
  ;;;; TODO: doc!
  "Wrap query that previously contained metrics aggregations and was transformed by [[expand-metrics*]] into ordering
   query. Order of fields can change [[expand-metrics*]]"
  [{ordered-clauses-for-fields ::ordered-clauses-for-fields :as inner-query}]
  (def iqiq inner-query)
  (if (some? ordered-clauses-for-fields)
    (let [inner-query* @(def iiqq (dissoc inner-query ::ordered-clauses-for-fields))
          metadatas (mbql-query->metadata inner-query*)]
      {:fields (mapv (partial clause-ref->field inner-query* metadatas) ordered-clauses-for-fields)
       :source-query inner-query*
       :source-metadata metadatas})
    inner-query))

;;;; TODO: add test!
(defn- remove-metrics-internals [query]
  (walk/postwalk
   (fn [form]
     (if (map? form)
       (dissoc form ::metric ::metric-id->field ::ordered-clauses-for-fields
               ::original-breakout-count ::original-display-name ::original-name ::metric-name)
       form))
   query))



;;;; TODO: Add something like `remove-metric-internals`. That's necessary because if there are some metrics
;;;;       expanded in deeper levels of query either in joins or source query, no wrapping occurs and queries
;;;;       are left with ::ordered-clauses-for-fields set.
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
      ;;;; TODO: Wrap in ordering query should be perfomed only if THIS query (ie. not queries from `:source-query`
      ;;;;       chain) was modified
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
  (dotap> "expand-metrics-and-segments query" query)
  #_(dotap> "expand-metrics-and-segments RESULT"
          (-> query
              expand-segments
              expand-metrics))
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
