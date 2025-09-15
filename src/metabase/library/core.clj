(ns metabase.library.core
  (:require
   [metabase.premium-features.core :refer [defenterprise]]))

(defenterprise library-editable?
  "Should the library be editable. Always true on OSS"
  metabase-enterprise.library.core
  [_collection]
  true)
