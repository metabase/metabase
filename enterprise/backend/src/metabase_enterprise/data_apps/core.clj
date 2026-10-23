(ns metabase-enterprise.data-apps.core
  "What other modules may ask the data-apps module: whether a user can open an app."
  (:require
   [metabase-enterprise.data-apps.db :as data-apps.db]
   [metabase.api.common :as api]
   [metabase.models.interface :as mi]
   [metabase.premium-features.core :refer [defenterprise]]))

(defenterprise check-data-app-access!
  "Checks that the user can read the app: a member of an assigned group while it is enabled, or a superuser."
  :feature :data-apps
  [request]
  (let [app (api/check-404 (data-apps.db/data-app-by-slug (get-in request [:route-params :name])))]
    (api/check-403 (mi/can-read? app))))
