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
   [metabase.mbql.predicates :as mbql.preds]
   [metabase.mbql.schema :as mbql.s]
   [metabase.mbql.schema.helpers :as helpers]
   [metabase.mbql.util :as mbql.u]
   [metabase.query-processor.error-type :as qp.error-type]
   [metabase.query-processor.middleware.add-source-metadata :as qp.add-source-metadata]
   [metabase.query-processor.middleware.annotate :as annotate]
   [metabase.query-processor.store :as qp.store]
   [metabase.util :as u]
   [metabase.util.i18n :refer [trs tru]]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu]
   [metabase.util.malli.registry :as mr]
   [metabase.util.malli.schema :as ms]
   ;;;;tmp
   [toucan2.core :as t2]
   ))

(set! *warn-on-reflection* true)

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                                    SEGMENTS                                                    |
;;; +----------------------------------------------------------------------------------------------------------------+

(defn- segment-clauses->id->definition [segment-clauses]
  (when-let [segment-ids (not-empty (into #{}
                                          (comp (map second)
                                                (filter integer?))
                                          segment-clauses))]
    (into {}
          (map (juxt :id :definition))
          (qp.store/bulk-metadata :metadata/segment segment-ids))))

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
  (when-let [metric-ids (not-empty (into #{} (map second) metric-clauses))]
    (into {}
          (comp (remove (fn [metric]
                          (when-let [errors (metric-info-validation-errors metric)]
                            (log/warn (trs "Invalid metric: {0} reason: {1}" metric errors))
                            errors)))
                (map (juxt :id #(select-keys % [:id :name :definition]))))
          (qp.store/bulk-metadata :metadata/metric metric-ids))))

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

;;;; OK
(defn- remove-metrics-internals [query]
  (walk/postwalk
   (fn [form]
     (if (map? form)
       (dissoc form ::metric-id ::metric-id->field ::ordered-clause-refs-for-fields
               ::original-breakout-count ::metric-name ::name ::display-name)
       form))
   query))

;;;; OK
(defn- mbql-query->metadata
  [query]
  (def mbql-qq query)
  (let [metadata (vec (qp.add-source-metadata/mbql-source-query->metadata 
                       (remove-metrics-internals query)))]
    (if (seq metadata)
      metadata
      (throw (ex-info "Expected not-empty metadata."
                      {:type qp.error-type/invalid-query
                       :query query
                       :metadata metadata})))))

(comment
  mbql-qq
  )

;;;; OK
(defn- hash-hex-str
  [hashable]
  (->> hashable hash Integer/toHexString))

;;;; OK
(mu/defn ^:private metric-info->aggregation :- mbql.s/Aggregation
  "Generate aggregation from `metric-info` to be used by [[metrics-query]].
   Aggregation has a form of :aggregation-options with :display-name and :name set to name of the metric. This way
   the metric name is respected, if the metric was used in an unnamed aggregation in the original query."
  [{{[ag] :aggregation} :definition id :id name :name :as _metric-info} :- MetricInfo]
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

(def ^:private metrics-query-keys
  "Keys that are copied from original query into metrics query.
   `:source-table`, `:joins and `:filter` impact source data before aggregation. `:breakout` is also same as in
   original query. `:breakout` or `:filter` could also contain expressions, so those are included too. `:source-query`
   is ignored as metic is bound to specific table."
  [:source-table :joins :filter :breakout :expressions])

(declare expand-metrics*)

;;;; OK
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
      (expand-metrics* metrics-query-expanded-this-level))))

;;;; OK
(defn- query->join-alias [query]
  (->> query :filter hash-hex-str (str "metric__")))

;;;; OK
(defn- clause->field
  "Return field that respresents some `clause` that is contained in `query`. Field could be used for reference to
   a source-query or joining query."
  [query [type :as clause] {base-type :base_type name :name :as _metadata}]
  (def xq [query clause _metadata])
  (case type
    :field clause
    :expression (let [expr-name (second clause)
                      expr-opts (case (count clause) 3 (nth clause 2) nil)
                      [expr-type :as expr-val] (get-in query [:expressions expr-name])]
                  ;;;; TODO: hack it here, expression stuff should get it's metric it is coming from
                  (case expr-type
                    ;;;; Field stored in expression could contain precious field opts as eg. id of a metric
                    ;;;; it represents.
                    :field [:field expr-name (assoc (get expr-val 2) :base-type base-type)]
                    [:field expr-name (merge expr-opts {:base-type base-type})]))
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

;;;; OK
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

;;;; OK
(defn- metrics-query-provides
  "Returns map of metric-id->field. `query` should be a result of [[metrics-query]] that supposed to be joined to
   query originally containing metrics."
  [{:keys [breakout aggregation] :as query} metadatas]
  ;;;; If the query (aka metrics-query) contained metric defined using other metrics it would go through
  ;;;; [[expand-metrics*]] and possibly could have breakout modified, hence probing ::original-breakout-count first.
  (let [original-breakout-count (or (::original-breakout-count query) (count breakout))
        fields (map (partial clause->field query)
                    (into (subvec (vec breakout) original-breakout-count)
                          aggregation)
                    (subvec metadatas original-breakout-count))]
    (m/index-by #(get-in % [2 ::metric-id]) fields)))

;;;; OK
(defn- join-metrics-query
  "Joins [[metrics-query]] into original query.
   Sets `::metric-id->field` which is later used during original query transformation, in [[swap-metric-clauses]]."
  [query metrics-query]
  (let [{:keys [alias source-metadata source-query] :as join} (metrics-join query metrics-query)
        metric-id->field (-> (metrics-query-provides source-query source-metadata)
                             (update-vals #(update % 2 assoc
                                                   :join-alias alias
                                                   ::annotate/avoid-display-name-prefix? true)))]
    (-> query
        (update :joins #(conj (vec %1) %2) join)
        (update ::metric-id->field merge metric-id->field))))

;;;; OK
(mu/defn ^:private expand-and-combine-filters
  "Combines filter of original query and filter from metrics definition, expanding segments if necessary."
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
  (tap> ["metrics! args" inner-query])
  (doto (when-let [metrics-ids (not-empty (set (map second (metrics inner-query))))]
          (doto (t2/select :model/Metric :id [:in metrics-ids])
            (as-> $ (assert (= (count metrics-ids) (count $)) "Metric id and fetched metric model count mismatch."))))
    (as-> $ (tap> ["metrics! result" $]))))

;;;; OK
(defn- swap-ag-for-field
  "Swap aggregation containing one and only metric and nothing else for appropriate field.
   If the aggregation was coming from a metric its options are used to override field options. That ensures metrics
   defined using other metrics works have right id and names set."
  [ag metric-id->field]
  (mbql.u/match-one ag
                    [:aggregation-options [:metric id] opts]
                    (update (metric-id->field id) 2 m/assoc-some
                            ::metric-id (::metric-id opts)
                            ::metric-name (::metric-name opts)
                            ::name (:name opts)
                            ::display-name (:display-name opts))

                    [:metric id]
                    (metric-id->field id)))

;;;; OK
(defn- one-and-only-metric?
  "Determine if aggregation consists of one metric only, possibly wrapped in `:aggregation-options`."
  [ag]
  (boolean (mbql.u/match-one ag
             [:metric _]
             (or (empty? &parents)
                 (= [:aggregation-options] &parents)))))

;;;; OK
(defn- swap-metric-clauses-in-aggregation
  "Swap metrics clauses in aggregations of a `query` for fields comming from joined [[metrics-query]]. In case that
   aggregation contain on and only metric, whole aggregation is swapped for that field, which is later moved to
   breakout."
  [query ag]
  (tap> ["swap-metric-clauses-in-aggregation args" query ag])
  (if (one-and-only-metric? ag)
    (swap-ag-for-field ag (::metric-id->field query))
    (mbql.u/replace ag [:metric id] (get-in query [::metric-id->field id]))))

;;;; TODO: desired name for-form
;;;; OK
(defn- desired-name-for-field
  "Choose name for a field being renamed during metric aggregation to field transformation. Field can become renamed,
   when aggregation contains only one metric and aggregation options, containing name. Those are recorded in the field
   options during [[swap-metric-clauses]]. Field is expected to have at least some of the following keys set
   in its field options:
   - ::display-name from ag
   - ::name from ag
   - ::metric-name from metric.
   - special case, unnamed ag containing expression using metrics aka no aggregation is left"
  [[_ _ field-opts]]
  (tap> ["desired-name-for-field" field-opts])

  

  (or (::display-name field-opts)
      (::name field-opts)
      (::metric-name field-opts)))

;;;; OK
(defn- name-for-transformed-ag
  "Return name for a field that was result of metrics aggregation transformation."
  [used-names desired-name]
  (if-not (contains? used-names desired-name)
    desired-name
    (let [similar-pattern (re-pattern (str "(?<=\\Q" desired-name "\\E \\()\\d+(?=\\))"))
          similar-names-indices (into [] (comp (keep (partial re-find similar-pattern))
                                               (map #(Integer/parseInt %)))
                                      used-names)
          new-index (inc (apply max 0 similar-names-indices))]
      (str desired-name " (" new-index ")"))))

;;;; This will have to be made into smaller chunks, more digestable
;;;; OK
(defn- fields->renaming-map+order
  [used-names fields]
  (loop [[[_ _ field-opts :as field] & rest-fields] fields
         used-names (set used-names)
         result {:ordered-names []
                 :name->field {}}]
    (if (nil? field-opts)
      result
      (let [desired-name (desired-name-for-field field)
            new-name (name-for-transformed-ag used-names desired-name)]
        (recur rest-fields
               (conj used-names new-name)
               (-> result
                   (update :ordered-names conj new-name)
                   (assoc-in [:name->field new-name] field)))))))

(def ^{:arglists '([ag-clause])} AggregationFn?
  "Is this a valid Aggregation clause?"
  (mr/validator mbql.s/AggregationFn))

(comment
  (contains-aggregate?-walk-wrong [:count])
  (contains-aggregate?-walk-wrong [:aggregation-options [:/ [:sum [:field 10 nil]] 1]])
  (contains-aggregate?-walk-wrong [:aggregation-options [:/ [:field 10 nil] 1]])
  (contains-aggregate?-walk-wrong [:aggregation-options [:/ 1]])

  (tree-seq vector? identity [:aggregation-options [:/ [:sum [:field 10 nil]] 1]])
  )

(comment
  (reduce (fn [acc x] (or acc (AggregationFn? x)))
          false
          (tree-seq vector? identity [:aggregation-options [:/ [:sum [:field 10 nil]] 1]]))
  
  (contains-aggregate? [:aggregation-options [:/ [:sum [:field 10 nil]] 1]])
  ;;; why this does not work?
  (contains-aggregate? [:aggregation-options [:sum [:field 10 nil]] {:name "x"}])
  ;;;;
  (contains-aggregate? [:aggregation-options [:/ [:field 10 nil] [:field 10 nil]] {:name "x"}])
  (contains-aggregate? [:aggregation-options [:/ [:field 10 nil] [:avg [:field 10 nil]]] {:name "x"}])
  
  )

(comment
            ;;;; for some reason this is valid aggregation (numeric functions!)
  (mbql.preds/Aggregation? [:/ [:field 10 nil] [:field 10 nil]])
            ;;;; but this isn't
  (mbql.preds/Aggregation? [:/ [:field 10 nil]])
            ;;;; but following is!!!
  (mbql.preds/Aggregation? [:distinct [:field 10 nil]])
  (mbql.preds/Aggregation? [:distinct [:field 10 nil]])
  (mbql.preds/Aggregation? [:distinct [:/ [:field 10 nil] [:field 10 nil]]]))

(defn- contains-aggregate? [form]
  #_(reduce (fn [acc x] (or acc (AggregationFn? x)))
          false
          (tree-seq vector? identity form))
  (boolean (some AggregationFn? (tree-seq vector? seq form))))

;;;; OK
(defn- swap-metric-clauses
  "Swap metric clauses in query originally containing them. Metrics columns were computed in [[metrics-query]] and
   joined into query being transformed by [[join-metrics-query]]. Aggregation that contains only one metric and nothing
   else becomes a field, that is moved to breakout. Fields like that are wrapped in expressions. This way their name
   can be changed to reflect name in aggregation options."
  [{:keys [aggregation expressions breakout] :as query}]
  (tap> ["swap-metric-clauses args" query])
  (let [swapped-ags (doto (map (partial swap-metric-clauses-in-aggregation query) aggregation)
                      (as-> $ (tap> ["xixix" $])))
        #_#_original-names @(def nnn (mapv (partial annotate/aggregation-name query) aggregation))
        ;;;; TODO: this should be modified! Ensure that breakout is added also for aggregation containing just metrics
        ;;;;       when there is no breakout in place! aka we need breakout for joined fields
        
        ;;;; bind the names to aggregations -- or rather will hardcode the expression name...
        _ nil

        {:keys [remaining-ags fields-from-ags]}
        (group-by (fn [[type]] (case type :field :fields-from-ags :remaining-ags)) swapped-ags)
        
        ;;; tmp
        #_#_{:keys [still-valid-ags becoming-expressions]}
        @(def ggg (group-by #(if contains-aggregate? :still-valid-ags :becoming-expressions) swapped-ags))

        ;;;; CONTINUE HERE!
        {:keys [ordered-names name->field]}
        (fields->renaming-map+order (keys expressions) fields-from-ags)
        ordered-expression-references (mapv (partial vector :expression) ordered-names)]
    (-> query
        (u/assoc-dissoc :aggregation (not-empty (vec remaining-ags)))
        (m/assoc-some :expressions (not-empty (merge expressions name->field)))
        (m/assoc-some :breakout (not-empty (into (vec breakout) ordered-expression-references))))))

(defn- swap-metric-clauses-in-aggregation-info
  [query {:keys [desired-name-source aggregation] :as aggregation-info}]
  ;;; haaaack here! if just field stays, check the metrics name and if default, swap for default
  ;;; this must be refac when working
  (tap> ["swap-metric-clauses-in-aggrgation-info" query aggregation-info])
  (let [[type :as transformed-aggregation] (swap-metric-clauses-in-aggregation query aggregation)
        new-desired-name (when (and (= :field type) (= :default desired-name-source))
                           (get-in transformed-aggregation [2 ::metric-name]))]
    (cond-> (assoc aggregation-info :transformed-aggregation transformed-aggregation)
      (some? new-desired-name) (assoc :desired-name new-desired-name
                                      :desired-name-source :metric-name))
    ))

(defn- aggregation->aggregation-info [query original-index ag]
  (tap> ["aggregation->aggregation-info args" query original-index ag])
  (let [name (mbql.u/match-one ag
               [:aggregation-options _ opts]
               (:display-name opts))]
    (cond-> {:desired-name (annotate/aggregation-name query ag)
             :desired-name-source :default
             :original-index original-index
             :aggregation ag}
      (some? name) (assoc :desired-name name
                          :desired-name-source :aggregation-options))))

;;;; currently ignoring if names for aggregation and to be expression are equal
;;;; solves only if transformed names would be same... aka no 2 same key expressions!
(defn- add-new-name-to-aggregation-info-reducer
  [{:keys [used-names] :as acc} {:keys [transformed-aggregation desired-name] :as aggregation-info}]
  (if (contains-aggregate? transformed-aggregation)
    (update acc :results conj aggregation-info)
    (let [final-name (name-for-transformed-ag used-names desired-name)
          agi-with-final-name (assoc aggregation-info :final-name final-name)]
      (-> acc
          (update :used-names conj final-name)
          (update :results conj agi-with-final-name)))))

(defn- add-final-names-to-aggregation-infos
  [{:keys [expressions]} agis]
  (:results (reduce add-new-name-to-aggregation-info-reducer
                     {:used-names (set (keys expressions))
                      :results []}
                     agis)))

(defn- maybe-add-expression-to-aggregation-info
  [{:keys [final-name transformed-aggregation] :as aggregation-info}]
  (if-not (some? final-name)
    aggregation-info
    (let [expr-opts (not-empty (mbql.u/match-one transformed-aggregation [:aggregation-options ag opts] opts))
          expression (mbql.u/match-one transformed-aggregation
                       [:aggregation-options ag _]
                       ag

                       _
                       &match)]
      (-> aggregation-info
          (assoc :expression expression)
          (m/assoc-some :expression-options expr-opts)))))

(defn- aggregation-info->breakout-element???
  [{:keys [aggregation transformed-aggregation] :as _aggregation-info}]
  (not (contains-aggregate? transformed-aggregation)))

(defn- swap-metric-clauses--incl-exprs
  "Swap metric clauses in query originally containing them. Metrics columns were computed in [[metrics-query]] and
   joined into query being transformed by [[join-metrics-query]]. Aggregation that contains only one metric and nothing
   else becomes a field, that is moved to breakout. Fields like that are wrapped in expressions. This way their name
   can be changed to reflect name in aggregation options."
  [{:keys [aggregation expressions breakout] :as query}]
  #_(tap> ["swap-metric-clauses args" query])
  (let [aggregation-infos (map-indexed (partial aggregation->aggregation-info query) aggregation)
        agis-transformed (map (partial swap-metric-clauses-in-aggregation-info query) aggregation-infos)
        agis-names-added (add-final-names-to-aggregation-infos query agis-transformed)
        agis-exprs-added (map maybe-add-expression-to-aggregation-info agis-names-added)

        {:keys [remaining-ags-infos new-breakout-elements-infos]}
        ;; (group-by #(if (aggregation-info->breakout-element??? %) :remaining-ags-infos :new-breakout-elements-infos)
        (group-by #(if (aggregation-info->breakout-element??? %) :new-breakout-elements-infos :remaining-ags-infos)
                  agis-exprs-added)

        name->field (into {} (map (juxt :final-name :expression)) new-breakout-elements-infos)

        ;;;; TODO: expression references should contain the name of original aggregation or metric whatever!!!
        ordered-expression-references (map #(filterv some? [:expression (:final-name %) (:expression-options %)]) 
                                           new-breakout-elements-infos)
        ]
    (def aaaaa [query aggregation-infos agis-transformed agis-names-added agis-exprs-added])
    (def bbbbb [remaining-ags-infos new-breakout-elements-infos])
    (def ccccc [name->field ordered-expression-references])
    (-> query
        (u/assoc-dissoc :aggregation (not-empty (mapv :transformed-aggregation remaining-ags-infos)))
        (m/assoc-some :expressions (not-empty (merge expressions name->field)))
        (m/assoc-some :breakout (not-empty (into (vec breakout) ordered-expression-references))))))

;;;; TODO: this has to be modified also!!!
(defn- ordered-clause-refs-for-fields
  "When query is transformed using [[swap-metric-clauses]], some aggregation elements could become breakout elements.
   That could change the order of columns in the result. This function records original order in a following way:
   result is a vector where index is index of column in original query and value is a clause ref. Clause ref has
   a following form: [type index], where type points to (1) :breakout or (2) :aggregation and index points to the index
   of the clause in query __after transformation__ (ie. call to [[expand-metrics*]])."
  [breakout-idx ag-idx [[_type :as ag] & ags] acc]
  (cond (nil? ag)
        acc

        #_(one-and-only-metric? ag)
        ;;; hack now, remove metrics and check if contains
        (not (contains-aggregate? (mbql.u/replace ag
                                                  [:metric _]
                                                  #_"TMP HACK"
                                                  [:field "dummy" {:base-type :type/Number}])))
        (recur (inc breakout-idx) ag-idx ags (conj acc [:breakout breakout-idx]))

        :else
        (recur breakout-idx (inc ag-idx) ags (conj acc [:aggregation ag-idx]))))

(comment
  (ordered-clause-refs-for-fields
   0 0
   [[:aggregation-options [:sum [:+ [:metric 426] [:metric 426]]] {:name "m+m", :display-name "M + M"}]] [])
  (def aaaggg [:aggregation-options [:sum [:+ [:metric 426] [:metric 426]]] {:name "m+m", :display-name "M + M"}])
  (contains-aggregate? (mbql.u/replace aaaggg
                                       [:metric _]
                                       [:field "dummy" {:base-type :type/Number}]))

  ;; following does not work
  (mbql.preds/Aggregation? [:sum [:+ "TMP HACK" "TMP HACK"]])
  ;; 
  (mbql.preds/Aggregation? [:sum [:+ [:field 111111 nil] [:field 100000 nil]]])
  )

;;;; OK
(defn- infer-ordered-clause-refs-for-fields
  "See the [[ordered-clause-refs-for-fields]] for more info."
  [{:keys [breakout] :as query}]
  (let [orig-breakout-count (count breakout)
        clauses-from-orig-breakout (mapv #(vector :breakout %) (range orig-breakout-count))]
    (assoc query ::ordered-clause-refs-for-fields
           (ordered-clause-refs-for-fields orig-breakout-count 0 (:aggregation query) clauses-from-orig-breakout))))

;;;; OK
(defn- clause-ref->order-by-element
  "Get clause usable in :order-by. `clause-ref` is of a form `[type ref]` where type can be either `:breakout` or
   `:aggregation` and ref is numerical index, as found in :ordered-clause-refs-for-fields of query that has been
   preprocessed using [[preprocess-query]]."
  [query [clause-type :as clause-ref]]
  (case clause-type
    :breakout (get-in query clause-ref)
    clause-ref))

;;;; OK
(defn- update-order-by-ag-refs
  "Order by references could become invalid during the [[swap-metric-clauses]] execution. This functions is responsible
   for adjusting the references after the transformation."
  [{::keys [ordered-clause-refs-for-fields] :as query}]
  (assert (and (vector? ordered-clause-refs-for-fields)
               (seq ordered-clause-refs-for-fields))
          (trs "Expected not empty vector of `ordered-clause-refs-for-fields`."))
  (let [original-ag-index->clause-ref (subvec ordered-clause-refs-for-fields (::original-breakout-count query))]
    (mbql.u/replace-in query [:order-by]
      [:aggregation idx]
      (clause-ref->order-by-element query (original-ag-index->clause-ref idx)))))

;;;; OK
(defn- metric-infos->metrics-queries
  "Transforms metric infos into metrics queries."
  [original-query metric-infos]
  (->> metric-infos
       (map (partial expand-and-combine-filters original-query))
       (sort-by (comp :filter :definition))
       (partition-by (comp :filter :definition))
       (mapv (partial metrics-query original-query))))

;;;; OK
(defn- preprocess-query
  "Add the metadata necessary for tranformation of a query containing metrics."
  [query]
  (-> query
      (assoc ::original-breakout-count (count (:breakout query)))
      infer-ordered-clause-refs-for-fields))

;;;; OK
(mu/defn ^:private expand-metrics*
  "Expand metrics in `query`.
   1. Generate metrics queries.
   2. Join those queries to the `query`, this steps adds more metadata.
   3. Add necessary metadata using [[preprocess-query]].
   4. Swap the metric clauses for joined columns from metrics queries. This step possibly changes the result's column
      order, as it may transform some aggregations to the breakout fields (possibly wrapped in expressions).
   5. Update references in order-by."
  [query :- mbql.s/MBQLQuery]
  (tap> ["expand-metrics* args" query])
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
          preprocess-query
          #_swap-metric-clauses
          swap-metric-clauses--incl-exprs
          update-order-by-ag-refs))
    query))

;;;; OK
(defn- clause-ref->column-index
  [{:keys [breakout]} [type ref]]
  (case type
    :aggregation (+ ref (count breakout))
    :breakout ref))

;;;; OK
(defn- clause-ref->clause
  "Get the clause that is referenced by `clause-ref` from."
  [query [type :as clause-ref]]
  (assert (contains? #{:aggregation :breakout} type))
  (get-in query clause-ref))

;;;; OK
(defn- clause-ref->field
  "Transform clause reference from :ordered-clause-refs-for-fields of format [type index] to field usable
   in wrapping query."
  [query metadatas clause-ref]
  (def wwwww [query metadatas clause-ref])
  (let [column-index (clause-ref->column-index query clause-ref)
        metadata (metadatas column-index)
        clause (clause-ref->clause query clause-ref)]
    (clause->field query clause metadata)))

;;;; OK
(defn- maybe-wrap-in-ordering-query
  "Query transformation using [[expand-metrics*]] could potentialy change the order of columns in resulting query. This
   wraps the result of [[expand-metrics*]] to ordering query, that corrects the order."
  [{ordered-clause-refs-for-fields ::ordered-clause-refs-for-fields :as inner-query}]
  (if (some? ordered-clause-refs-for-fields)
    (let [metadatas (mbql-query->metadata inner-query)]
      ;;;; I need to pass metadatas, as they are in possibly changed order, corresponding to indices in clause-refs
      ;;;; rather indices of ::ordered-clause-refs-for-fields (aka original column order).
      {:fields (mapv (partial clause-ref->field inner-query metadatas) ordered-clause-refs-for-fields)
       :source-query inner-query
       :source-metadata metadatas})
    inner-query))

;;;; OK
(mu/defn expand-metrics :- mbql.s/Query
  "Expand metric entry point. Expects expanded segments. If top-level query contained metrics,
   [[maybe-wrap-in-ordering-query]] ensures that original order of resulting columns is respected. More on metrics
   expansion logic in [[expand-metrics*]]."
  [{inner-query :query :as outer-query} :- mbql.s/Query]
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

(mu/defn ^:private expand-metrics-and-segments :- mbql.s/Query
  "Expand the macros (`segment`, `metric`) in a `query`."
  [query :- mbql.s/Query]
  #_(-> query
      expand-segments
      expand-metrics)
  (tap> ["expand-metrics-and-segments args" query])
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
