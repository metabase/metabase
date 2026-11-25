(ns metabase-enterprise.custom-viz-plugin.schema
  "Malli schemas for the custom-viz-plugin module."
  (:require
   [clojure.string :as str]
   [malli.util :as mut]
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

(mr/def ::custom-viz-plugin.identifier
  "The `:identifier` of a CustomVizPlugin: a non-blank string without `:`, which separates the parts of the
  `custom:<identifier>:<setting id>` viz-settings keys, so an identifier containing it could read another plugin's
  settings."
  [:and
   ms/NonBlankString
   [:fn {:error/message "plugin identifier must not contain \":\""} #(not (str/includes? % ":"))]])

(mr/def ::custom-viz-plugin.update
  "What an update of a custom viz plugin takes: its `:id` and the columns to change, each optional."
  [:map {:closed true}
   [:id               ms/PositiveInt]
   [:identifier       {:optional true} ::custom-viz-plugin.identifier]
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

(mr/def ::custom-viz-plugin.create
  "What creating a CustomVizPlugin takes: the columns of an update without the `:id` and the timestamps, and its
  identifier."
  [:merge
   (reduce mut/dissoc ::custom-viz-plugin.update [:id :created_at :updated_at])
   [:map {:closed true}
    [:identifier ::custom-viz-plugin.identifier]]])

(mr/def ::custom-viz-plugin
  "A CustomVizPlugin as selected from the app DB: every column of `:custom_viz_plugin`."
  ::custom-viz-plugin.update)

(mr/def ::external-custom-viz-plugin
  "A CustomVizPlugin as serialization writes it, with portable references in place of ids, the paths of its bundle
  files, and those files as resources."
  [:schema {:registry lib.schema.id/external-registry}
   [:merge
    [:select-keys ::custom-viz-plugin [:identifier]]
    [:map {:closed true}
     [:serdes/meta      {:optional true} ::models.schema/external-meta]
     [:files            {:optional true} [:sequential :string]]
     ;; a file the YAML lists but its directory lacks is read as nil
     [:serdes/resources {:optional true} [:maybe [:map-of :string [:maybe :string]]]]]]])
