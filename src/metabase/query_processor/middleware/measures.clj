(ns metabase.query-processor.middleware.measures
  "Middleware for expanding `:measure` clauses in MBQL queries.

  Measures are saved aggregation expressions. When a query contains a `:measure` clause,
  this middleware replaces it with the actual aggregation from the measure's definition.

  Measures can reference other measures, so expansion is recursive. Cycles are detected
  by tracking the path of measure IDs being expanded."
  (:refer-clojure :exclude [select-keys some])
  (:require
   [better-cond.core :as b]
   [clojure.set :as set]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.lib.options :as lib.options]
   [metabase.lib.schema :as lib.schema]
   [metabase.lib.util :as lib.util]
   [metabase.lib.util.match :as lib.util.match]
   [metabase.lib.walk :as lib.walk]
   [metabase.query-processor.error-type :as qp.error-type]
   [metabase.util :as u]
   [metabase.util.i18n :refer [tru]]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu]
   [metabase.util.performance :refer [select-keys some]]))

(defn- contains-metric-reference?
  "Check if the given query or clause contains any `:metric` references.
  Returns true if found, false otherwise."
  [query-or-clause]
  (let [found? (volatile! false)
        check-clause (fn [x]
                       (when (lib.util/clause-of-type? x :metric)
                         (vreset! found? true))
                       nil)]
    (if (map? query-or-clause)
      ;; Full query - walk all clauses in all stages
      (lib.walk/walk-clauses
       query-or-clause
       (fn [_query _path-type _stage-or-join-path clause]
         (check-clause clause)))
      ;; Single clause - walk directly
      (lib.walk/walk-clause query-or-clause check-clause))
    @found?))

(defn- check-no-metric-references!
  "Throw an exception if the measure definition contains any `:metric` references.
  Measures cannot reference metrics."
  [{:keys [id name definition]}]
  (when (contains-metric-reference? definition)
    (throw (ex-info (tru "Measures cannot reference metrics. Measure \"{0}\" (ID {1}) contains a metric reference."
                         name id)
                    {:type qp.error-type/invalid-measure
                     :measure-id id
                     :measure-name name}))))

(mu/defn- fetch-measures :- [:map-of pos-int? :map]
  "Fetch measure metadata for the given IDs."
  [query       :- ::lib.schema/query
   measure-ids :- [:set {:min 1} pos-int?]]
  (u/prog1 (into {}
                 (map (juxt :id identity))
                 (lib.metadata/bulk-metadata-or-throw query :metadata/measure measure-ids))
    (doseq [id measure-ids]
      (if-let [measure (get <> id)]
        (check-no-metric-references! measure)
        (throw (ex-info (tru "Measure {0} does not exist or belongs to a different Database."
                             id)
                        {:type qp.error-type/missing-measure, :id id}))))))

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
    (b/cond
      :let [measure (get id->measure id)]
      (not measure) (throw (ex-info (tru "Measure {0} not found." id)
                                    {:type qp.error-type/missing-measure, :id id}))
      :let [aggregation (measure-aggregation measure)]
      (not aggregation) (throw (ex-info (tru "Measure {0} has no aggregation defined." id)
                                        {:type qp.error-type/invalid-measure, :measure measure}))
      :else (do
              (log/debugf "Expanding measure %d:\n%s\n->\n%s" id (u/pprint-to-str &match) (u/pprint-to-str aggregation))
              ;; Preserve :lib/uuid and :display-name from the measure clause options if present
              ;; This is important so that :aggregation refs pointing to the measure remain valid
              (lib.options/update-options aggregation merge (select-keys opts [:lib/uuid :display-name]))))))

(mu/defn- expand-measures-once :- ::lib.schema/query
  "Expand all :measure clauses in the query (single pass)."
  [query       :- ::lib.schema/query
   measure-ids :- [:set {:min 1} pos-int?]]
  (log/debugf "Expanding measures with IDs %s" measure-ids)
  (let [id->measure (fetch-measures query measure-ids)]
    (lib.walk/walk-stages
     query
     (fn [_query _path stage]
       (expand-measures-in-stage stage id->measure)))))

(def ^:private max-expansion-depth
  "Maximum depth for recursive measure expansion. This is a safety limit to prevent
  runaway expansion in case of bad or malicious input."
  50)

(mu/defn- expand-measures-recursive :- ::lib.schema/query
  "Recursively expand all :measure clauses in the query, detecting cycles.

  `seen-ids` is the set of measure IDs we've already expanded in this recursive chain.
  If we encounter a measure ID that's already in `seen-ids`, we have a cycle."
  [query    :- ::lib.schema/query
   seen-ids :- [:set pos-int?]
   depth    :- :int]
  (when (> depth max-expansion-depth)
    (throw (ex-info (tru "Measure expansion exceeded maximum depth of {0}." max-expansion-depth)
                    {:type qp.error-type/invalid-measure
                     :seen-ids seen-ids})))
  (if-let [measure-ids (lib/all-measure-ids query)]
    ;; Check for cycles: if any measure ID is already in seen-ids, we have a cycle
    (if-let [cycle-id (some seen-ids measure-ids)]
      ;; Found a cycle - use lib/check-measure-cycles to get a detailed error with the cycle path
      ;; The metadata is already cached from previous expansions, so this is cheap
      (let [measure (lib.metadata/measure query cycle-id)]
        (lib/check-measure-cycles query (:definition measure) cycle-id))
      ;; No cycle - expand measures and continue recursively
      (recur (expand-measures-once query measure-ids)
             (set/union seen-ids measure-ids)
             (inc depth)))
    ;; No more measures to expand
    query))

(mu/defn adjust :- ::lib.schema/query
  "Middleware that looks for `:measure` clauses in an MBQL query and substitutes them
  with their actual aggregation expressions.

  Measures can reference other measures, so expansion is recursive. Cycles are detected
  and reported with the full cycle path."
  [query :- ::lib.schema/query]
  (expand-measures-recursive query #{} 0))
