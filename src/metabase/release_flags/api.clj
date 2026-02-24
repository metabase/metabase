(ns metabase.release-flags.api
  "/api/release-flags endpoints."
  (:require
   [metabase.api.common :as api]
   [metabase.api.macros :as api.macros]
   [metabase.release-flags.models :as models]
   [metabase.release-flags.schema :as schema]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu]
   [metabase.util.malli.schema :as ms]
   [metabase.xrays.core :as xrays]
   [toucan2.core :as t2]))

(api.macros/defendpoint :get "/" :- schema/FlagMap
  "Return the status of all feature flags."
  []
  (models/all-flags))

(api.macros/defendpoint :put "/" :- schema/FlagMap
  "Modify the release flags."
  [_route-params
   _query-params
   flags :- schema/StatusMap]
  (api/check-superuser)
  (models/update-statuses! flags)
  (models/all-flags))
