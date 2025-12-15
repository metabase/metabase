(ns metabase.query-processor.middleware.measures
  "Middleware for expanding `:measure` clauses in MBQL queries.

  Measures are saved aggregation expressions. When a query contains a `:measure` clause,
  this middleware replaces it with the actual aggregation from the measure's definition."
  (:refer-clojure :exclude [not-empty])
  (:require
   [metabase.lib.metadata :as lib.metadata]
   [metabase.lib.schema :as lib.schema]
   [metabase.lib.util :as lib.util]
   [metabase.lib.util.match :as lib.util.match]
   [metabase.lib.walk :as lib.walk]
   [metabase.query-processor.error-type :as qp.error-type]
   [metabase.util :as u]
   [metabase.util.i18n :refer [tru]]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu]
   [metabase.util.performance :refer [not-empty]]))

(mu/defn- unresolved-measure-ids :- [:maybe [:set {:min 1} pos-int?]]
  "Find all the unresolved :measure references in `query`."
  [query :- ::lib.schema/query]
  (let [ids (transient #{})]
    (lib.walk/walk-stages
     query
     (fn [_query _path stage]
       (lib.util.match/match stage
         [:measure _opts (id :guard pos-int?)]
         (conj! ids id))
       nil))
    (not-empty (persistent! ids))))

(mu/defn- fetch-measures :- [:map-of pos-int? :map]
  "Fetch measure metadata for the given IDs."
  [query       :- ::lib.schema/query
   measure-ids :- [:set {:min 1} pos-int?]]
  (u/prog1 (into {}
                 (map (juxt :id identity))
                 (lib.metadata/bulk-metadata-or-throw query :metadata/measure measure-ids))
    (doseq [id measure-ids]
      (or (get <> id)
          (throw (ex-info (tru "Measure {0} does not exist or belongs to a different Database."
                               id)
                          {:type qp.error-type/invalid-query, :id id}))))))

(defn- measure-aggregation
  "Extract the aggregation clause from a measure's definition.
  Measure definitions are MBQL 5 queries with a single stage containing one aggregation."
  [{:keys [definition]}]
  (when-let [aggregation (-> definition :stages first :aggregation first)]
    (lib.util/fresh-uuids aggregation)))

(mu/defn- expand-measures-in-stage :- ::lib.schema/stage
  "Replace :measure clauses in a stage with their actual aggregation expressions."
  [stage        :- ::lib.schema/stage
   id->measure  :- [:map-of pos-int? :map]]
  (lib.util.match/replace stage
    [:measure opts (id :guard pos-int?)]
    (if-let [measure (get id->measure id)]
      (if-let [aggregation (measure-aggregation measure)]
        (do
          (log/debugf "Expanding measure %d:\n%s\n->\n%s" id (u/pprint-to-str &match) (u/pprint-to-str aggregation))
          ;; Preserve display-name from the measure clause options if present
          (cond-> aggregation
            (:display-name opts)
            (assoc-in [1 :display-name] (:display-name opts))))
        (throw (ex-info (tru "Measure {0} has no aggregation defined." id)
                        {:type qp.error-type/invalid-query, :measure measure})))
      (throw (ex-info (tru "Measure {0} not found." id)
                      {:type qp.error-type/invalid-query, :id id})))))

(mu/defn- expand-measures :- ::lib.schema/query
  "Expand all :measure clauses in the query."
  [query       :- ::lib.schema/query
   measure-ids :- [:set {:min 1} pos-int?]]
  (log/debugf "Expanding measures with IDs %s" measure-ids)
  (let [id->measure (fetch-measures query measure-ids)]
    (lib.walk/walk-stages
     query
     (fn [_query _path stage]
       (expand-measures-in-stage stage id->measure)))))

(mu/defn adjust :- ::lib.schema/query
  "Middleware that looks for `:measure` clauses in an MBQL query and substitutes them
  with their actual aggregation expressions."
  [query :- ::lib.schema/query]
  (if-let [measure-ids (unresolved-measure-ids query)]
    (expand-measures query measure-ids)
    query))
