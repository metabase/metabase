(ns metabase-enterprise.data-apps.core
  "What other modules may ask the data-apps module: where an app's files live, what the files of its collection may
  hold, and the tables those read."
  (:require
   [metabase-enterprise.data-apps.access :as data-app.access]
   [metabase-enterprise.data-apps.config :as data-apps.config]
   [metabase-enterprise.data-apps.db :as data-apps.db]
   [metabase-enterprise.data-apps.resource-tables :as resource-tables]
   [metabase-enterprise.data-apps.resource-validation :as resource-validation]
   [metabase.api.common :as api]
   [metabase.premium-features.core :refer [defenterprise]]
   [potemkin :as p]))

(p/import-vars
 [data-apps.config
  apps-dir]
 [resource-tables
  record-table-dependencies!]
 [resource-validation
  problems
  warnings])

(defenterprise check-data-app-access!
  "Checks that the user belongs to one of the assigned groups"
  :feature :data-apps
  [request]
  (let [app (api/check-404 (data-apps.db/enabled-data-app-by-slug (get-in request [:route-params :name])))]
    (api/check-403 (data-app.access/can-read? {:user-id (:metabase-user-id request)
                                               :superuser? (:is-superuser? request)}
                                              (:id app)))))
