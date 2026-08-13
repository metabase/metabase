(ns metabase.health-inspector.api
  (:require
   [metabase.api.common :as api]
   [metabase.api.macros :as api.macros]
   [metabase.health-inspector.core :as health]
   [metabase.util.malli.registry :as mr]
   [metabase.util.malli.schema :as ms]))

(mr/def ::result [:map
                  [:check_name string?]
                  [:health number?]
                  [:message string?]
                  [:run_at ms/TemporalInstant]])

(api.macros/defendpoint :get "/" :- [:sequential ::result]
  "Get a list of recent health check runs."
  [_route-params {:keys [limit] :as _query-params} _body]
  (api/check-superuser)
  (health/list-runs (min (or limit 32) 512)))
