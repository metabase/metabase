(ns metabase-enterprise.transforms.api
  (:require
   [metabase-enterprise.transforms.execute :as transforms.execute]
   [metabase.api.macros :as api.macros]
   [metabase.api.routes.common :refer [+auth]]
   [metabase.api.util.handlers :as handlers]
   [metabase.query-processor.compile :as qp.compile]
   [metabase.util.malli.registry :as mr]
   [toucan2.core :as t2]))

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

(api.macros/defendpoint :get "/:id"
  [{:keys [id]}]
  (prn "get transform" id)
  {:id 1
   :name "Gadget Products"
   :source {:type "query"
            :query {:database 1
                    :type "native",
                    :native {:query "SELECT * FROM PRODUCTS WHERE CATEGORY = 'Gadget'"
                             :template-tags {}}}}
   :target {:type "table"
            :database 1
            :schema "transforms"
            :table "gadget_products"}})

(api.macros/defendpoint :put "/:id"
  [{:keys [id]}
   _query-params
   {:keys [_name _source _target] :as _body} :- [:map
                                                 [:name :string]
                                                 [:source ::transform-source]
                                                 [:target ::transform-target]]]
  (prn "put transform" id)
  _body)

(api.macros/defendpoint :delete "/:id"
  [{:keys [id]}]
  (prn "delete transform" id)
  "success")

(api.macros/defendpoint :post "/:id/execute"
  [{:keys [id]}]
  (prn "execute transform" id)
  (let [{:keys [name source target]}
        {:id 1
         :name "Gadget Products"
         :source {:type "query"
                  :query {:database 1
                          :type "native",
                          :native {:query "SELECT * FROM PRODUCTS WHERE CATEGORY = 'Gadget'"
                                   :template-tags {}}}}
         :target {:type "table"
                  :database 1
                  :schema "transforms"
                  :table "gadget_products"}}

        db (get-in source [:query :database])
        {driver :engine} (t2/select-one :model/Database db)]
    (transforms.execute/execute
     {:db db
      :driver driver
      :sql (:query (qp.compile/compile-with-inline-parameters source))
      :output-table (:table target)
      :overwrite? true})))

(def ^{:arglists '([request respond raise])} routes
  "`/api/ee/transform` routes."
  (handlers/routes
   (api.macros/ns-handler *ns* +auth)))
