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
;; Throttle anonymous clients by browser ID, with IP as a fallback. The threshold
;; is generous enough to accommodate a page with many components reporting errors
;; in a burst, but low enough to blunt a sustained flood from a single source.
(def ^:private frontend-errors-throttler
  (throttle/make-throttler :frontend-errors
                           :attempts-threshold 100
                           :attempt-ttl-ms     (* 60 1000)))

(defn- frontend-errors-throttle-key
  "Prefer the per-browser identifier for anonymous clients so unrelated users on the
  same egress IP do not share a throttle bucket. Fall back to IP if the request does
  not have a browser ID for some reason."
  [request]
  (or (:browser-id request)
      (request/ip-address request)))

(defn- throttle-frontend-errors
  "Apply throttling before `defendpoint` body parsing/validation runs."
  [handler]
  (fn [request respond raise]
    (try
      (throttle/check frontend-errors-throttler (frontend-errors-throttle-key request))
      (handler request respond raise)
      (catch ExceptionInfo e
        (if (u.throttle/throttle-exception? e)
          (respond (u.throttle/throttle-response e {:error (ex-message e)}))
          (raise e))))))

#_{:clj-kondo/ignore [:metabase/validate-defendpoint-has-response-schema]}
(api.macros/defendpoint :post "/"
  "Endpoint for the frontend to report errors. Increments a Prometheus counter
   with the given `type` label."
  [_route-params
   _query-params
   {:keys [type]} :- [:map [:type ::frontend-error-type]]
   _req]
  (prometheus/inc! :metabase-frontend/errors {:type type})
  api/generic-204-no-content)

(def ^{:arglists '([request respond raise])} routes
  "Routes for frontend error reporting."
  (api.macros/ns-handler *ns* throttle-frontend-errors))

;;; !!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!
;;; !! Endpoints in this namespace do not currently require auth! Keep this in mind when adding new ones. !!
;;; !!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!
