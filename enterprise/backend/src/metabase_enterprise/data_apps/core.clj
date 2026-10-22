(ns metabase-enterprise.data-apps.core
  "What other modules may ask the data-apps module: what the files of an app's collection may hold, and the tables
  those read."
  (:require
   [metabase-enterprise.data-apps.db :as data-apps.db]
   [metabase-enterprise.data-apps.resource-tables :as resource-tables]
   [metabase-enterprise.data-apps.resource-validation :as resource-validation]
   [metabase.api.common :as api]
   [metabase.models.interface :as mi]
   [metabase.premium-features.core :refer [defenterprise]]
   [potemkin :as p]))

(p/import-vars
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
    (api/check-403 (mi/can-read? app))))
