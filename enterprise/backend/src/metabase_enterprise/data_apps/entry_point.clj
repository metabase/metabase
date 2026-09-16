(ns metabase-enterprise.data-apps.entry-point
  (:require
   [metabase-enterprise.data-apps.db :as data-apps.db]
   [metabase.api.common :as api]
   [metabase.premium-features.core :refer [defenterprise]]))

(defenterprise check-data-app-access!
  "Require an explicit assignment before serving app HTML."
  :feature :data-apps-preview
  [request]
  (let [app (api/check-404 (data-apps.db/enabled-non-blob-data-app-by-slug (get-in request [:route-params :name])))]
    (api/check-403 (or (:is-superuser? request)
                       (contains? (data-apps.db/accessible-app-ids (:metabase-user-id request)) (:id app))))))
