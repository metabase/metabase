(ns metabase-enterprise.data-apps.core
  "Data app access and resource-collection ownership checks for other modules."
  (:require
   [metabase-enterprise.data-apps.db :as data-apps.db]
   [metabase.premium-features.core :refer [defenterprise]]))

(defenterprise data-app-resource-collection?
  "Whether the collection with `collection-id` is the resource collection of an existing data app."
  :feature :none
  [collection-id]
  (data-apps.db/resource-collection? collection-id))

(defenterprise visible-data-app-filter-select
  "A HoneySQL query of the ids of the data apps that the user with `:user-id` and `:is-superuser?` can read."
  :feature :data-apps
  [{:keys [user-id is-superuser?]}]
  (data-apps.db/readable-data-app-ids-select user-id (boolean is-superuser?)))
