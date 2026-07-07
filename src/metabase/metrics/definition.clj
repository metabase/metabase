(ns metabase.metrics.definition
  "Shared helpers for turning an API- or tool-supplied metric definition (an `:expression`
  plus optional `:filters`/`:projections`) into an internal `::lib-metric.schema/metric-definition`,
  including query-permission checks over every metric/measure referenced in the expression.

  Used by both the `POST /api/metric/dataset` endpoint ([[metabase.metrics.api]]) and the Metabot
  metric-math tool ([[metabase.metabot.tools.metric-math]]) so the permission and shaping logic can't
  drift between them."
  (:require
   [metabase.api.common :as api]
   [metabase.lib-metric.core :as lib-metric]
   [metabase.metrics.core :as metrics.core]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(defn collect-expression-uuids
  "Collect all `:lib/uuid` values from leaf nodes in an expression tree."
  [expression]
  (mapv lib-metric/expression-leaf-uuid (lib-metric/expression-leaves expression)))

(defn collect-expression-leaves
  "Collect `[type id]` pairs from leaf nodes in an expression tree."
  [expression]
  (mapv (juxt lib-metric/expression-leaf-type lib-metric/expression-leaf-id)
        (lib-metric/expression-leaves expression)))

(defn sync-expression-dimensions!
  "Persist (sync) dimensions for every distinct metric/measure referenced in `expression`.

  Breakout resolution reads a metric's dimensions from the metadata provider, which only sees
  dimensions that have been synced to the app DB. `GET /api/metric/:id` syncs them as a side effect,
  so the metrics-viewer flow always has them by the time it POSTs projections; a caller that resolves
  breakouts itself (e.g. the Metabot metric-math tool) must sync first or a never-synced metric
  exposes zero dimensions. `sync-dimensions!` only writes when dimensions actually change."
  [expression]
  (doseq [[source-type source-id] (distinct (collect-expression-leaves expression))]
    (metrics.core/sync-dimensions! (case source-type
                                     :metric  :metadata/metric
                                     :measure :metadata/measure)
                                   source-id)))

(defn check-expression-permissions
  "Collect all metric/measure leaves from `expression` and verify query permissions for each.
  Throws the standard 403 response (via [[metabase.api.common/query-check]]) if the current user
  lacks access to any referenced entity."
  [expression]
  (doseq [[source-type source-id] (collect-expression-leaves expression)]
    (case source-type
      :metric  (api/query-check (t2/select-one :model/Card :id source-id :type "metric"))
      :measure (api/query-check (t2/select-one :model/Measure :id source-id)))))

(defn from-api-definition
  "Create an internal MetricDefinition from an API/tool definition map.

  The definition map (`:expression`, optional `:filters`/`:projections`) is passed through directly
  as the internal MetricDefinition, since the API format and internal format match. Query permissions
  are checked for every metric/measure referenced in the expression before the definition is returned."
  [provider definition]
  (let [{:keys [expression filters projections]} definition]
    (check-expression-permissions expression)
    {:lib/type          :metric/definition
     :expression        expression
     :filters           (or filters [])
     :projections       (or projections [])
     :metadata-provider provider}))
