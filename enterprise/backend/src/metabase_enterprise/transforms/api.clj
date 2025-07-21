(ns metabase-enterprise.transforms.api
  (:require
   [metabase-enterprise.transforms.execute :as transforms.execute]
   [metabase.api.common :as api]
   [metabase.api.macros :as api.macros]
   [metabase.api.routes.common :refer [+auth]]
   [metabase.api.util.handlers :as handlers]
   [metabase.driver :as driver]
   [metabase.permissions.core :as perms]
   [metabase.query-processor.compile :as qp.compile]
   [metabase.util.log :as log]
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

(comment
  ;; Examples
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

(api.macros/defendpoint :get "/"
  "Get a list of transforms."
  [_route-params
   _query-params]
  (t2/select :model/Transform))

(api.macros/defendpoint :post "/"
  [_route-params
   _query-params
   {:keys [name source target] :as _body} :- [:map
                                              [:name :string]
                                              [:source ::transform-source]
                                              [:target ::transform-target]]]
  (let [id (t2/insert-returning-pk! :model/Transform {:name name
                                                      :source source
                                                      :target target})]
    (t2/select-one :model/Transform id)))

(api.macros/defendpoint :get "/:id"
  [{:keys [id]}]
  (log/info "get transform" id)
  (t2/select-one :model/Transform id))

(api.macros/defendpoint :put "/:id"
  [{:keys [id]}
   _query-params
   {:keys [name source target] :as _body} :- [:map
                                              [:name :string]
                                              [:source ::transform-source]
                                              [:target ::transform-target]]]
  (log/info "put transform" id)
  (t2/update! :model/Transform id {:name name
                                   :source source
                                   :target target}))

(defn- delete-target-table! [id]
  (let [{:keys [_name _source target]} (t2/select-one :model/Transform id)
        {:keys [database table]} target
        {driver :engine} (t2/select-one :model/Database database)]
    (driver/drop-table! driver database table)))

(api.macros/defendpoint :delete "/:id"
  [{:keys [id]}]
  (log/info "delete transform" id)
  (delete-target-table! id)
  (t2/delete! :model/Transform id))

(api.macros/defendpoint :delete "/:id/table"
  [{:keys [id]}]
  (log/info "delete transform target table" id)
  (delete-target-table! id))

(defn- compile-source [{query-type :type :as source}]
  (case query-type
    "query" (:query (qp.compile/compile-with-inline-parameters (:query source)))))

(api.macros/defendpoint :post "/:id/execute"
  [{:keys [id]}]
  (log/info "execute transform" id)
  (let [{:keys [_name source target]} (t2/select-one :model/Transform id)
        db (get-in source [:query :database])
        {driver :engine} (t2/select-one :model/Database db)]
    (when (not= (perms/full-db-permission-for-user api/*current-user-id* :perms/create-queries db)
                :query-builder-and-native)
      (api/throw-403))
    (transforms.execute/execute
     {:db db
      :driver driver
      :sql (compile-source source)
      :output-table (:table target)
      :overwrite? true})))

(def ^{:arglists '([request respond raise])} routes
  "`/api/ee/transform` routes."
  (handlers/routes
   (api.macros/ns-handler *ns* +auth)))
