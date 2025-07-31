(ns metabase-enterprise.transforms.api
  (:require
   [metabase-enterprise.transforms.execute :as transforms.execute]
   [metabase-enterprise.transforms.util :as transforms.util]
   [metabase.api.common :as api]
   [metabase.api.macros :as api.macros]
   [metabase.api.routes.common :refer [+auth]]
   [metabase.api.util.handlers :as handlers]
   [metabase.driver.util :as driver.u]
   [metabase.util.i18n :refer [deferred-tru]]
   [metabase.util.log :as log]
   [metabase.util.malli.registry :as mr]
   [metabase.util.malli.schema :as ms]
   [ring.util.response :as response]
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
   [:name :string]])

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
             :name "gadget_products"}}]
  -)

(defn- source-database-id
  [transform]
  (-> transform :source :query :database))

(defn- check-database-feature
  [transform]
  (let [database (api/check-400 (t2/select-one :model/Database (source-database-id transform))
                                (deferred-tru "The source database cannot be found."))
        feature (transforms.util/required-database-feature transform)]
    (api/check-400 (driver.u/supports? (:engine database) feature database)
                   (deferred-tru "The database does not support the requested transform target type."))))

(api.macros/defendpoint :get "/"
  "Get a list of transforms."
  [_route-params
   _query-params]
  (api/check-superuser)
  (t2/select :model/Transform))

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
  (check-database-feature body)
  (when (transforms.util/target-table-exists? body)
    (api/throw-403))
  (t2/insert-returning-instance!
   :model/Transform (select-keys body [:name :description :source :target :schedule])))

(api.macros/defendpoint :get "/:id"
  [{:keys [id]} :- [:map
                    [:id ms/PositiveInt]]]
  (log/info "get transform" id)
  (api/check-superuser)
  (let [{:keys [target] :as transform} (api/check-404 (t2/select-one :model/Transform id))
        database-id (source-database-id transform)]
    (assoc transform :table (transforms.util/target-table database-id target))))

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
        target-fields #(-> % :target (select-keys [:schema :name]))]
    (check-database-feature new)
    (when (and (not= (target-fields old) (target-fields new))
               (transforms.util/target-table-exists? new))
      (api/throw-403)))
  (t2/update! :model/Transform id body)
  (t2/select-one :model/Transform id))

(api.macros/defendpoint :delete "/:id"
  [{:keys [id]} :- [:map
                    [:id ms/PositiveInt]]]
  (log/info "delete transform" id)
  (api/check-superuser)
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
  (let [transform (api/check-404 (t2/select-one :model/Transform id))
        start-promise (promise)]
    (future
      (transforms.execute/execute-mbql-transform! transform {:start-promise start-promise}))
    (when (instance? Throwable @start-promise)
      (throw @start-promise))
    (-> (response/response {:message (deferred-tru "Transform execution started")})
        (assoc :status 202))))

(def ^{:arglists '([request respond raise])} routes
  "`/api/ee/transform` routes."
  (handlers/routes
   (api.macros/ns-handler *ns* +auth)))
