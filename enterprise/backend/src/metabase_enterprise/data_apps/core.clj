(ns metabase-enterprise.data-apps.core
  "What other modules may ask the data-apps module: whether a user can open an app, and which apps a user may read."
  (:require
   [metabase-enterprise.data-apps.db :as data-apps.db]
   [metabase.api.common :as api]
   [metabase.models.interface :as mi]
   [metabase.premium-features.core :refer [defenterprise]]))

(defenterprise check-data-app-access!
  "Checks that the user can read the app: one who can read its collection while it is enabled, or a superuser."
  :feature :data-apps
  [request]
  (let [app (api/check-404 (data-apps.db/data-app-by-slug (get-in request [:route-params :name])))]
    (api/check-403 (mi/can-read? app))))

(defenterprise visible-data-app-filter-select
  "A HoneySQL query of the ids of the data apps that the user with `:user-id` and `:is-superuser?` can read."
  :feature :data-apps
  [{:keys [user-id is-superuser?]}]
  (data-apps.db/readable-data-app-ids-select user-id (boolean is-superuser?)))
