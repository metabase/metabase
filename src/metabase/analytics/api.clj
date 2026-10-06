(ns metabase.analytics.api
  (:require
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
  "Metrics the browser is allowed to report through `POST /internal`, mapped to the exact set of label keys each one
  takes. These are the metrics emitted by CLJC code running in the frontend (see `metabase.analytics.impl` and
  `metabase.analytics.experiment`). Add a metric here only if frontend code reports it."
  {:metabase-frontend/analytics-events-dropped #{}
   :experiment/runs-total                      #{:experiment}
   :experiment/matches-total                   #{:experiment}
   :experiment/mismatches-total                #{:experiment}
   :experiment/errors-total                    #{:experiment}
   :experiment/control-duration-ms             #{:experiment}
   :experiment/candidate-duration-ms           #{:experiment}
   :experiment/candidate-error-duration-ms     #{:experiment}})

(def ^:private max-events-per-batch
  "The frontend buffers at most 1000 events (see `metabase.analytics.impl/buffer-capacity`) plus one dropped-count
  event per flush."
  1001)

(def ^:private InternalAnalyticsEvent
  [:map {:closed true}
   [:op     [:enum :inc :dec :set :observe :clear]]
   [:metric :keyword]
   [:labels {:optional true} [:maybe (ms/string-keyed-map [:string {:max 200}])]]
   [:amount {:optional true} [:maybe number?]]])

(defn- allowed-event?
  "Only positive increments of [[frontend-metrics]], with exactly that metric's label keys, are accepted. Every
  frontend metric is a counter, so `:set`, `:dec`, `:observe` and `:clear` are never legitimate."
  [{:keys [op metric labels amount]}]
  (and (= op :inc)
       (contains? frontend-metrics metric)
       (= (get frontend-metrics metric) (set (keys labels)))
       (or (nil? amount) (pos? amount))))

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
