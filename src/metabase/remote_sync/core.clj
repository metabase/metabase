(ns metabase.remote-sync.core
  (:require
   [metabase.premium-features.core :refer [defenterprise]]))

(defenterprise collection-editable?
  "Returns if remote-synced collections are editable. Takes a collection to check for eligibility.

  Always true on OSS."
  metabase-enterprise.remote-sync.core
  [_collection]
  true)
