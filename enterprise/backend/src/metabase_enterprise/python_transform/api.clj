(ns metabase-enterprise.python-transform.api
  (:require
   [metabase-enterprise.python-transform.models.python-library :as python-library]
   [metabase.api.common :as api]
   [metabase.api.macros :as api.macros]
   [metabase.api.routes.common :refer [+auth]]
   [metabase.api.util.handlers :as handlers]))

(api.macros/defendpoint :get "/user-modules/code"
  "Get the Python library for user modules."
  [_route-params
   _query-params]
  (api/check-superuser)
  (python-library/get-python-library))

(api.macros/defendpoint :put "/user-modules/code"
  "Update the Python library source code for user modules."
  [_route-params
   _query-params
   body :- [:map {:closed true}
            [:source [:string {:min 0}]]]]
  (api/check-superuser)
  (python-library/update-python-library-source! (:source body)))

(def ^{:arglists '([request respond raise])} routes
  "`/api/ee/python-transform` routes."
  (handlers/routes
   (api.macros/ns-handler *ns* +auth)))
