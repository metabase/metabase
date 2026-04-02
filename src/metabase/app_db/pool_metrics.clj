(ns metabase.app-db.pool-metrics
  "Wires Prometheus metrics to the app DB connection pool checkout/checkin lifecycle hooks.
  Kept in a separate namespace to avoid a circular dependency between `connection-pool-setup` and `prometheus`/`request`."
  (:require
   [metabase.analytics.prometheus :as prometheus]
   [metabase.app-db.connection-pool-setup :as connection-pool-setup]
   [metabase.request.core :as request]))

(set! *warn-on-reflection* true)

(def ^:private checkout-tracking
  "Maps `System/identityHashCode` of checked-out connections to
  `{:checkout-at <nanos>, :pending <atom-or-nil>}`.
  The `:pending` atom is captured at checkout time so checkin callbacks (which run on C3P0 helper threads
  without the dynamic binding) can still accumulate duration."
  (atom {}))

;;; ---------------------------------------- Deferred per-request accumulation -----------------------------------------

(def ^:dynamic *pending-checkouts*
  "When bound (by [[wrap-pool-metrics]]), an atom holding `{:count n :duration-secs d}`.
  Checkout hooks accumulate here; checkin hooks find it via [[checkout-tracking]].
  The middleware flushes accumulated metrics when the response is ready, discarding them
  when the route was never matched (404s)."
  nil)

(defn- flush-pending!
  "Write accumulated checkout metrics to Prometheus using the matched route template as label."
  [pending route]
  (let [{:keys [count duration-secs]} pending]
    (when (and count (pos? count))
      (prometheus/inc-if-initialized! :metabase-db-connection/checkout-total
                                      {:endpoint route}
                                      count))
    (when (and duration-secs (pos? duration-secs))
      (prometheus/inc-if-initialized! :metabase-db-connection/checkout-duration-seconds-total
                                      {:endpoint route}
                                      duration-secs))))

;;; -------------------------------------------------- Middleware ------------------------------------------------------

(defn wrap-pool-metrics
  "Ring middleware that defers pool metric recording until the response is available.
  Discards metrics when the route was never matched (404s), preventing cardinality bombs from invalid URLs."
  [handler]
  (fn [request respond raise]
    (binding [*pending-checkouts* (atom {:count 0 :duration-secs 0.0})]
      (handler request
               (fn [response]
                 (when-let [route (request/matched-route)]
                   (flush-pending! @*pending-checkouts* route))
                 (respond response))
               raise))))

;;; --------------------------------------------------- Install --------------------------------------------------------

(defn install!
  "Register checkout/checkin/destroy listeners on the app DB connection pool that record Prometheus metrics."
  []
  (reset! connection-pool-setup/checkout-listener
          {:on-checkout
           (fn [^Object connection]
             (let [k       (System/identityHashCode connection)
                   pending *pending-checkouts*]
               (swap! checkout-tracking assoc k {:checkout-at (System/nanoTime) :pending pending})
               (if pending
                 (swap! pending update :count (fnil inc 0))
                 (prometheus/inc-if-initialized! :metabase-db-connection/checkout-total
                                                 {:endpoint "non-request"}))))

           :on-checkin
           (fn [^Object connection]
             (let [k (System/identityHashCode connection)]
               (when-let [{:keys [checkout-at pending]} (get @checkout-tracking k)]
                 (swap! checkout-tracking dissoc k)
                 (let [duration-secs (/ (double (- (System/nanoTime) ^long checkout-at)) 1e9)]
                   (if pending
                     (swap! pending update :duration-secs (fnil + 0.0) duration-secs)
                     (prometheus/inc-if-initialized! :metabase-db-connection/checkout-duration-seconds-total
                                                     {:endpoint "non-request"}
                                                     duration-secs))))))

           :on-destroy
           (fn [^Object connection]
             (swap! checkout-tracking dissoc (System/identityHashCode connection)))}))
