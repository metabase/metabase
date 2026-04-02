(ns metabase.app-db.checkout-tracking
  "Tracks app DB connection pool checkouts by reason/origin for Prometheus metrics.

  Use [[with-checkout-reason]] at call sites to tag why a connection is being checked out.
  Busy and waiting counts are tracked as Prometheus gauges with a `reason` label."
  (:require
   [metabase.analytics.prometheus :as prometheus])
  (:import
   (java.lang.reflect InvocationHandler Proxy)
   (java.sql Connection)))

(set! *warn-on-reflection* true)

(def ^:dynamic *checkout-reason*
  "The reason for the current app DB connection checkout. Defaults to `:api-request`.
  Bind this with [[with-checkout-reason]] at call sites."
  :unknown)

(defmacro with-checkout-reason
  "Execute `body` with `*checkout-reason*` bound to `reason`."
  [reason & body]
  `(binding [*checkout-reason* ~reason]
     ~@body))

(defn- reason-labels [reason]
  {:reason (name reason)})

(defn- wrap-tracked-connection
  "Wrap a `java.sql.Connection` in a proxy that decrements the busy gauge for `reason` when `.close()` is called."
  ^Connection [^Connection conn reason]
  (let [labels  (reason-labels reason)
        closed? (atom false)]
    (Proxy/newProxyInstance
     (.getClassLoader (class conn))
     (into-array Class [Connection])
     (reify InvocationHandler
       (invoke [_ _proxy method args]
         (let [method-name (.getName ^java.lang.reflect.Method method)]
           (cond
             (= "close" method-name)
             (when (compare-and-set! closed? false true)
               (prometheus/dec! :metabase-appdb/connections-busy labels)
               (.close conn))

             (= "unwrap" method-name)
             (.unwrap conn ^Class (first args))

             (= "isWrapperFor" method-name)
             (.isWrapperFor conn ^Class (first args))

             :else
             (.invoke ^java.lang.reflect.Method method conn (or args (object-array 0))))))))))

(defn with-checkout-reason-meta
  "Given a map, returns the map with `*checkout-reason*` attached to metadata.
   Used for propagation of checkout reason across threads (e.g., async notification dispatch)."
  [m]
  (vary-meta m assoc ::checkout-reason *checkout-reason*))

(defmacro with-restored-checkout-reason
  "Given a map presumably containing metadata from [[with-checkout-reason-meta]], restores `*checkout-reason*` and
  executes body."
  [m & body]
  `(binding [*checkout-reason* (or (::checkout-reason (meta ~m)) :unknown)]
     ~@body))

(defn get-tracked-connection
  "Get a connection from `data-source`, tracking checkout reason from [[*checkout-reason*]].
  Returns a proxied Connection that decrements the busy gauge on close."
  ^Connection [^javax.sql.DataSource data-source]
  (let [reason *checkout-reason*
        labels (reason-labels reason)]
    (prometheus/inc! :metabase-appdb/connections-waiting labels)
    (try
      (let [conn (.getConnection data-source)]
        (prometheus/dec! :metabase-appdb/connections-waiting labels)
        (prometheus/inc! :metabase-appdb/connections-busy labels)
        (prometheus/inc! :metabase-appdb/checkouts-total labels)
        (wrap-tracked-connection conn reason))
      (catch Throwable t
        (prometheus/dec! :metabase-appdb/connections-waiting labels)
        (throw t)))))
