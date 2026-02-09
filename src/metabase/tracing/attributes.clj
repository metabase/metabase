(ns metabase.tracing.attributes
  "Standard attribute builders for OpenTelemetry spans. Provides consistent attribute naming
   across all instrumentation points."
  (:require
   [metabase.config.core :as config]))

(set! *warn-on-reflection* true)

(defn query-attrs
  "Standard attributes for a query processor span."
  [{:keys [database-id database-engine query-type source-card-id]}]
  (cond-> {}
    database-id     (assoc :db/id database-id)
    database-engine (assoc :db/engine (name database-engine))
    query-type      (assoc :query/type (name query-type))
    source-card-id  (assoc :query/source-card-id source-card-id)))

(defn db-attrs
  "Standard attributes for a database operation span."
  [{:keys [database-id database-engine operation]}]
  (cond-> {}
    database-id     (assoc :db/id database-id)
    database-engine (assoc :db/engine (name database-engine))
    operation       (assoc :db/operation (name operation))))

(defn http-attrs
  "Standard attributes for an HTTP request span."
  [{:keys [method uri status request-id]}]
  (cond-> {}
    method     (assoc :http/method (name method))
    uri        (assoc :http/url uri)
    status     (assoc :http/status-code status)
    request-id (assoc :http/request-id request-id)))

(defn sync-attrs
  "Standard attributes for a sync operation span."
  [{:keys [database-id phase table-name]}]
  (cond-> {}
    database-id (assoc :db/id database-id)
    phase       (assoc :sync/phase (name phase))
    table-name  (assoc :sync/table table-name)))

(defn task-attrs
  "Standard attributes for a scheduled task span."
  [{:keys [task-name task-key]}]
  (cond-> {}
    task-name (assoc :task/name task-name)
    task-key  (assoc :task/key (name task-key))))

(defn service-attrs
  "Base attributes included in all spans via the SDK resource."
  []
  {:service/version config/mb-version-string})
