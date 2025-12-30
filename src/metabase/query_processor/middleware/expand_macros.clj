(ns metabase.query-processor.middleware.expand-macros
  "Middleware for expanding LEGACY `:segment` 'macros' in *unexpanded* MBQL queries.

  (`:segment` forms are expanded into filter clauses.)"
  (:refer-clojure :exclude [mapv not-empty get-in])
  (:require
   [metabase.lib.filter :as lib.filter]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.lib.schema :as lib.schema]
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
   [metabase.util.malli.registry :as mr]
   [metabase.util.performance :refer [mapv not-empty get-in]]))

;;; "legacy macro" as used below means legacy Segment.
(mr/def ::legacy-macro
  [:and
   [:map
    [:lib/type [:enum :metadata/segment]]]
   [:multi
    {:dispatch :lib/type}
    [:metadata/segment       ::lib.schema.metadata/segment]]])

(mr/def ::macro-type
  [:enum :segment])

(mu/defn unresolved-legacy-macro-ids :- [:maybe [:set {:min 1} pos-int?]]
  "Find all the unresolved :segment references in `query`.

  :segment references can appear anywhere a boolean expression is
  allowed, including `:filters`, join conditions, expression aggregations like `:sum-where`, etc."
  [macro-type :- ::macro-type
   query      :- ::lib.schema/query]
  (let [ids (transient #{})]
    (lib.walk/walk-stages
     query
     (fn [_query _path stage]
       (lib.util.match/match stage
         [macro-type _opts (id :guard pos-int?)]
         (conj! ids id))
       nil))
    (not-empty (persistent! ids))))

;;; a legacy Segment has one or more filter clauses.

(mu/defn- segment-definition->stage :- ::lib.schema/stage.mbql
  "Extract the pMBQL stage from a segment definition. Segment definitions are always MBQL 5 queries at this point
  (converted by the segment model's after-select hook), so we just extract the first stage."
  [_metadata-providerable :- ::lib.schema.metadata/metadata-providerable
   {:keys [definition], :as _legacy-macro} :- ::legacy-macro]
  (log/tracef "Extracting pMBQL stage from segment definition:\n%s" (u/pprint-to-str definition))
  (u/prog1 (first (:stages definition))
    (log/tracef "Extracted stage:\n%s" (u/pprint-to-str <>))))

(mu/defn- legacy-macro-filters :- [:maybe [:sequential ::lib.schema.expression/boolean]]
  "Get the filter(s) associated with a Segment."
  [legacy-macro :- ::legacy-macro]
  (mapv lib.util/fresh-uuids
        (get-in legacy-macro [:definition :filters])))

(mr/def ::id->legacy-macro
  [:map-of pos-int? ::legacy-macro])

(mu/defn- fetch-legacy-macros :- ::id->legacy-macro
  [macro-type            :- ::macro-type
   metadata-providerable :- ::lib.schema.metadata/metadata-providerable
   legacy-macro-ids      :- [:maybe [:set {:min 1} pos-int?]]]
  (let [metadata-type     (case macro-type ;; left in case we see a :metric here
                            :segment :metadata/segment)]
    (u/prog1 (into {}
                   (map (juxt :id (fn [legacy-macro]
                                    (assoc legacy-macro :definition (segment-definition->stage metadata-providerable legacy-macro)))))
                   (lib.metadata/bulk-metadata-or-throw metadata-providerable metadata-type legacy-macro-ids))
      ;; make sure all the IDs exist.
      (doseq [id legacy-macro-ids]
        (or (get <> id)
            (throw (ex-info (tru "Segment {0} does not exist, belongs to a different Database, or is invalid."
                                 id)
                            {:type qp.error-type/invalid-query, :macro-type macro-type, :id id})))))))

(defmulti ^:private resolve-legacy-macros-in-stage
  {:arglists '([macro-type stage id->legacy-macro])}
  (fn [macro-type _stage _id->legacy-macro]
    macro-type))

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

(mu/defn- resolve-legacy-macros :- ::lib.schema/query
  [macro-type       :- ::macro-type
   query            :- ::lib.schema/query
   legacy-macro-ids :- [:maybe [:set {:min 1} pos-int?]]]
  (log/debugf "Resolving legacy %s macros with IDs %s" macro-type legacy-macro-ids)
  (let [id->legacy-macro (fetch-legacy-macros macro-type query legacy-macro-ids)]
    (lib.walk/walk-stages
     query
     (fn [_query _path stage]
       (resolve-legacy-macros-in-stage macro-type stage id->legacy-macro)))))

(mu/defn- expand-legacy-macros :- ::lib.schema/query
  [macro-type :- ::macro-type
   query      :- ::lib.schema/query]
  (if-let [legacy-macro-ids (not-empty (unresolved-legacy-macro-ids macro-type query))]
    (resolve-legacy-macros macro-type query legacy-macro-ids)
    query))

(def ^:private max-recursion-depth
  "Detect infinite recursion for macro expansion."
  50)

(mu/defn expand-macros
  "Middleware that looks for `:segment` macros in an unexpanded MBQL query and substitute the macros for
  their contents."
  ([query  :- ::lib.schema/query]
   (expand-macros query 0))

  ([query recursion-depth]
   (when (> recursion-depth max-recursion-depth)
     (throw (ex-info (tru "Segment expansion failed. Check mutually recursive segment definitions.")
                     {:type qp.error-type/invalid-query, :query query})))
   (let [query' (expand-legacy-macros :segment query)]
     ;; if we expanded anything, we need to recursively try expanding again until nothing is left to expand, in case a
     ;; Segment references another Segment.
     (if-not (= query' query)
       (recur query' (inc recursion-depth))
       (do
         (log/trace "No more legacy Segments to expand.")
         query')))))
