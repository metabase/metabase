(ns metabase.query-processor.middleware.expand-macros
  "Middleware for expanding LEGACY `:metric` and `:segment` 'macros' in *unexpanded* MBQL queries.

  (`:metric` forms are expanded into aggregations and sometimes filter clauses, while `:segment` forms are expanded
  into filter clauses.)"
  (:require
   [metabase.legacy-mbql.normalize :as mbql.normalize]
   [metabase.lib.convert :as lib.convert]
   [metabase.lib.filter :as lib.filter]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.lib.options :as lib.options]
   [metabase.lib.schema :as lib.schema]
   [metabase.lib.schema.aggregation :as lib.schema.aggregation]
   [metabase.lib.schema.expression :as lib.schema.expression]
   [metabase.lib.schema.metadata :as lib.schema.metadata]
   [metabase.lib.util :as lib.util]
   [metabase.lib.util.match :as lib.util.match]
   [metabase.lib.walk :as lib.walk]
   [metabase.query-processor.error-type :as qp.error-type]
   [metabase.util :as u]
   [metabase.util.i18n :refer [tru]]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu]
   [metabase.util.malli.registry :as mr]))

;;; "legacy macro" as used below means EITHER a legacy Metric or a legacy Segment.
(mr/def ::legacy-macro
  [:and
   [:map
    [:lib/type [:enum :metadata/segment :metadata/legacy-metric]]]
   [:multi
    {:dispatch :lib/type}
    [:metadata/segment       ::lib.schema.metadata/segment]
    [:metadata/legacy-metric ::lib.schema.metadata/legacy-metric]]])

(mr/def ::macro-type
  [:enum :metric :segment])

(mu/defn unresolved-legacy-macro-ids :- [:maybe [:set {:min 1} pos-int?]]
  "Find all the unresolved legacy :metric and :segment references in `query`.

  :metric references only appear in aggregations; :segment references can appear anywhere a boolean expression is
  allowed, including `:filters`, join conditions, expression aggregations like `:sum-where`, etc."
  [macro-type :- ::macro-type
   query      :- ::lib.schema/query]
  (let [ids (transient #{})]
    (lib.walk/walk-stages
     query
     (fn [_query _path stage]
       (lib.util.match/match stage
         [macro-type _opts (id :guard pos-int?)]
         (conj! ids id))))
    (not-empty (persistent! ids))))

;;; a legacy Metric has exactly one aggregation clause, and possibly one or more filter clauses as well.
;;;
;;; a legacy Segment has one or more filter clauses.

(mu/defn ^:private legacy-macro-definition->pMBQL :- ::lib.schema/stage.mbql
  "Get the definition of a legacy Metric as a pMBQL stage."
  [metadata-providerable                            :- ::lib.schema.metadata/metadata-providerable
   {:keys [definition table-id], :as _legacy-macro} :- ::legacy-macro]
  (log/tracef "Converting legacy MBQL for macro definition from\n%s" (u/pprint-to-str definition))
  (u/prog1 (-> {:type     :query
                :query    (merge {:source-table table-id}
                                 definition)
                :database (u/the-id (lib.metadata/database metadata-providerable))}
               mbql.normalize/normalize
               lib.convert/->pMBQL
               (lib.util/query-stage -1))
    (log/tracef "to pMBQL\n%s" (u/pprint-to-str <>))))

(mu/defn ^:private legacy-metric-aggregation :- ::lib.schema.aggregation/aggregation
  "Get the aggregation associated with a legacy Metric."
  [legacy-metric :- ::lib.schema.metadata/legacy-metric]
  (-> (or (first (get-in legacy-metric [:definition :aggregation]))
          (throw (ex-info (tru "Invalid legacy Metric: missing aggregation")
                          {:type qp.error-type/invalid-query, :legacy-metric legacy-metric})))
      ;; make sure aggregation has a display-name: keep the one attached directly to the aggregation if there is one;
      ;; otherwise use the Metric's name
      (lib.options/update-options update :display-name #(or % (:name legacy-metric)))
      ;; make sure it has fresh UUIDs in case we need to add it to the query more than once (multiple Metric references
      ;; are possible if the query joins the same source query twice for example)
      lib.util/fresh-uuids))

(mu/defn ^:private legacy-macro-filters :- [:maybe [:sequential ::lib.schema.expression/boolean]]
  "Get the filter(s) associated with a legacy Metric or Segment."
  [legacy-macro :- ::legacy-macro]
  (mapv lib.util/fresh-uuids
        (get-in legacy-macro [:definition :filters])))

(mr/def ::id->legacy-macro
  [:map-of pos-int? ::legacy-macro])

(mu/defn ^:private fetch-legacy-macros :- ::id->legacy-macro
  [macro-type            :- ::macro-type
   metadata-providerable :- ::lib.schema.metadata/metadata-providerable
   legacy-macro-ids      :- [:maybe [:set {:min 1} pos-int?]]]
  (let [metadata-type     (case macro-type
                            :metric  :metadata/legacy-metric
                            :segment :metadata/segment)]
    (u/prog1 (into {}
                   (map (juxt :id (fn [legacy-macro]
                                    (assoc legacy-macro :definition (legacy-macro-definition->pMBQL metadata-providerable legacy-macro)))))
                   (lib.metadata/bulk-metadata-or-throw metadata-providerable metadata-type legacy-macro-ids))
      ;; make sure all the IDs exist.
      (doseq [id legacy-macro-ids]
        (or (get <> id)
            (throw (ex-info (tru "Legacy Metric/Segment {0} does not exist, belongs to a different Database, or is invalid."
                                 id)
                            {:type qp.error-type/invalid-query, :macro-type macro-type, :id id})))))))

(defmulti ^:private resolve-legacy-macros-in-stage
  {:arglists '([macro-type stage id->legacy-macro])}
  (fn [macro-type _stage _id->legacy-macro]
    macro-type))

(mu/defmethod resolve-legacy-macros-in-stage :metric :- ::lib.schema/stage
  [_macro-type       :- [:= :metric]
   stage             :- ::lib.schema/stage
   id->legacy-metric :- ::id->legacy-macro]
  (let [new-filters (atom [])
        stage'      (lib.util.match/replace-in stage [:aggregation]
                      [:metric opts-from-ref (id :guard pos-int?)]
                      (let [legacy-metric  (get id->legacy-metric id)
                            aggregation    (-> (legacy-metric-aggregation legacy-metric)
                                               ;; preserve the `:name` and `:display-name` from the `:metric` ref itself
                                               ;; if there are any. Very important! Preserve `:lib/uuid` so anything
                                               ;; `:aggregation` references referring to the Metric will still be valid
                                               ;; after macroexpansion.
                                               (lib.options/update-options merge (select-keys opts-from-ref
                                                                                              [:name :display-name :lib/uuid])))
                            filters        (legacy-macro-filters legacy-metric)]
                        (log/debugf "Expanding legacy Metric macro\n%s" (u/pprint-to-str &match))
                        (log/tracef "Adding aggregation clause for legacy Metric %d:\n%s" id (u/pprint-to-str aggregation))
                        (doseq [filter-clause filters]
                          (log/tracef "Adding filter clause for legacy Metric %d:\n%s" id (u/pprint-to-str filter-clause)))
                        (swap! new-filters concat filters)
                        aggregation))
        new-filters @new-filters]
    (cond-> stage'
      (seq new-filters) (lib.filter/add-filters-to-stage new-filters))))

(mu/defmethod resolve-legacy-macros-in-stage :segment :- ::lib.schema/stage
  [_macro-type        :- [:= :segment]
   stage              :- ::lib.schema/stage
   id->legacy-segment :- ::id->legacy-macro]
  (-> (lib.util.match/replace stage
        [:segment _opts (id :guard pos-int?)]
        (let [legacy-segment (get id->legacy-segment id)
              filter-clauses (legacy-macro-filters legacy-segment)]
          (log/debugf "Expanding legacy Segment macro\n%s" (u/pprint-to-str &match))
          (doseq [filter-clause filter-clauses]
            (log/tracef "Adding filter clause for legacy Segment %d:\n%s" id (u/pprint-to-str filter-clause)))
          ;; replace a single segment with a single filter, wrapping them in `:and` if needed... we will unwrap once
          ;; we've expanded all of the :segment refs.
          (if (> (count filter-clauses) 1)
            (apply lib.filter/and filter-clauses)
            (first filter-clauses))))
      lib.filter/flatten-compound-filters-in-stage
      lib.filter/remove-duplicate-filters-in-stage))

(mu/defn ^:private resolve-legacy-macros :- ::lib.schema/query
  [macro-type       :- ::macro-type
   query            :- ::lib.schema/query
   legacy-macro-ids :- [:maybe [:set {:min 1} pos-int?]]]
  (log/debugf "Resolving legacy %s macros with IDs %s" macro-type legacy-macro-ids)
  (let [id->legacy-macro (fetch-legacy-macros macro-type query legacy-macro-ids)]
    (lib.walk/walk-stages
     query
     (fn [_query _path stage]
       (resolve-legacy-macros-in-stage macro-type stage id->legacy-macro)))))

(mu/defn ^:private expand-legacy-macros :- ::lib.schema/query
  [macro-type :- ::macro-type
   query      :- ::lib.schema/query]
  (if-let [legacy-macro-ids (not-empty (unresolved-legacy-macro-ids macro-type query))]
    (resolve-legacy-macros macro-type query legacy-macro-ids)
    query))

(def ^:private max-recursion-depth
  "Detect infinite recursion for macro expansion."
  50)

(mu/defn expand-macros
  "Middleware that looks for `:metric` and `:segment` macros in an unexpanded MBQL query and substitute the macros for
  their contents."
  ([query  :- ::lib.schema/query]
   (expand-macros query 0))

  ([query recursion-depth]
   (when (> recursion-depth max-recursion-depth)
     (throw (ex-info (tru "Metric/Segment expansion failed. Check mutually recursive segment definitions.")
                     {:type qp.error-type/invalid-query, :query query})))
   (let [query' (->> query
                     (expand-legacy-macros :metric)
                     (expand-legacy-macros :segment))]
     ;; if we expanded anything, we need to recursively try expanding again until nothing is left to expand, in case a
     ;; legacy Metric or Segment references another legacy Metric or Segment.
     (if-not (= query' query)
       (recur query' (inc recursion-depth))
       (do
         (log/trace "No more legacy Metrics/Segments to expand.")
         query')))))
