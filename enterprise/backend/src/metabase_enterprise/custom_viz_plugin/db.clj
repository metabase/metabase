(ns metabase-enterprise.custom-viz-plugin.db
  "Application database queries for `:model/CustomVizPlugin`. Every function here is a direct Toucan 2 call with no
  additional logic, so the rest of the module only touches `toucan2.core` for model definitions and hydration
  methods.

  The queries below follow [[::opts]]; queries that do not fit it live in the custom-viz-plugin-only section at the
  bottom of this namespace."
  (:require
   [metabase-enterprise.custom-viz-plugin.schema :as custom-viz-plugin.schema]
   [metabase.util.malli :as mu]
   [metabase.util.malli.registry :as mr]
   [metabase.util.malli.schema :as ms]
   [metabase.util.query :as u.query]
   [toucan2.core :as t2]))

(mr/def ::filters
  "Which CustomVizPlugins a query applies to. Keys mirror the columns of `:custom_viz_plugin`: a scalar matches that
  value and a set matches any of its values."
  [:map {:closed true}
   [:id         {:optional true} [:or ms/PositiveInt [:set ms/PositiveInt]]]
   [:identifier {:optional true} :string]
   [:status     {:optional true} [:or :keyword :string]]
   [:enabled    {:optional true} :boolean]])

(mr/def ::opts
  "The filters above plus the columns to select and the order to return them in."
  [:merge
   ::filters
   [:map {:closed true}
    [:columns  {:optional true} [:sequential ::custom-viz-plugin.schema/custom-viz-plugin.column]]
    [:order-by {:optional true} [:sequential [:or
                                              ::custom-viz-plugin.schema/custom-viz-plugin.column
                                              [:tuple ::custom-viz-plugin.schema/custom-viz-plugin.column [:enum :asc :desc]]]]]
    [:limit    {:optional true} ms/PositiveInt]
    [:offset   {:optional true} ms/IntGreaterThanOrEqualToZero]]])

(def ^:private non-blob-columns
  "Columns to select for normal plugin metadata reads, excluding the raw bundle blob."
  [:id :identifier :display_name :icon :status :error_message :enabled
   :manifest :metabase_version :bundle_hash :dev_bundle_url
   :created_at :updated_at])

(defn- ->model
  [columns]
  (u.query/model-with-columns :model/CustomVizPlugin columns))

(defn- ->args
  [opts]
  (u.query/opts->args opts))

(defn- ->kv-args
  [opts]
  (u.query/opts->kv-args opts))

;;; ------------------------------------------------- Reads -------------------------------------------------

(mu/defn select-custom-viz-plugins :- [:sequential ::custom-viz-plugin.schema/custom-viz-plugin.partial]
  "The CustomVizPlugins matching `opts`."
  ([]
   (select-custom-viz-plugins nil))
  ([{:keys [columns] :as opts} :- [:maybe ::opts]]
   (apply t2/select (->model columns) (->args opts))))

(mu/defn select-one-custom-viz-plugin :- [:maybe ::custom-viz-plugin.schema/custom-viz-plugin.partial]
  "The first CustomVizPlugin matching `opts`, or nil."
  ([]
   (select-one-custom-viz-plugin nil))
  ([{:keys [columns] :as opts} :- [:maybe ::opts]]
   (apply t2/select-one (->model columns) (->args opts))))

(mu/defn custom-viz-plugin-exists? :- :boolean
  "Whether a CustomVizPlugin matching `opts` exists."
  [opts :- [:maybe ::opts]]
  (apply t2/exists? :model/CustomVizPlugin (->args opts)))

;;; ------------------------------------------------ Writes -------------------------------------------------

(mu/defn insert-custom-viz-plugin! :- ::custom-viz-plugin.schema/custom-viz-plugin
  "Insert the CustomVizPlugin `row` and return the inserted instance."
  [row :- ::custom-viz-plugin.schema/custom-viz-plugin.create]
  (t2/insert-returning-instance! :model/CustomVizPlugin row))

(mu/defn update-custom-viz-plugins! :- :int
  "Apply `changes` to every CustomVizPlugin matching `opts`, returning the number updated."
  [opts    :- [:maybe ::opts]
   changes :- ::custom-viz-plugin.schema/custom-viz-plugin.update]
  (apply t2/update! :model/CustomVizPlugin (conj (->kv-args opts) changes)))

(mu/defn delete-custom-viz-plugins! :- :int
  "Delete every CustomVizPlugin matching `opts`, returning the number deleted."
  [opts :- [:maybe ::opts]]
  (apply t2/delete! :model/CustomVizPlugin (->args opts)))

;;; -------------------------- Queries used only by the custom-viz-plugin module --------------------------

(mu/defn select-one-non-blob-custom-viz-plugin :- [:maybe ::custom-viz-plugin.schema/custom-viz-plugin.partial]
  "The CustomVizPlugin with `plugin-id` without its bundle, or nil."
  [plugin-id :- ms/PositiveInt]
  (select-one-custom-viz-plugin {:id plugin-id :columns non-blob-columns}))

(mu/defn select-non-blob-custom-viz-plugins :- [:sequential ::custom-viz-plugin.schema/custom-viz-plugin.partial]
  "Every CustomVizPlugin without its bundle, ordered by display name."
  []
  (select-custom-viz-plugins {:columns non-blob-columns :order-by [:display_name]}))

(mu/defn select-active-enabled-non-blob-custom-viz-plugins :- [:sequential ::custom-viz-plugin.schema/custom-viz-plugin.partial]
  "The active, enabled CustomVizPlugins without their bundle, ordered by display name."
  []
  (select-custom-viz-plugins {:status :active :enabled true :columns non-blob-columns :order-by [:display_name]}))
