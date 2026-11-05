(ns metabase.analytics.api
  (:require
   [metabase.analytics-interface.core :as analytics.interface]
   [metabase.analytics.prometheus :as prometheus]
   [metabase.analytics.stats :as stats]
   [metabase.api.macros :as api.macros]
   [metabase.permissions.core :as perms]
   [metabase.util.log :as log]
   [metabase.util.malli.schema :as ms]))

;; I don't think this endpoint is actually used anywhere for anything.
;;
;; TODO (Cam 2025-11-25) please add a response schema to this API endpoint, it makes it easier for our customers to
;; use our API + we will need it when we make auto-TypeScript-signature generation happen
;;
#_{:clj-kondo/ignore [:metabase/validate-defendpoint-has-response-schema]}
(api.macros/defendpoint :get "/anonymous-stats"
  "Anonymous usage stats. Endpoint for testing, and eventually exposing this to instance admins to let them see
  what is being phoned home."
  []
  (perms/check-has-application-permission :monitoring)
  (stats/legacy-anonymous-usage-stats))

(def ^:private frontend-metrics
  "Metrics the browser is allowed to report through `POST /internal`. No frontend code reports metrics today, so
  this is empty and the endpoint ignores every event.

  To let the frontend report a counter, make sure it is defined in `metabase.analytics.prometheus`, then map it to its
  labels: each label key to the set of values the browser may send for it. A metric with no labels maps to `{}`.
  Value sets are required because Prometheus keeps a time series for every distinct label value forever, so accepting
  arbitrary strings from any logged-in user would let them grow memory without bound.

    {:experiment/runs-total {:experiment #{\"my-experiment\"}}
     :my-module/clicks-total {}}"
  {})

(def ^:private max-events-per-batch
  "The frontend buffers at most [[analytics.interface/frontend-buffer-capacity]] events plus one dropped-count event
  per flush."
  (inc analytics.interface/frontend-buffer-capacity))

(def ^:private InternalAnalyticsEvent
  [:map {:closed true}
   [:op     [:= :inc]]
   [:metric :keyword]
   [:labels {:optional true} [:maybe (ms/string-keyed-map [:string {:max 200}])]]
   [:amount {:optional true} [:maybe number?]]])

(defn- allowed-event?
  "Only positive increments of [[frontend-metrics]], with exactly that metric's label keys and only allowed label
  values, are accepted."
  [{:keys [metric labels amount]}]
  (let [allowed-labels (get frontend-metrics metric)]
    (and (some? allowed-labels)
         (= (set (keys allowed-labels)) (set (keys labels)))
         (every? (fn [[label-key value]] (contains? (get allowed-labels label-key) value)) labels)
         (or (nil? amount) (pos? amount)))))

(api.macros/defendpoint :post "/internal" :- :nil
  "Receive a batch of internal analytics events from the frontend and record them as Prometheus metrics. Only the
  counters in [[frontend-metrics]] can be incremented; other events are ignored."
  [_route-params
   _query-params
   {:keys [events]} :- [:map {:closed true}
                        [:events [:sequential {:max max-events-per-batch} InternalAnalyticsEvent]]]]
  (doseq [event events
          :let  [{:keys [op metric labels amount] :as event} (update event :labels #(some-> % (update-keys keyword)))]]
    (if-not (allowed-event? event)
      (log/debugf "Ignoring disallowed internal analytics event %s %s" op metric)
      (try
        (prometheus/inc! metric labels (or amount 1))
        (catch Exception e
          (log/warnf "Failed to record internal analytics event %s %s: %s" op metric (ex-message e)))))))
