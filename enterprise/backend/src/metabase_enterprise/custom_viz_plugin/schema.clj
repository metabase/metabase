(ns metabase-enterprise.custom-viz-plugin.schema
  "Malli schemas for the custom-viz-plugin module."
  (:require
   [metabase.util.malli.registry :as mr]
   [metabase.util.malli.schema :as ms]))

(mr/def ::custom-viz-plugin.manifest
  "The `:manifest` column of a CustomVizPlugin, decoded."
  :map)

(mr/def ::custom-viz-plugin
  "A CustomVizPlugin as selected from the app DB: every column of `:custom_viz_plugin`."
  [:map {:closed true}
   [:id               ms/PositiveInt]
   [:identifier       :string]
   [:display_name     :string]
   [:status           [:or :keyword :string]]
   [:error_message    [:maybe :string]]
   [:bundle           [:maybe [:or bytes? :string]]]
   [:bundle_hash      [:maybe :string]]
   [:created_at       ms/TemporalInstant]
   [:updated_at       ms/TemporalInstant]
   [:enabled          :boolean]
   [:icon             [:maybe :string]]
   [:manifest         [:maybe ::custom-viz-plugin.manifest]]
   [:metabase_version [:maybe :string]]
   [:dev_bundle_url   [:maybe :string]]])

(mr/def ::custom-viz-plugin.update
  "What an update (or insert) of a CustomVizPlugin accepts: every column of `:custom_viz_plugin` except `id`, all optional."
  [:map {:closed true}
   [:identifier       {:optional true} [:maybe :string]]
   [:display_name     {:optional true} [:maybe :string]]
   [:status           {:optional true} [:maybe [:or :keyword :string]]]
   [:error_message    {:optional true} [:maybe :string]]
   [:bundle           {:optional true} [:maybe [:or bytes? :string]]]
   [:bundle_hash      {:optional true} [:maybe :string]]
   [:created_at       {:optional true} [:maybe ms/TemporalInstant]]
   [:updated_at       {:optional true} [:maybe ms/TemporalInstant]]
   [:enabled          {:optional true} [:maybe :boolean]]
   [:icon             {:optional true} [:maybe :string]]
   [:manifest         {:optional true} [:maybe ::custom-viz-plugin.manifest]]
   [:metabase_version {:optional true} [:maybe :string]]
   [:dev_bundle_url   {:optional true} [:maybe :string]]])
