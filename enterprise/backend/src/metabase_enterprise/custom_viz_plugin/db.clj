(ns metabase-enterprise.custom-viz-plugin.db
  "Application database queries for the custom-viz-plugin module. Every function here is a direct Toucan 2 call with no
  additional logic, so the rest of the module only touches `toucan2.core` for model definitions and hydration methods."
  (:require
   [toucan2.core :as t2]))

(def ^:private non-blob-columns
  "Columns to select for normal plugin reads, excluding the bundle blob."
  [:model/CustomVizPlugin :id :identifier :display_name :icon :status :error_message :enabled
   :manifest :metabase_version :bundle_hash :dev_bundle_url
   :created_at :updated_at])

(defn non-blob-plugin
  "The CustomVizPlugin with `plugin-id` without its bundle, or nil."
  [plugin-id]
  (t2/select-one non-blob-columns :id plugin-id))

(defn non-blob-plugins
  "Every CustomVizPlugin without its bundle, ordered by display name."
  []
  (t2/select non-blob-columns {:order-by [[:display_name :asc]]}))

(defn active-enabled-non-blob-plugins
  "The active, enabled CustomVizPlugins without their bundle, ordered by display name."
  []
  (t2/select non-blob-columns :status :active :enabled true {:order-by [[:display_name :asc]]}))

(defn plugin-by-identifier
  "The CustomVizPlugin with `identifier`, or nil."
  [identifier]
  (t2/select-one :model/CustomVizPlugin :identifier identifier))

(defn plugin-identifier-exists?
  "Whether a CustomVizPlugin with `identifier` exists."
  [identifier]
  (t2/exists? :model/CustomVizPlugin :identifier identifier))

(defn plugin-bundle
  "The bundle bytes of the CustomVizPlugin with `plugin-id`."
  [plugin-id]
  (t2/select-one-fn :bundle :model/CustomVizPlugin :id plugin-id))

(defn plugin-dev-bundle-url
  "The dev bundle URL of the CustomVizPlugin with `plugin-id`."
  [plugin-id]
  (t2/select-one-fn :dev_bundle_url :model/CustomVizPlugin :id plugin-id))

(defn insert-plugin!
  "Insert `plugin` and return the new instance."
  [plugin]
  (t2/insert-returning-instance! :model/CustomVizPlugin plugin))

(defn update-plugin!
  "Apply `changes` to the CustomVizPlugin with `plugin-id`."
  [plugin-id changes]
  (t2/update! :model/CustomVizPlugin plugin-id changes))

(defn delete-plugin!
  "Delete the CustomVizPlugin with `plugin-id`."
  [plugin-id]
  (t2/delete! :model/CustomVizPlugin :id plugin-id))
