(ns metabase.api.app
  (:require
    [compojure.core :refer [POST PUT]]
    [metabase.api.collection :as api.collection]
    [metabase.api.common :as api]
    [metabase.models :refer [App Collection]]
    [metabase.models.collection :as collection]
    [metabase.util.schema :as su]
    [schema.core :as s]
    [toucan.db :as db]
    [toucan.hydrate :refer [hydrate]]))

(defn- hydrate-details [apps]
  (hydrate apps [:collection :can_write]))

(api/defendpoint POST "/"
  "Endpoint to create an app"
  [:as {{:keys [collection dashboard_id options nav_items]
         {:keys [name color description namespace authority_level]} :collection
         :as body} :body}]
  {dashboard_id    (s/maybe su/IntGreaterThanOrEqualToZero)
   options         (s/maybe su/Map)
   nav_items       (s/maybe [(s/maybe su/Map)])
   name            su/NonBlankString
   color           collection/hex-color-regex
   description     (s/maybe su/NonBlankString)
   namespace       (s/maybe su/NonBlankString)
   authority_level collection/AuthorityLevel}
  (db/transaction
   (let [coll-params (select-keys collection [:name :color :description :namespace :authority_level])
         collection-instance (api.collection/create-collection! coll-params)
         app-params (-> body
                        (select-keys [:dashboard_id :options :nav_items])
                        (assoc :collection_id (:id collection-instance)))
         app (db/insert! App app-params)]
     (hydrate-details app))))

(api/defendpoint PUT "/:app-id"
  "Endpoint to change an app"
  [app-id :as {{:keys [dashboard_id options nav_items] :as body} :body}]
  {app-id su/IntGreaterThanOrEqualToZero
   dashboard_id (s/maybe su/IntGreaterThanOrEqualToZero)
   options (s/maybe su/Map)
   nav_items (s/maybe [(s/maybe su/Map)])}
  (api/write-check Collection (db/select-one-field :collection_id App :id app-id))
  (db/update! App app-id (select-keys body [:dashboard_id :options :nav_items]))
  (hydrate-details (db/select-one App :id app-id)))

(api/defendpoint GET "/"
  "Fetch a list of all Apps that the current user has read permissions for.

  By default, this returns Apps with non-archived Collections, but instead you can show archived ones by passing
  `?archived=true`."
  [archived]
  {archived (s/maybe su/BooleanString)}
  (let [archived? (Boolean/parseBoolean archived)]
    (hydrate-details
     (db/select [App :app.*]
       {:left-join [:collection [:= :collection.id :app.collection_id]]
        :where    [:and
                   [:= :collection.archived archived?]
                   (collection/visible-collection-ids->honeysql-filter-clause
                    (collection/permissions-set->visible-collection-ids @api/*current-user-permissions-set*))]
        :order-by [[:%lower.collection.name :asc]]}))))

(api/defendpoint GET "/:id"
  "Fetch a specific App"
  [id]
  (hydrate-details (api/read-check App id)))

(api/define-routes)
