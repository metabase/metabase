(ns metabase.analytics.impl
  "CLJS implementation of [[metabase.analytics-interface.core/Reporter]].
  Batches events and POSTs them to the backend, which records them as Prometheus metrics.

  Under heavy load we prefer to drop the oldest buffered events rather than flood the backend
  with extra flushes — newer events are usually more interesting, and gauge `:set` operations
  are strictly more correct when the newest value wins. The count of dropped events rides
  along on the next flush as an [[dropped-metric]] :inc event so dashboards can tell 'quiet
  system' apart from 'we dropped half your events'."
  (:require
   [metabase.analytics-interface.core :as analytics.interface]))

(def ^:private flush-interval-ms 5000)

(def ^:private buffer-capacity 1000)

(def ^:private dropped-metric :metabase-frontend/analytics-events-dropped)

(defonce ^:private state (atom {:events [] :dropped 0}))

(defn- enqueue
  "Append `event` to the buffer, dropping the oldest events if the result would exceed `capacity`."
  [{:keys [events dropped]} event capacity]
  (let [events'  (conj events event)
        overflow (max 0 (- (count events') capacity))]
    {:events  (if (pos? overflow) (vec (drop overflow events')) events')
     :dropped (+ dropped overflow)}))

(defn- take-pending
  "Return `[events-to-send new-state]`. When any drops have occurred, prepend a single :inc event
  for [[dropped-metric]] carrying the dropped count so the backend can record it."
  [{:keys [events dropped]}]
  (let [out (if (pos? dropped)
              (into [{:op :inc :metric dropped-metric :labels nil :amount dropped}] events)
              events)]
    [out {:events [] :dropped 0}]))

(defn- post-events!
  "Side-effecting POST of a batch of events to the backend."
  [events]
  (let [post-fn (.-postInternalAnalytics (js/require "metabase/utils/internal-analytics"))]
    (post-fn (clj->js events))))

(defn- flush-buffer!
  "Flush the buffer to the backend. Clears the buffer and resets the dropped count atomically."
  []
  (let [[to-send new-state] (take-pending @state)]
    (reset! state new-state)
    (when (seq to-send)
      (post-events! to-send))))

(defonce ^:private _interval
  (js/setInterval flush-buffer! flush-interval-ms))

(defn- buffer-event!
  [event]
  (swap! state enqueue event buffer-capacity))

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
