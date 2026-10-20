(ns metabase-enterprise.data-sensitivity.overlay
  "The pending AI proposals that the preview read of [[warehouse-schema-overlay/field-query]] shows over the merged
  Field values."
  (:require
   [metabase.util :as u]
   [metabase.warehouse-schema-overlay.core :as warehouse-schema-overlay]
   [toucan2.core :as t2]))

(defmethod warehouse-schema-overlay/field-ai-proposal :ai-proposals
  [_source field-alias proposal-alias attribute]
  (let [column #(u/qualified-key proposal-alias %)]
    {:join       [[(t2/table-name :model/MetadataGenerationProposal) proposal-alias]
                  [:and
                   [:= (column :field_id) (u/qualified-key field-alias :id)]
                   [:= (column :attribute) (name attribute)]
                   [:= (column :status) "pending"]]]
     :value      (column :proposed_value)
     :reasoning  (column :reasoning)
     :confidence (column :confidence)}))
