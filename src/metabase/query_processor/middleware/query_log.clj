(ns metabase.query-processor.middleware.query-log
  "Around-middleware that pushes correlation metadata into Log4j2 ThreadContext
   and emits an always-on INFO summary log line at query completion."
  (:require
   [metabase.config.core :as config]
   [metabase.query-processor.util :as qp.util]
   [metabase.util :as u]
   [metabase.util.log :as log]))

(set! *warn-on-reflection* true)

(defn- query-log-context
  "Extract the ThreadContext map from a query. Returns a map with only non-nil values."
  [query]
  (let [request-id   (or config/*request-id* (str (random-uuid)))
        database-id  (:database query)
        info         (:info query)
        card-id      (:card-id info)
        dashboard-id (:dashboard-id info)
        user-id      (:executed-by info)
        context      (:context info)]
    (cond-> {:request-id request-id}
      database-id  (assoc :database-id database-id)
      card-id      (assoc :card-id card-id)
      dashboard-id (assoc :dashboard-id dashboard-id)
      user-id      (assoc :user-id user-id)
      context      (assoc :context context))))

(defn- emit-summary!
  "Emit a single INFO log line summarizing the query execution."
  [{:keys [request-id database-id user-id card-id dashboard-id context]} timer row-count]
  (let [elapsed (long (u/since-ms timer))
        sb      (StringBuilder. 128)]
    (.append sb "Query completed :: request-id=")
    (.append sb (str request-id))
    (.append sb " database=")
    (.append sb (str database-id))
    (.append sb " user=")
    (.append sb (str user-id))
    (when card-id
      (.append sb " card=")
      (.append sb (str card-id)))
    (when dashboard-id
      (.append sb " dashboard=")
      (.append sb (str dashboard-id)))
    (.append sb " context=")
    (.append sb (str (some-> context name)))
    (.append sb " queries=1 rows=")
    (.append sb (str @row-count))
    (.append sb " time=")
    (.append sb (str elapsed))
    (.append sb "ms")
    (log/info (.toString sb))))

(defn query-log-middleware
  "Around-middleware that pushes correlation metadata into Log4j2 ThreadContext
   and emits an INFO summary log line when a userland query completes.

   Non-userland queries (e.g., sync, scan) pass through without logging."
  [qp]
  (fn [query rff]
    (if-not (qp.util/userland-query? query)
      (qp query rff)
      (let [ctx          (query-log-context query)
            timer        (u/start-timer)
            row-count    (volatile! 0)
            wrapped-rff  (fn [metadata]
                           (let [rf (rff metadata)]
                             (fn
                               ([]         (rf))
                               ([acc]
                                (emit-summary! ctx timer row-count)
                                (rf acc))
                               ([acc row]
                                (vswap! row-count inc)
                                (rf acc row)))))]
        (log/with-thread-context ctx
          (qp query wrapped-rff))))))
