(ns metabase-enterprise.transforms.api
  (:require
   [metabase-enterprise.transforms.execute :as transforms.execute]
   [metabase-enterprise.transforms.util :as transforms.util]
   [metabase.api.common :as api]
   [metabase.api.macros :as api.macros]
   [metabase.api.routes.common :refer [+auth]]
   [metabase.api.util.handlers :as handlers]
   [metabase.util.log :as log]
   [metabase.util.malli.registry :as mr]
   [metabase.util.malli.schema :as ms]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(mr/def ::transform-source
  [:map
   [:type [:= "query"]]
   [:query [:map [:database :int]]]])

(mr/def ::transform-target
  [:map
   [:type [:= "table"]]
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
             :schema "transforms"
             :table "gadget_products"}}]
  -)

(api.macros/defendpoint :get "/"
  "Get a list of transforms."
  [_route-params
   {database-id :database_id} :- [:map [:database_id {:optional true} [:maybe ms/PositiveInt]]]]
  (api/check-superuser)

  (t2/select :model/Transform (cond-> {}
                                database-id (assoc :where [:= :database_id database-id]))))

(api.macros/defendpoint :post "/"
  [_route-params
   _query-params
   body :- [:map
            [:name :string]
            [:description {:optional true} [:maybe :string]]
            [:source ::transform-source]
            [:target ::transform-target]
            [:schedule {:optional true} [:maybe :string]]]]
  (api/check-superuser)
  (when (transforms.util/target-table-exists? body)
    (api/throw-403))
  (let [transform (t2/insert-returning-instance!
                   :model/Transform (select-keys body [:name :description :source :target :schedule]))]
    (transforms.execute/exec-transform transform)
    transform))

(api.macros/defendpoint :get "/:id"
  [{:keys [id]} :- [:map
                    [:id ms/PositiveInt]]]
  (log/info "get transform" id)
  (api/check-superuser)
  (let [transform (api/check-404 (t2/select-one :model/Transform id))
        database-id (-> transform :source :query :database)]
    (assoc transform :table (transforms.util/target-table database-id (:target transform)))))

(api.macros/defendpoint :put "/:id"
  [{:keys [id]} :- [:map
                    [:id ms/PositiveInt]]
   _query-params
   body :- [:map
            [:name {:optional true} :string]
            [:description {:optional true} [:maybe :string]]
            [:source {:optional true} ::transform-source]
            [:target {:optional true} ::transform-target]
            [:schedule {:optional true} [:maybe :string]]]]
  (log/info "put transform" id)
  (api/check-superuser)
  (let [old (t2/select-one :model/Transform id)
        new (merge old body)
        target-fields #(-> % :target (select-keys [:schema :table]))
        query-fields #(select-keys % [:source :target])]
    (when (and (not= (target-fields old) (target-fields new))
               (transforms.util/target-table-exists? new))
      (api/throw-403))
    (when (not= (query-fields new) (query-fields old))
      (transforms.util/delete-target-table! old)))
  (t2/update! :model/Transform id body)
  (let [transform (t2/select-one :model/Transform id)]
    (transforms.execute/exec-transform transform)
    transform))

(api.macros/defendpoint :delete "/:id"
  [{:keys [id]} :- [:map
                    [:id ms/PositiveInt]]]
  (log/info "delete transform" id)
  (api/check-superuser)
  (transforms.util/delete-target-table-by-id! id)
  (t2/delete! :model/Transform id)
  nil)

(api.macros/defendpoint :delete "/:id/table"
  [{:keys [id]} :- [:map
                    [:id ms/PositiveInt]]]
  (log/info "delete transform target table" id)
  (api/check-superuser)
  (transforms.util/delete-target-table-by-id! id)
  nil)

(api.macros/defendpoint :post "/:id/execute"
  [{:keys [id]} :- [:map
                    [:id ms/PositiveInt]]]
  (log/info "execute transform" id)
  (api/check-superuser)
  (transforms.execute/exec-transform (t2/select-one :model/Transform id))
  nil)

(def ^{:arglists '([request respond raise])} routes
  "`/api/ee/transform` routes."
  (handlers/routes
   (api.macros/ns-handler *ns* +auth)))
