(ns metabase.api.app
  (:require
    [compojure.core :refer [POST PUT]]
    [metabase.api.common :as api]
    [metabase.models :refer [App AppNavItem Collection]]
    [metabase.util.schema :as su]
    [schema.core :as s]
    [toucan.db :as db]
    [toucan.hydrate :refer [hydrate]]))

(api/defendpoint POST "/"
  "Endpoint to create an app"
  [:as {{:keys [collection_id dashboard_id options nav-items] :as body} :body}]
  {collection_id su/IntGreaterThanOrEqualToZero
   dashboard_id (s/maybe su/IntGreaterThanOrEqualToZero)
   options (s/maybe su/Map)
   nav-items (s/maybe [{:options (s/maybe su/Map)}])}
  (api/write-check Collection collection_id)
  (api/check
    (not (db/select-one-id App :collection_id collection_id))
    400 "An App already exists on this Collection")
  (let [app (db/insert! App (select-keys body [:dashboard_id :collection_id :options]))]
    (when (seq nav-items)
      (db/insert-many! AppNavItem (for [nav-item nav-items]
                                    (-> nav-item
                                        (select-keys [:options])
                                        (assoc :app_id (:id app))))))
   (hydrate app :app/nav-items :collection)))

(api/defendpoint PUT "/:app-id"
  "Endpoint to change an app"
  [app-id :as {{:keys [dashboard_id options nav-items] :as body} :body}]
  {app-id su/IntGreaterThanOrEqualToZero
   dashboard_id (s/maybe su/IntGreaterThanOrEqualToZero)
   options (s/maybe su/Map)
   nav-items (s/maybe [{:options (s/maybe su/Map)}])}
  (api/write-check Collection (db/select-one-field :collection_id App :id app-id))
  (when nav-items
    (db/delete! AppNavItem :app-id app-id)
    (when (seq nav-items)
      (db/insert-many! AppNavItem (for [nav-item nav-items]
                                    (-> nav-item
                                        (select-keys [:options])
                                        (assoc :app_id app-id))))))
  (db/update! App app-id (select-keys body [:dashboard_id :options]))
  (hydrate (App app-id) :app/nav-items :collection))

(api/define-routes)
