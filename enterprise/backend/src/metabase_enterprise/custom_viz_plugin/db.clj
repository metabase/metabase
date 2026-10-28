(ns metabase-enterprise.custom-viz-plugin.db
  "Application database queries for the custom-viz-plugin module. Every function here is a direct Toucan 2 call with no
  additional logic, so the rest of the module only touches `toucan2.core` for model definitions and hydration methods."
  (:require
   [metabase-enterprise.custom-viz-plugin.schema :as custom-viz-plugin.schema]
   [metabase.util.malli :as mu]
   [metabase.util.malli.schema :as ms]
   [toucan2.core :as t2]))

(def non-blob-columns
  "Every CustomVizPlugin column except the raw bundle blob."
  [:id :identifier :display_name :icon :status :error_message :enabled :manifest :metabase_version :bundle_hash
   :dev_bundle_url :created_at :updated_at])

(def ^:private non-blob-model
  (into [:model/CustomVizPlugin] non-blob-columns))

(mu/defn custom-viz-plugin :- [:maybe ::custom-viz-plugin.schema/custom-viz-plugin]
  "The ::custom-viz-plugin.schema/custom-viz-plugin with `custom-viz-plugin-id`, or nil."
  [custom-viz-plugin-id :- ms/PositiveInt]
  (t2/select-one :model/CustomVizPlugin :id [:auto/param custom-viz-plugin-id]))

(mu/defn plugin-bundle
  "The bundle bytes of the CustomVizPlugin with `plugin-id`."
  [plugin-id :- ms/PositiveInt]
  (t2/select-one-fn :bundle [:model/CustomVizPlugin :bundle] :id [:auto/param plugin-id]))

(mu/defn reducible-plugins-with-bundles
  "A reducible of the CustomVizPlugin rows, bundles included, whose `filter-column` is one of `filter-ids` (every row
  when `filter-column` is nil), ordered ascending by `order-columns`."
  [filter-column :- [:maybe :keyword]
   filter-ids    :- [:maybe [:sequential [:maybe [:or :int :string]]]]
   order-columns :- [:maybe [:sequential :keyword]]]
  (t2/reducible-select [:model/CustomVizPlugin :*]
                       (cond-> {}
                         filter-column       (assoc :where [:in filter-column filter-ids])
                         (seq order-columns) (assoc :order-by (mapv (fn [column] [column :asc]) order-columns)))))

(mu/defn non-blob-plugins
  "Every CustomVizPlugin without its bundle, ordered by display name."
  []
  (t2/select non-blob-model {:order-by [[:display_name :asc]]}))

(mu/defn active-enabled-non-blob-plugins
  "The active, enabled CustomVizPlugins without their bundle, ordered by display name."
  []
  (t2/select non-blob-model :status :active :enabled true {:order-by [[:display_name :asc]]}))

(mu/defn plugin-by-identifier
  "The CustomVizPlugin with `identifier`, or nil."
  [identifier :- :string]
  (t2/select-one :model/CustomVizPlugin :identifier identifier))

(mu/defn plugin-identifier-exists?
  "Whether a CustomVizPlugin with `identifier` exists."
  [identifier :- :string]
  (t2/exists? :model/CustomVizPlugin :identifier identifier))

(mu/defn insert-plugin!
  "Insert `plugin` and return the new instance."
  [plugin :- ::custom-viz-plugin.schema/custom-viz-plugin.update]
  (t2/insert-returning-instance! :model/CustomVizPlugin plugin))

(mu/defn update-plugin!
  "Apply `changes` to the CustomVizPlugin with `plugin-id`, returning the number updated."
  [plugin-id :- ms/PositiveInt
   changes   :- ::custom-viz-plugin.schema/custom-viz-plugin.update]
  (t2/update! :model/CustomVizPlugin plugin-id changes))

(mu/defn delete-plugin!
  "Delete the CustomVizPlugin with `plugin-id`, returning the number deleted."
  [plugin-id :- ms/PositiveInt]
  (t2/delete! :model/CustomVizPlugin :id plugin-id))
