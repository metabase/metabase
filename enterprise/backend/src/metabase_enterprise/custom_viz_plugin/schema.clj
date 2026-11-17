(ns metabase-enterprise.custom-viz-plugin.schema
  "Malli schemas for the custom-viz-plugin module."
  (:require
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.models.schema :as models.schema]
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
   ::custom-viz-plugin.update
   [:map {:closed true}
    [:id               ms/PositiveInt]]])

(mr/def ::custom-viz-plugin.update
  "What an update (or insert) of a CustomVizPlugin accepts: every column of `:custom_viz_plugin` except `id`, all optional."
  [:map {:closed true}
   [:entity_id        {:optional true} [:maybe :string]]
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

(mr/def ::external-custom-viz-plugin
  "A CustomVizPlugin as serialization writes it, with portable references in place of ids, the paths of its bundle
  files, and those files as resources."
  [:schema {:registry lib.schema.id/external-registry}
   [:merge
    [:select-keys ::custom-viz-plugin [:entity_id :identifier]]
    [:map {:closed true}
     [:serdes/meta      {:optional true} ::models.schema/external-meta]
     [:files            {:optional true} [:sequential :string]]
     [:serdes/resources {:optional true} [:map-of :string :string]]]]])
