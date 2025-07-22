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
             :database 1
             :schema "transforms"
             :table "gadget_products"}}]
  -)

(defn- qualified-table-name
  [driver {:keys [schema table]}]
  (cond->> (driver/escape-alias driver table)
    (string? schema) (str (driver/escape-alias driver schema) ".")))

(defn- target-table-exists?
  [{:keys [source target] :as _transform}]
  (let [db-id (-> source :query :database)
        database (t2/select-one :model/Database db-id)
        driver (:engine database)
        needle ((juxt :schema :table) target)
        normalize-fn (juxt :schema :name)]
    (some #(= (normalize-fn %) needle)
          (:tables (driver/describe-database driver database)))))

(defn- delete-target-table!
  [{:keys [source target] :as _transform}]
  (let [database (-> source :query :database)
        driver (t2/select-one-fn :engine :model/Database database)]
    (driver/drop-table! driver database (qualified-table-name driver target))))

(defn- delete-target-table-by-id!
  [transform-id]
  (delete-target-table! (t2/select-one :model/Transform transform-id)))

(api.macros/defendpoint :get "/"
  "Get a list of transforms."
  [_route-params
   _query-params]
  (t2/select :model/Transform))

(api.macros/defendpoint :post "/"
  [_route-params
   _query-params
   {:keys [name source target] :as body} :- [:map
                                             [:name :string]
                                             [:source ::transform-source]
                                             [:target ::transform-target]]]
  (when (target-table-exists? body)
    (api/throw-403))
  (let [id (t2/insert-returning-pk! :model/Transform {:name name
                                                      :source source
                                                      :target target})]
    (t2/select-one :model/Transform id)))

(api.macros/defendpoint :get "/:id"
  [{:keys [id]} :- [:map
                    [:id ms/PositiveInt]]]
  (log/info "get transform" id)
  (t2/select-one :model/Transform id))

(api.macros/defendpoint :put "/:id"
  [{:keys [id]} :- [:map
                    [:id ms/PositiveInt]]
   _query-params
   body :- [:map
            [:name {:optional true} :string]
            [:source {:optional true} ::transform-source]
            [:target {:optional true} ::transform-target]]]
  (log/info "put transform" id)
  (let [old (t2/select-one-fn :target :model/Transform id)
        new (merge old body)]
    (when (not= (select-keys (:target old) [:schema :table])
                (select-keys (:target new) [:schema :table]))
      (when (target-table-exists? new)
        (api/throw-403))
      (delete-target-table! old)))
  (t2/update! :model/Transform id body)
  (t2/select-one :model/Transform id))

(api.macros/defendpoint :delete "/:id"
  [{:keys [id]} :- [:map
                    [:id ms/PositiveInt]]]
  (log/info "delete transform" id)
  #_(delete-target-table-by-id! id)
  (t2/delete! :model/Transform id)
  nil)

(api.macros/defendpoint :delete "/:id/table"
  [{:keys [id]} :- [:map
                    [:id ms/PositiveInt]]]
  (log/info "delete transform target table" id)
  (delete-target-table-by-id! id))

(defn- compile-source [{query-type :type :as source}]
  (case query-type
    "query" (:query (qp.compile/compile-with-inline-parameters (:query source)))))

(api.macros/defendpoint :post "/:id/execute"
  [{:keys [id]} :- [:map
                    [:id ms/PositiveInt]]]
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
      :output-table (qualified-table-name driver target)
      :overwrite? true})))

(def ^{:arglists '([request respond raise])} routes
  "`/api/ee/transform` routes."
  (handlers/routes
   (api.macros/ns-handler *ns* +auth)))
