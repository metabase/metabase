(ns metabase-enterprise.data-apps.core
  "What other modules may ask the data-apps module: which apps a user may read."
  (:require
   [metabase-enterprise.data-apps.db :as data-apps.db]
   [metabase.premium-features.core :refer [defenterprise]]))

(defenterprise visible-data-app-filter-select
  "A HoneySQL query of the ids of the data apps that the user with `:user-id` and `:is-superuser?` can read."
  :feature :data-apps
  [{:keys [user-id is-superuser?]}]
  (data-apps.db/readable-data-app-ids-select user-id (boolean is-superuser?)))
