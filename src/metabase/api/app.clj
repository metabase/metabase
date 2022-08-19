(ns metabase.api.app
  (:require
    [compojure.core :refer [POST PUT]]
    [metabase.api.common :as api]
    [metabase.models :refer [App Collection]]
    [metabase.models.collection :as collection]
    [metabase.util.schema :as su]
    [schema.core :as s]
    [toucan.db :as db]
    [toucan.hydrate :refer [hydrate]]))

(api/defendpoint POST "/"
  "Endpoint to create an app"
  [:as {{:keys [collection_id dashboard_id options nav_items] :as body} :body}]
  {collection_id su/IntGreaterThanOrEqualToZero
   dashboard_id (s/maybe su/IntGreaterThanOrEqualToZero)
   options (s/maybe su/Map)
   nav_items (s/maybe [(s/maybe su/Map)])}
  (api/write-check Collection collection_id)
  (api/check (not (db/select-one-id App :collection_id collection_id))
    [400 "An App already exists on this Collection"])
  (let [app (db/insert! App (select-keys body [:dashboard_id :collection_id :options :nav_items]))]
    (hydrate app :collection)))

(api/defendpoint PUT "/:app-id"
  "Endpoint to change an app"
  [app-id :as {{:keys [dashboard_id options nav_items] :as body} :body}]
  {app-id su/IntGreaterThanOrEqualToZero
   dashboard_id (s/maybe su/IntGreaterThanOrEqualToZero)
   options (s/maybe su/Map)
   nav_items (s/maybe [(s/maybe su/Map)])}
  (api/write-check Collection (db/select-one-field :collection_id App :id app-id))
  (db/update! App app-id (select-keys body [:dashboard_id :options :nav_items]))
  (hydrate (App app-id) :collection))

;; TODO handle personal collections, see collection/personal-collection-with-ui-details
(api/defendpoint GET "/"
  "Fetch a list of all Apps that the current user has read permissions for.

  By default, this returns Apps with non-archived Collections, but instead you can show archived ones by passing
  `?archived=true`."
  [archived]
  {archived (s/maybe su/BooleanString)}
  (let [archived? (Boolean/parseBoolean archived)]
    (-> (db/select [App :app.*]
          {:left-join [:collection [:= :collection.id :app.collection_id]]
           :where    [:and
                      [:= :collection.archived archived?]
                      (collection/visible-collection-ids->honeysql-filter-clause
                       (collection/permissions-set->visible-collection-ids @api/*current-user-permissions-set*))]
           :order-by [[:%lower.collection.name :asc]]})
        (hydrate :collection))))

(api/defendpoint GET "/:id"
  "Fetch a specific App"
  [id]
  (hydrate (api/read-check App id) :collection))

(api/define-routes)
