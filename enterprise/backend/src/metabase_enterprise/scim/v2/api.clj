(ns metabase-enterprise.scim.v2.api
  "/api/ee/scim/v2/ endpoints. These are the endpoints which implement the SCIM protocol, as opposed to SCIM
  configuration endpoints which are in `metabase-enterprise.scim.api`."
  (:require
   [compojure.core :refer [GET]]
   [metabase.api.common :as api :refer [defendpoint]]
   [toucan2.core :as t2]))

(defendpoint GET "/Users"
  "Fetches a list of users."
  []
  (t2/select :model/User))

(api/define-routes)
