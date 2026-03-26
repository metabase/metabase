(ns metabase.transforms-rest.api.transform-import
  (:require
    [metabase.api.common :as api]
    [metabase.api.macros :as api.macros]
    [metabase.api.routes.common :refer [+auth]]
    [metabase.transforms-import.dbt.core :as transforms-import.dbt]))

(api.macros/defendpoint :post "/" :- [:map
                                      [:status [:= 202]]
                                      [:body [:map {:closed true}]]]
  "Import transforms from dbt manifest."
  [_route-params
   _query-params
   {:keys [config manifest]} :- [:map
                                 [:config [:map
                                           [:dbt [:map
                                                  [:target :string]]]
                                           [:metabase [:map
                                                       [:database_id :int]]]]]
                                 [:manifest [:map {:closed false}]]]]
  (println config manifest)
  (api/check-superuser)
  (let []
    (transforms-import.dbt/migrate config manifest)
    {:status 202
     :body   {}}))

(def ^{:arglists '([request respond raise])} routes
  "`/api/transform-import` routes."
  (api.macros/ns-handler *ns* +auth))
