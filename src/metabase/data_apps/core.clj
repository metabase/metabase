(ns metabase.data-apps.core
  (:require
   [metabase.data-apps.guards.dataset]
   [metabase.premium-features.core :refer [defenterprise]]
   [potemkin :as p]))

(p/import-vars
 [metabase.data-apps.guards.dataset
  dataset-guard])

(defenterprise check-data-app-access!
  "Authorize the data app before serving its HTML entry point."
  metabase-enterprise.data-apps.core
  [_request]
  nil)
