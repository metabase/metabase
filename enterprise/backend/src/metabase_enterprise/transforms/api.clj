(ns metabase-enterprise.transforms.api
  (:require
   [metabase.api.macros :as api.macros]
   [metabase.api.routes.common :refer [+auth]]
   [metabase.api.util.handlers :as handlers]
   [metabase.util.malli.registry :as mr]))

(mr/def ::transform-source
  [:map
   [:type [:= "query"]]
   [:query [:map [:database :int]]]])

(mr/def ::transform-target
  [:map
   [:type [:= "table"]]
   [:database :int]
   [:schema {:optional true} :string]
   [:table :string]])

(api.macros/defendpoint :get "/"
  "Get a list of transforms."
  [_route-params
   _query-params]
  [{:id 1
    :name "Gadget Products"
    :source {:type "query"
             :query {:database 1
                     :type "native",
                     :native {:query "SELECT * FROM PRODUCTS WHERE CATEGORY = 'Gadget'"
                              :template-tags {}}}}
    :target {:type "table"
             :database 1
             :schema "transforms"
             :table "gadget_products"}}])

(api.macros/defendpoint :post "/"
  [_route-params
   _query-params
   {:keys [_name _source _target] :as _body} :- [:map
                                                 [:name :string]
                                                 [:source ::transform-source]
                                                 [:target ::transform-target]]]
  _body)

(def ^{:arglists '([request respond raise])} routes
  "`/api/ee/transform` routes."
  (handlers/routes
   (api.macros/ns-handler *ns* +auth)))
