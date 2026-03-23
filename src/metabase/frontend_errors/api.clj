(ns metabase.frontend-errors.api
  (:require
   [metabase.analytics.prometheus :as prometheus]
   [metabase.api.common :as api]
   [metabase.api.macros :as api.macros]
   [metabase.util.malli.registry :as mr]))

(mr/def ::frontend-error-type
  [:enum "component-crash" "chart-render-error"])

#_{:clj-kondo/ignore [:metabase/validate-defendpoint-has-response-schema]}
(api.macros/defendpoint :post "/"
  "Endpoint for the frontend to report errors. Increments a Prometheus counter
   with the given `type` label."
  [_route-params
   _query-params
   {:keys [type]} :- [:map [:type ::frontend-error-type]]]
  (prometheus/inc! :metabase-frontend/errors {:type type})
  api/generic-204-no-content)

;;; !!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!
;;; !! Endpoints in this namespace do not currently require auth! Keep this in mind when adding new ones. !!
;;; !!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!
