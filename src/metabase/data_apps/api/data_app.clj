(ns metabase.data-apps.api.data-app
  "/api/data-app endpoints for data apps CRUD operations"
  (:require
   [honey.sql.helpers :as sql.helpers]
   [metabase.api.common :as api]
   [metabase.api.macros :as api.macros]
   [metabase.data-apps.models :as data-apps.models]
   [metabase.request.core :as request]
   [metabase.util :as u]
   [metabase.util.malli.schema :as ms]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(defn- get-data-app
  "Get a data app by id with latest definitions and release info."
  [id]
  (let [data-app (api/read-check (t2/select-one :model/DataApp id))]
    (assoc data-app
           :latest_definition (data-apps.models/latest-definition id)
           :released_definition (data-apps.models/released-definition id)
           :latest_release (data-apps.models/latest-release id))))

(defn- data-app-clauses
  "Honeysql clauses for filtering data apps with status and pagination"
  [status limit offset]
  (cond-> {}
    (some? status) (sql.helpers/where [:= :status (keyword status)])
    (some? limit) (sql.helpers/limit limit)
    (some? offset) (sql.helpers/offset offset)))

(defn- filter-clauses-without-paging
  "Given a where clause, return a clause that can be used to count."
  [clauses]
  (dissoc clauses :order-by :limit :offset))

(api.macros/defendpoint :get "/"
  "List all data apps. Optionally filter by status.

  Takes `limit`, `offset` for pagination."
  [_route-params
   {:keys [status]} :- [:map
                        [:status {:optional true} [:maybe [:enum "private" "published" "archived"]]]]]
  (let [limit   (request/limit)
        offset  (request/offset)
        clauses (data-app-clauses status limit offset)]
    {:data (t2/select :model/DataApp
                      (sql.helpers/order-by clauses
                                            [:created_at :desc]
                                            [:id :asc]))
     :total (t2/count :model/DataApp (filter-clauses-without-paging clauses))
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
                          [:description {:optional true} [:maybe :string]]
                          [:definition {:optional true} [:maybe :map]]]]
  (api/create-check :model/DataApp body)
  (data-apps.models/create-app! (assoc body :creator_id api/*current-user-id*)))

(api.macros/defendpoint :put "/:id"
  "Update an existing data app."
  [{:keys [id]} :- [:map [:id ms/PositiveInt]]
   _query
   body :- [:map
            [:name {:optional true} ms/NonBlankString]
            [:description {:optional true} [:maybe :string]]]]
  (let [existing-data-app (get-data-app id)]
    (api/update-check existing-data-app body)
    (t2/update! :model/DataApp id body)
    (get-data-app id)))

(api.macros/defendpoint :delete "/:id"
  "Soft delete a data app."
  [{:keys [id]} :- [:map [:id ms/PositiveInt]]]
  (get-data-app id)
  (t2/update! :model/DataApp id {:status :archived})
  api/generic-204-no-content)

(api.macros/defendpoint :post "/:id/definition"
  "Create a new definition version for a data app."
  [{:keys [id]} :- [:map [:id ms/PositiveInt]]
   _query
   body]
  (let [data-app (get-data-app id)]
    (api/update-check data-app {})
    (data-apps.models/new-definition! id body)))

(api.macros/defendpoint :post "/:id/release"
  "Release a specific definition version of a data app."
  [{:keys [id]} :- [:map [:id ms/PositiveInt]]
   _query
   body :- [:map
            [:definition_id ms/PositiveInt]]]
  ;; should we assume that we always release the latest definition?
  (let [data-app (get-data-app id)
        definition-id (:definition_id body)]
    (api/update-check data-app {})
    (api/check-404 (t2/select-one :model/DataAppDefinition :id definition-id :app_id id))
    (data-apps.models/release! id definition-id)))
