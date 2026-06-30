(ns metabase.agent-lib.representations.metric-joins
  "Helpers for inheriting a metric's joins into a query that references the metric as an
  aggregation.

  A metric is an aggregation defined on top of a base table; its definition may include explicit
  joins (e.g. to a dimension table without a database-level foreign key) so the metric can be
  grouped/filtered by columns on the joined table. When another query references the metric via
  `[:metric {} <id>]` in its aggregation, those joins must be present in the consuming query's
  aggregation stage for any breakout/filter on the joined columns to resolve.

  This mirrors what the query processor's metric-expansion middleware does at execution time
  (`metabase.query-processor.middleware.metrics`); we apply it during agent query *construction* so
  a query built with a metric + a breakout on a joined dimension both validates and runs. The
  metric's own join aliases are preserved so the query processor's later re-expansion deduplicates
  to a no-op rather than producing a duplicate join."
  (:require
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.util.match :as match]))

(set! *warn-on-reflection* true)

(defn metric-definition-query
  "Build a metric card's own definition query (carrying its joins) from the card's `:dataset-query`.

  Deliberately not `(lib/query mp card)`: that treats the metric as a *source-card* and produces a
  single-stage query selecting from it, hiding the metric definition's joins. Returns nil when the
  card or its `:dataset-query` is missing."
  [mp metric-card-id]
  (when-let [card (lib.metadata/card mp metric-card-id)]
    (when-let [dataset-query (:dataset-query card)]
      (lib/query mp dataset-query))))

(defn- add-join-aliases
  "Stamp `:join-alias` onto `[:field opts _]` refs in `x` whose `:source-field` matches a key of
  `source-field->join-alias` and that do not already carry a `:join-alias`."
  [x source-field->join-alias]
  (match/replace x
    [:field (opts :guard (and (source-field->join-alias (:source-field opts)) (not (:join-alias opts)))) _]
    (assoc-in &match [1 :join-alias] (-> opts :source-field source-field->join-alias))))

(defn include-implicit-joins
  "Append `metric-query`'s last-stage joins into `query` at `stage-index`, deduping joins that
  already exist by `[fk-field-id alias]`, then remap field refs in that stage onto the newly added
  joins via their `source-field`→`alias` map.

  `query` and `metric-query` are resolved (numeric) pMBQL. Returns the updated query. Adapted from
  [[metabase.query-processor.middleware.metrics/include-implicit-joins]]."
  [query stage-index metric-query]
  (let [metric-joins             (lib/joins metric-query -1)
        existing-joins           (into #{}
                                       (map (juxt :fk-field-id :alias))
                                       (lib/joins query stage-index))
        new-joins                (remove (comp existing-joins (juxt :fk-field-id :alias)) metric-joins)
        source-field->join-alias (dissoc (into {} (map (juxt :fk-field-id :alias)) new-joins) nil)
        query-with-joins         (reduce #(lib/join %1 stage-index %2)
                                         query
                                         new-joins)]
    (lib/update-query-stage query-with-joins stage-index add-join-aliases source-field->join-alias)))
