(ns metabase-enterprise.data-sensitivity.overlay
  "The pending AI proposals that the preview read of [[metabase.warehouse-schema-overlay.core/field-query]] shows
  over the merged Field values."
  (:require
   [metabase.premium-features.core :refer [defenterprise]]
   [metabase.util :as u]
   [toucan2.core :as t2]))

(defenterprise field-ai-proposal
  "The pending AI proposal of `attribute` for the Field aliased `field-alias`, read from
  `metadata_generation_proposal` aliased `proposal-alias`."
  :feature :data-sensitivity
  [field-alias proposal-alias attribute]
  (let [column #(u/qualified-key proposal-alias %)]
    {:join       [[(t2/table-name :model/MetadataGenerationProposal) proposal-alias]
                  [:and
                   [:= (column :field_id) (u/qualified-key field-alias :id)]
                   [:= (column :attribute) (name attribute)]
                   [:= (column :status) "pending"]]]
     :value      (column :proposed_value)
     :reasoning  (column :reasoning)
     :confidence (column :confidence)}))
