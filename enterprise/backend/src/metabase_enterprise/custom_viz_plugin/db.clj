(ns metabase-enterprise.custom-viz-plugin.db
  "Application database queries for the custom-viz-plugin module. Every function here is a direct Toucan 2 call with no
  additional logic, so the rest of the module only touches `toucan2.core` for model definitions and hydration methods."
  (:require
   [metabase.util.malli :as mu]
   [metabase.util.malli.schema :as ms]
   [toucan2.core :as t2]))

(def ^:private non-blob-columns
  "Columns to select for normal plugin reads, excluding the bundle blob."
  [:model/CustomVizPlugin :id :identifier :display_name :icon :status :error_message :enabled
   :manifest :metabase_version :bundle_hash :dev_bundle_url
   :created_at :updated_at])

(def ^:private PluginRow
  "The writable columns of a CustomVizPlugin row (excluding `:id`, `:created_at`, `:updated_at`)."
  [:map {:closed true}
   [:identifier       {:optional true} :any]
   [:display_name     {:optional true} :any]
   [:status           {:optional true} :any]
   [:error_message    {:optional true} :any]
   [:bundle           {:optional true} :any]
   [:bundle_hash      {:optional true} :any]
   [:enabled          {:optional true} :any]
   [:icon             {:optional true} :any]
   [:manifest         {:optional true} :any]
   [:metabase_version {:optional true} :any]
   [:dev_bundle_url   {:optional true} :any]])

(mu/defn non-blob-plugin :- [:maybe (ms/InstanceOf :model/CustomVizPlugin)]
  "The CustomVizPlugin with `plugin-id` without its bundle, or nil."
  [plugin-id :- ms/PositiveInt]
  (t2/select-one non-blob-columns :id plugin-id))

(mu/defn non-blob-plugins :- [:sequential (ms/InstanceOf :model/CustomVizPlugin)]
  "Every CustomVizPlugin without its bundle, ordered by display name."
  []
  (t2/select non-blob-columns {:order-by [[:display_name :asc]]}))

(mu/defn active-enabled-non-blob-plugins :- [:sequential (ms/InstanceOf :model/CustomVizPlugin)]
  "The active, enabled CustomVizPlugins without their bundle, ordered by display name."
  []
  (t2/select non-blob-columns :status :active :enabled true {:order-by [[:display_name :asc]]}))

(mu/defn plugin-by-identifier :- [:maybe (ms/InstanceOf :model/CustomVizPlugin)]
  "The CustomVizPlugin with `identifier`, or nil."
  [identifier :- :string]
  (t2/select-one :model/CustomVizPlugin :identifier identifier))

(mu/defn plugin-identifier-exists? :- :boolean
  "Whether a CustomVizPlugin with `identifier` exists."
  [identifier :- :string]
  (t2/exists? :model/CustomVizPlugin :identifier identifier))

(mu/defn plugin-bundle :- [:maybe :any]
  "The bundle bytes of the CustomVizPlugin with `plugin-id`."
  [plugin-id :- ms/PositiveInt]
  (t2/select-one-fn :bundle :model/CustomVizPlugin :id plugin-id))

(mu/defn plugin-dev-bundle-url :- [:maybe :string]
  "The dev bundle URL of the CustomVizPlugin with `plugin-id`."
  [plugin-id :- ms/PositiveInt]
  (t2/select-one-fn :dev_bundle_url :model/CustomVizPlugin :id plugin-id))

(mu/defn insert-plugin! :- (ms/InstanceOf :model/CustomVizPlugin)
  "Insert `plugin` and return the new instance."
  [plugin :- PluginRow]
  (t2/insert-returning-instance! :model/CustomVizPlugin plugin))

(mu/defn update-plugin! :- :int
  "Apply `changes` to the CustomVizPlugin with `plugin-id`, returning the number updated."
  [plugin-id :- ms/PositiveInt
   changes   :- PluginRow]
  (t2/update! :model/CustomVizPlugin plugin-id changes))

(mu/defn delete-plugin! :- :int
  "Delete the CustomVizPlugin with `plugin-id`, returning the number deleted."
  [plugin-id :- ms/PositiveInt]
  (t2/delete! :model/CustomVizPlugin :id plugin-id))
