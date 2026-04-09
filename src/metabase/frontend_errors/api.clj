(ns metabase.frontend-errors.api
  (:require
   [metabase.analytics.prometheus :as prometheus]
   [metabase.api.common :as api]
   [metabase.api.macros :as api.macros]
   [metabase.request.core :as request]
   [metabase.util.malli.registry :as mr]
   [metabase.util.throttle :as u.throttle]
   [throttle.core :as throttle])
  (:import
   (clojure.lang ExceptionInfo)))

(mr/def ::frontend-error-type
  [:enum "component-crash" "chart-render-error"])

;; This endpoint is unauthenticated and writes to a Prometheus counter, so it is a
;; natural target for abuse (flooding to distort metrics or exhaust resources).
;; Throttle by client IP. The threshold is generous enough to accommodate a page
;; with many components reporting errors in a burst, but low enough to blunt a
;; sustained flood from a single source.
(def ^:private frontend-errors-throttler
  (throttle/make-throttler :frontend-errors
                           :attempts-threshold 100
                           :attempt-ttl-ms     (* 60 1000)))

#_{:clj-kondo/ignore [:metabase/validate-defendpoint-has-response-schema]}
(api.macros/defendpoint :post "/"
  "Endpoint for the frontend to report errors. Increments a Prometheus counter
   with the given `type` label."
  [_route-params
   _query-params
   {:keys [type]} :- [:map [:type ::frontend-error-type]]
   req]
  (try
    (throttle/with-throttling [frontend-errors-throttler (request/ip-address req)]
      (prometheus/inc! :metabase-frontend/errors {:type type})
      api/generic-204-no-content)
    (catch ExceptionInfo e
      (if (u.throttle/throttle-exception? e)
        (u.throttle/throttle-response e {:error (ex-message e)})
        (throw e)))))

;;; !!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!
;;; !! Endpoints in this namespace do not currently require auth! Keep this in mind when adding new ones. !!
;;; !!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!
