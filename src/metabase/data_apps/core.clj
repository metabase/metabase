(ns metabase.data-apps.core
  (:require
   [metabase.data-apps.guards.card]
   [metabase.data-apps.guards.dataset]
   [metabase.data-apps.guards.sandbox-table]
   [metabase.data-apps.guards.table]
   [metabase.premium-features.core :refer [defenterprise]]
   [potemkin :as p]))

(p/import-vars
 [metabase.data-apps.guards.card
  card-guard]
 [metabase.data-apps.guards.dataset
  dataset-guard]
 [metabase.data-apps.guards.sandbox-table
  sandbox-table-guard]
 [metabase.data-apps.guards.table
  table-guard])

(defenterprise check-data-app-access!
  "Authorize the data app before serving its HTML entry point."
  metabase-enterprise.data-apps.core
  [_request]
  nil)

(defenterprise visible-data-app-filter-select
  "A HoneySQL query of the ids of the data apps that the user described by `user-info` (`:user-id`, `:is-superuser?`)
  can read, or nil, meaning none, without the data apps feature."
  metabase-enterprise.data-apps.core
  [_user-info]
  nil)
