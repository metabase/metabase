(ns metabase-enterprise.custom-viz-plugin.schema
  "Malli schemas for the custom-viz-plugin module."
  (:require
   [malli.util :as mut]
   [metabase.util.malli.registry :as mr]
   [metabase.util.malli.schema :as ms]))

(mr/def ::custom-viz-plugin.manifest
  "The `:manifest` column of a CustomVizPlugin, decoded."
  [:map {:closed true}
   [:name     {:optional true} [:maybe :string]]
   [:icon     {:optional true} [:maybe :string]]
   [:metabase {:optional true} [:maybe [:map {:closed true} [:version {:optional true} [:maybe :string]]]]]
   [:sdk      {:optional true} [:maybe [:map {:closed true} [:version {:optional true} [:maybe :string]]]]]])

(mr/def ::custom-viz-plugin
  "A CustomVizPlugin as selected from the app DB: every column of `:custom_viz_plugin`."
  [:merge
   ::custom-viz-plugin.columns
   [:map {:closed true}
    [:id               ms/PositiveInt]]])

(mr/def ::custom-viz-plugin.columns
  "Every column of `:custom_viz_plugin` except `id`, all optional."
  [:map {:closed true}
   [:identifier       {:optional true} [:maybe :string]]
   [:display_name     {:optional true} [:maybe :string]]
   [:status           {:optional true} [:maybe [:or :keyword :string]]]
   [:error_message    {:optional true} [:maybe :string]]
   [:bundle           {:optional true} [:maybe [:or bytes? :string]]]
   [:bundle_hash      {:optional true} [:maybe :string]]
   [:created_at       {:optional true} [:maybe ms/TemporalInstantOrNow]]
   [:updated_at       {:optional true} [:maybe ms/TemporalInstantOrNow]]
   [:enabled          {:optional true} [:maybe :boolean]]
   [:icon             {:optional true} [:maybe :string]]
   [:manifest         {:optional true} [:maybe ::custom-viz-plugin.manifest]]
   [:metabase_version {:optional true} [:maybe :string]]
   [:dev_bundle_url   {:optional true} [:maybe :string]]])

(mr/def ::custom-viz-plugin.create
  "What an insert of a CustomVizPlugin accepts."
  (mr/schema ::custom-viz-plugin.columns))

(mr/def ::custom-viz-plugin.update
  "What an update of a CustomVizPlugin accepts: no immutable columns (`:identifier` and `:created_at` are fixed
  at creation and never change after that)."
  (mut/select-keys (mr/schema ::custom-viz-plugin.columns)
                   [:display_name :status :error_message :bundle :bundle_hash :updated_at :enabled :icon
                    :manifest :metabase_version :dev_bundle_url]))

(mr/def ::custom-viz-plugin.partial
  "A CustomVizPlugin row as selected, where a `:columns` narrowing may have left out any column."
  [:merge ::custom-viz-plugin [:map {:closed true} [:id {:optional true} ms/PositiveInt]]])

(mr/def ::custom-viz-plugin.column
  "A column of `:custom_viz_plugin`, for the `:columns` option of the queries in
  [[metabase-enterprise.custom-viz-plugin.db]]."
  (into [:enum :id] (mut/keys (mr/schema ::custom-viz-plugin.columns))))
