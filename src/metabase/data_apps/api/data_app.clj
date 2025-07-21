(ns metabase.data-apps.api.data-app
  "/api/data-app endpoints for data apps CRUD operations"
  (:require
   [honey.sql.helpers :as sql.helpers]
   [metabase.api.common :as api]
   [metabase.api.macros :as api.macros]
   [metabase.data-apps.models :as data-apps.models]
   [metabase.request.core :as request]
   [metabase.util.malli.schema :as ms]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(defn- get-data-app
  "Get a data app by id with latest definitions and release info."
  [id]
  (let [data-app (api/read-check (t2/select-one :model/DataApp id))]
    (assoc data-app
           :definition (data-apps.models/latest-definition id)
           ;; app_definition_id is only needed for testing
           :release    (some-> (data-apps.models/latest-release id)
                               (select-keys [:id :app_definition_id :created_at])))))

(defn- data-app-clauses
  "Honeysql clauses for filtering data apps with status and pagination"
  [limit offset]
  (cond-> {}
    true           (sql.helpers/where [:!= :status "archived"])
    (some? limit) (sql.helpers/limit limit)
    (some? offset) (sql.helpers/offset offset)))

(api.macros/defendpoint :get "/"
  "List all data apps. Optionally filter by status.

  Takes `limit`, `offset` for pagination."
  [_route-params]
  (let [limit   (request/limit)
        offset  (request/offset)
        clauses (data-app-clauses limit offset)]
    {:data (t2/select :model/DataApp
                      (sql.helpers/order-by clauses
                                            [:created_at :desc]
                                            [:id :desc]))
     :total (t2/count :model/DataApp (dissoc clauses :order-by :limit :offset))
     :limit limit
     :offset offset}))

(api.macros/defendpoint :get "/:id"
  "Get a specific data app by ID with latest definitions and release info."
  [{:keys [id]} :- [:map [:id ms/PositiveInt]]]
  (get-data-app id))

(api.macros/defendpoint :post "/"
  "Create a new data app with optional initial definition."
  [_route _query body :- [:map
                          [:name ms/NonBlankString]
                          [:slug ms/NonBlankString]
                          [:description {:optional true} [:maybe :string]]
                          [:definition {:optional true} [:maybe :map]]]]
  (api/create-check :model/DataApp body)
  (data-apps.models/create-app! (assoc body :creator_id api/*current-user-id*)))

(api.macros/defendpoint :put "/:id"
  "Update an existing data app."
  [{:keys [id]} :- [:map [:id ms/PositiveInt]]
   _query
   body :- [:map {:closed true}
            [:name        {:optional true} ms/NonBlankString]
            [:slug        {:optional true} ms/NonBlankString]
            [:description {:optional true} [:maybe :string]]]]
  (let [existing-data-app (get-data-app id)]
    (api/update-check existing-data-app body)
    (t2/update! :model/DataApp id body)
    (get-data-app id)))

(api.macros/defendpoint :put "/:id/status"
  "Change the status of an app."
  [{:keys [id]} :- [:map [:id ms/PositiveInt]]
   _query
   body :- [:map {:closed true}
            [:status :keyword]]]
  (let [existing-data-app (api/check-404 (t2/select-one :model/DataApp id))]
    (api/update-check existing-data-app body)
    (t2/update! :model/DataApp id body)
    (get-data-app id)))

(api.macros/defendpoint :put "/:id/definition"
  "Create a new definition version for a data app."
  [{:keys [id]} :- [:map [:id ms/PositiveInt]]
   _query
   body]
  (let [existing-data-app (api/read-check (t2/select-one :model/DataApp id))]
    (api/update-check existing-data-app {})
    (data-apps.models/set-latest-definition! id (assoc body :creator_id api/*current-user-id*))))

(api.macros/defendpoint :post "/:id/release"
  "Release the latest definition version of a data app."
  [{:keys [id]} :- [:map [:id ms/PositiveInt]]
   _query
   _body]
  (let [existing-data-app (api/read-check (t2/select-one :model/DataApp id))]
    (api/update-check existing-data-app {})
    (data-apps.models/release! id api/*current-user-id*)))
