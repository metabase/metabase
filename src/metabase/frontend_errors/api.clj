(ns metabase.frontend-errors.api
  (:require
   [metabase.analytics.prometheus :as prometheus]
   [metabase.api.common :as api]
   [metabase.api.macros :as api.macros]))

(def ^:private Context
  "Allowed context values for frontend error reporting."
  [:enum "render-page" "render-chart"])

#_{:clj-kondo/ignore [:metabase/validate-defendpoint-has-response-schema]}
(api.macros/defendpoint :post "/"
  "Endpoint for the frontend to report errors. Increments a Prometheus counter
   with the given `context` label."
  [_route-params
   _query-params
   {:keys [context]} :- [:map [:context Context]]]
  (prometheus/inc! :metabase-frontend/errors {:context context})
  api/generic-204-no-content)

;;; !!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!
;;; !! Endpoints in this namespace do not currently require auth! Keep this in mind when adding new ones. !!
;;; !!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!
