(ns metabase.remote-sync.core
  (:require
   [metabase.premium-features.core :refer [defenterprise]]))

(defenterprise editable?
  "Should remote-synced collections be editable. Always true on OSS"
  metabase-enterprise.remote-sync.core
  [_collection]
  true)
