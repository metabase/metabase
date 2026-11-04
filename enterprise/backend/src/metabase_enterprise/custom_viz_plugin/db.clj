(ns metabase-enterprise.custom-viz-plugin.db
  "Application database reads for the custom-viz-plugin module that must not depend on the model namespace, so both
  [[metabase-enterprise.custom-viz-plugin.cache]] and the model's serialization hooks (which require `cache`) can use
  them without a circular dependency."
  (:require
   [toucan2.core :as t2]))

(def non-blob-columns
  "Columns to select for normal plugin metadata reads, excluding the raw bundle blob."
  [:id :identifier :display_name :icon :status :error_message :enabled
   :manifest :metabase_version :bundle_hash :dev_bundle_url
   :created_at :updated_at])

(defn non-blob-plugin
  "The CustomVizPlugin with `plugin-id` without its bundle, or nil."
  [plugin-id]
  (t2/select-one (into [:model/CustomVizPlugin] non-blob-columns) :id plugin-id))
