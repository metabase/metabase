(ns metabase.remote-sync.core
  (:require
   [metabase.premium-features.core :refer [defenterprise]]))

(defenterprise editable?
  "Should the library be editable. Always true on OSS"
  metabase-enterprise.remote-sync.core
  [_collection]
  true)
