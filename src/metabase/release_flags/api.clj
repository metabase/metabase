(ns metabase.release-flags.api
  "/api/release-flags endpoints."
  (:require
   [metabase.api.common :as api]
   [metabase.api.macros :as api.macros]
   [metabase.release-flags.models :as models]
   [metabase.release-flags.schema :as schema]))

(api.macros/defendpoint :get "/" :- schema/FlagMap
  "Return the status of all feature flags.
  Returns an empty map in prod mode."
  []
  (if (models/release-flags-enabled?)
    (models/all-flags)
    {}))

(api.macros/defendpoint :put "/" :- schema/FlagMap
  "Modify the release flags."
  [_route-params
   _query-params
   flags :- schema/StatusMap]
  (api/check-superuser)
  (models/update-statuses! flags)
  (models/all-flags))
