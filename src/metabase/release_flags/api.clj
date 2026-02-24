(ns metabase.release-flags.api
  "/api/release-flags endpoints."
  (:require
   [metabase.api.common :as api]
   [metabase.api.macros :as api.macros]
   [metabase.release-flags.models :as models]
   [metabase.util :as u]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu]
   [metabase.util.malli.schema :as ms]
   [metabase.xrays.core :as xrays]
   [toucan2.core :as t2]))

(api.macros/defendpoint :get "/" :- [:map-of
                                     :string
                                     [:map
                                      [:description [:maybe :string]]
                                      [:start_date :any]
                                      [:is_enabled :boolean]]]
  "Return the status of all feature flags."
  []
  (models/all-flags))

(api.macros/defendpoint :put "/" :- [:map-of
                                     :string
                                     [:map
                                      [:description [:maybe :string]]
                                      [:start_date :any]
                                      [:is_enabled :boolean]]]
  "Modify the release flags."
  [_route-params
   _query-params
   flags :- [:map-of :string :boolean]]
  (api/check-superuser)
  (models/update-statuses! flags)
  (models/all-flags))
