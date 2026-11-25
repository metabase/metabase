(ns metabase-enterprise.custom-viz-plugin.db
  "Application database queries for the custom-viz-plugin module. Every function here is a direct Toucan 2 call with no
  additional logic, so the rest of the module only touches `toucan2.core` for model definitions and hydration methods."
  (:require
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

(mu/defn plugin-identifier-ignoring-case :- [:maybe :string]
  "The identifier of a plugin other than `except-id` (nil for none) that equals `identifier` ignoring case, or nil."
  [identifier :- :string
   except-id  :- [:maybe ms/PositiveInt]]
  (t2/select-one-fn :identifier :model/CustomVizPlugin
                    {:where (cond-> [:and [:= [:lower :identifier] (u/lower-case-en identifier)]]
                              except-id (conj [:not= :id except-id]))}))

(mu/defn plugin-bundle
  "The bundle bytes of the CustomVizPlugin with `plugin-id`."
  [plugin-id :- ms/PositiveInt]
  (t2/select-one-fn :bundle :model/CustomVizPlugin :id plugin-id))

(mu/defn plugin-bundle-hashes :- [:map-of ms/PositiveInt [:maybe :string]]
  "The bundle hash, nil for a dev-only plugin, of each of the CustomVizPlugins with `plugin-ids`, by id."
  [plugin-ids :- [:sequential {:min 1} ms/PositiveInt]]
  (into {}
        (map (juxt :id :bundle_hash))
        (app-db/select-batched #(t2/select [:model/CustomVizPlugin :id :bundle_hash] :id [:in [:auto/param %]]) plugin-ids)))

(mu/defn plugin-dev-bundle-url
  "The dev bundle URL of the CustomVizPlugin with `plugin-id`."
  [plugin-id :- ms/PositiveInt]
  (t2/select-one-fn :dev_bundle_url :model/CustomVizPlugin :id plugin-id))

(mu/defn non-blob-plugins-by-ids :- [:map-of ms/PositiveInt :map]
  "The CustomVizPlugins with `plugin-ids`, without their bundles, by id."
  [plugin-ids :- [:sequential {:min 1} ms/PositiveInt]]
  (into {}
        (map (juxt :id identity))
        (app-db/select-batched #(t2/select non-blob-columns :id [:in [:auto/param %]]) plugin-ids)))

(mu/defn update-plugins! :- :nil
  "Apply each of `updates`, the `:id` of a CustomVizPlugin and the columns to change, with one statement for each set of
  columns that rows have in common."
  [updates :- [:sequential :map]]
  (app-db/update-grouped! :model/CustomVizPlugin updates)
  nil)

(mu/defn delete-plugins!
  "Delete the CustomVizPlugins with `plugin-ids`, returning the number deleted."
  [plugin-ids :- [:sequential {:min 1} ms/PositiveInt]]
  (app-db/sum-batched app-db/delete-partition-size #(t2/delete! :model/CustomVizPlugin :id [:in [:auto/param %]]) plugin-ids))

(mu/defn plugins-by-lower-case-identifiers :- [:sequential :map]
  "The plugins whose identifier in lower case is one of `identifiers`, with only `columns` unless nil."
  [identifiers :- [:sequential {:min 1} :string]
   columns     :- [:maybe [:sequential :keyword]]]
  (app-db/select-batched #(t2/select (if columns (into [:model/CustomVizPlugin] columns) :model/CustomVizPlugin)
                                     {:where [:in [:lower :identifier] [:auto/param %]]})
                         identifiers))

(mu/defn synced-custom-viz-plugin-items :- [:sequential ::custom-viz-plugin.schema/custom-viz-plugin]
  "The CustomVizPlugins with `ids`, as remote sync lists them."
  [ids :- [:sequential pos-int?]]
  (app-db/select-batched #(t2/select [:model/CustomVizPlugin :id :identifier :display_name] :id [:in [:auto/param %]]) ids))
