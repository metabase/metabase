(ns metabase.analytics.impl
  "CLJS implementation of [[metabase.analytics.interface/Reporter]].
  Batches events and POSTs them to the backend, which records them as Prometheus metrics."
  (:require
   [metabase.analytics.interface :as analytics.interface]))

(defonce ^:private buffer (atom []))

(def ^:private flush-interval-ms 5000)

(def ^:private flush-buffer-size 50)

(defn- flush-buffer!
  "Send the events to the backend. The events are removed from the buffer, even if the sending fails."
  []
  (when-let [events (not-empty @buffer)]
    (reset! buffer [])
    (let [post-fn (.-postInternalAnalytics (js/require "metabase/utils/internal-analytics"))]
      (post-fn (clj->js events)))))

(defonce ^:private _interval
  (js/setInterval flush-buffer! flush-interval-ms))

(defn- buffer-event!
  [event]
  (swap! buffer conj event)
  (when (>= (count @buffer) flush-buffer-size)
    (flush-buffer!)))

(analytics.interface/set-reporter!
 (reify analytics.interface/Reporter
   (-inc! [_ metric labels amount]
     (buffer-event! {:op     :inc
                     :metric metric
                     :labels labels
                     :amount amount}))
   (-dec-gauge! [_ metric labels amount]
     (buffer-event! {:op     :dec
                     :metric metric
                     :labels labels
                     :amount amount}))
   (-set-gauge! [_ metric labels amount]
     (buffer-event! {:op     :set
                     :metric metric
                     :labels labels
                     :amount amount}))
   (-observe! [_ metric labels amount]
     (buffer-event! {:op     :observe
                     :metric metric
                     :labels labels
                     :amount amount}))
   (-clear! [_ metric]
     (buffer-event! {:op     :clear
                     :metric metric}))))
