(ns metabase.data-apps.core
  (:require
   [metabase.premium-features.core :refer [defenterprise]]))

(defenterprise check-data-app-access!
  "Authorize the data app before serving its HTML entry point."
  metabase-enterprise.data-apps.core
  [_request]
  nil)
