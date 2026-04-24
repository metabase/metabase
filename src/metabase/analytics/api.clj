(ns metabase.analytics.api
  (:require
   [metabase.analytics.prometheus :as prometheus]
   [metabase.analytics.stats :as stats]
   [metabase.api.macros :as api.macros]
   [metabase.permissions.core :as perms]
   [metabase.util.log :as log]))

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

(def ^:private InternalAnalyticsEvent
  [:map
   [:op     [:enum :inc :dec :set :observe :clear]]
   [:metric :keyword]
   [:labels {:optional true} [:maybe [:map-of :keyword :string]]]
   [:amount {:optional true} [:maybe number?]]])

(api.macros/defendpoint :post "/internal" :- :nil
  "Receive a batch of internal analytics events from the frontend and record them as Prometheus metrics."
  [_route-params
   _query-params
   {:keys [events]} :- [:map [:events [:sequential InternalAnalyticsEvent]]]]
  (doseq [{:keys [op metric labels amount]} events]
    (try
      (case op
        :inc     (prometheus/inc! metric labels (or amount 1))
        :dec     (prometheus/dec! metric labels (or amount 1))
        :set     (prometheus/set! metric labels amount)
        :observe (prometheus/observe! metric labels (or amount 1))
        :clear   (prometheus/clear! metric))
      (catch Exception e
        (log/warnf e "Failed to record internal analytics event %s %s" op metric)))))
