(ns metabase-enterprise.data-apps.core
  (:require
   [metabase-enterprise.data-apps.access :as data-app.access]
   [metabase-enterprise.data-apps.db :as data-apps.db]
   [metabase.api.common :as api]
   [metabase.premium-features.core :refer [defenterprise]]))

(defenterprise check-data-app-access!
  "Checks that the user belongs to one of the assigned groups"
  :feature :data-apps
  [request]
  (let [app (api/check-404 (data-apps.db/enabled-non-blob-data-app-by-slug (get-in request [:route-params :name])))]
    (api/check-403 (data-app.access/can-read? {:user-id (:metabase-user-id request)
                                               :superuser? (:is-superuser? request)}
                                              (:id app)))))
