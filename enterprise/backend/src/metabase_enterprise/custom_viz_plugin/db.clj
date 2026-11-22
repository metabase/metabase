(ns metabase-enterprise.custom-viz-plugin.db
  "Application database queries for the custom-viz-plugin module. Every function here is a direct Toucan 2 call with no
  additional logic, so the rest of the module only touches `toucan2.core` for model definitions and hydration methods."
  (:require
   [malli.util :as mut]
   [metabase-enterprise.custom-viz-plugin.schema :as custom-viz-plugin.schema]
   [metabase.app-db.core :as app-db]
   [metabase.util :as u]
   [metabase.util.malli :as mu]
   [metabase.util.malli.schema :as ms]
   [toucan2.core :as t2]))

(def ^:private non-blob-columns
  "Columns to select for normal plugin reads, excluding the bundle blob."
  [:model/CustomVizPlugin :id :identifier :display_name :icon :status :error_message :enabled
   :manifest :metabase_version :bundle_hash :dev_bundle_url
   :created_at :updated_at])

(mu/defn non-blob-plugin
  "The CustomVizPlugin with `plugin-id` without its bundle, or nil."
  [plugin-id :- ms/PositiveInt]
  (t2/select-one non-blob-columns :id plugin-id))

(mu/defn non-blob-plugins
  "Every CustomVizPlugin without its bundle, ordered by display name."
  []
  (t2/select non-blob-columns {:order-by [[:display_name :asc]]}))

(mu/defn active-enabled-non-blob-plugins
  "The active, enabled CustomVizPlugins without their bundle, ordered by display name."
  []
  (t2/select non-blob-columns :status :active :enabled true {:order-by [[:display_name :asc]]}))

(mu/defn plugin-by-identifier
  "The CustomVizPlugin with `identifier`, or nil."
  [identifier :- :string]
  (t2/select-one :model/CustomVizPlugin :identifier identifier))

(mu/defn plugins-by-identifiers :- [:sequential :map]
  "The CustomVizPlugins, with only `columns` unless nil, whose identifier is one of `identifiers`, oldest first."
  [identifiers :- [:sequential {:min 1} :string]
   columns     :- [:maybe [:sequential :keyword]]]
  (t2/select (if columns (into [:model/CustomVizPlugin] columns) :model/CustomVizPlugin)
             :identifier [:in [:auto/param (vec identifiers)]]
             {:order-by [[:id :asc]]}))

(mu/defn plugin-identifier-exists?
  "Whether a CustomVizPlugin with `identifier` exists."
  [identifier :- :string]
  (t2/exists? :model/CustomVizPlugin :identifier identifier))

(mu/defn plugin-bundle
  "The bundle bytes of the CustomVizPlugin with `plugin-id`."
  [plugin-id :- ms/PositiveInt]
  (t2/select-one-fn :bundle :model/CustomVizPlugin :id plugin-id))

(mu/defn plugin-dev-bundle-url
  "The dev bundle URL of the CustomVizPlugin with `plugin-id`."
  [plugin-id :- ms/PositiveInt]
  (t2/select-one-fn :dev_bundle_url :model/CustomVizPlugin :id plugin-id))

(mu/defn insert-plugins!
  "Insert the `plugins` and return the new instances."
  [plugins :- [:sequential {:min 1} ::custom-viz-plugin.schema/custom-viz-plugin.create]]
  (app-db/insert-returning-instances! :model/CustomVizPlugin plugins))

(mu/defn update-plugins!
  "Apply `changes` to the CustomVizPlugins with `plugin-ids`, returning the number updated."
  [plugin-ids :- [:sequential {:min 1} ms/PositiveInt]
   changes    :- (mut/dissoc ::custom-viz-plugin.schema/custom-viz-plugin.update :id)]
  (t2/update! :model/CustomVizPlugin :id [:in [:auto/param plugin-ids]] changes))

(mu/defn non-blob-plugins-by-ids
  "The CustomVizPlugins with `plugin-ids`, without their bundles."
  [plugin-ids :- [:sequential {:min 1} ms/PositiveInt]]
  (t2/select non-blob-columns :id [:in [:auto/param plugin-ids]]))

(mu/defn delete-plugins!
  "Delete the CustomVizPlugins with `plugin-ids`, returning the number deleted."
  [plugin-ids :- [:sequential {:min 1} ms/PositiveInt]]
  (t2/delete! :model/CustomVizPlugin :id [:in [:auto/param plugin-ids]]))
