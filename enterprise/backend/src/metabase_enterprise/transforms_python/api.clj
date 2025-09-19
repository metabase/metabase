(ns metabase-enterprise.transforms-python.api
  (:require
   [metabase-enterprise.transforms-python.models.python-library :as python-library]
   [metabase.api.common :as api]
   [metabase.api.macros :as api.macros]
   [metabase.api.routes.common :refer [+auth]]
   [metabase.api.util.handlers :as handlers]))

(api.macros/defendpoint :get "/library/:path"
  "Get the Python library for user modules."
  [{:keys [path]} :- [:map [:path :string]]
   _query-params]
  (api/check-superuser)
  (-> (python-library/get-python-library-by-path path)
      api/check-404
      (select-keys [:source :path :created_at :updated_at])))

(api.macros/defendpoint :put "/library/:path"
  "Update the Python library source code for user modules."
  [{:keys [path]} :- [:map [:path :string]]
   _query-params
   body :- [:map {:closed true}
            [:source :string]]]
  (api/check-superuser)
  (python-library/update-python-library-source! path (:source body)))

(def ^{:arglists '([request respond raise])} routes
  "`/api/ee/transforms-python` routes."
  (handlers/routes
   (api.macros/ns-handler *ns* +auth)))
