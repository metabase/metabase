(ns metabase-enterprise.data-sensitivity.models.metadata-generation-proposal
  "A `metadata_generation_proposal` is the pending value that the AI proposes for one attribute of one field. There
  is one row per field and attribute. A run upserts the rows of the fields it covers, and `last_run_id` names the run
  that wrote a row last. Accept writes the value and deletes the row; reject deletes the row."
  (:require
   [metabase-enterprise.data-sensitivity.models.metadata-generation-run :as run]
   [metabase.models.interface :as mi]
   [metabase.util.malli.registry :as mr]
   [metabase.util.malli.schema :as ms]
   [methodical.core :as methodical]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(methodical/defmethod t2/table-name :model/MetadataGenerationProposal [_model] :metadata_generation_proposal)

(derive :model/MetadataGenerationProposal :metabase/model)
(derive :model/MetadataGenerationProposal :hook/timestamped?)

(mr/def ::confidence
  [:enum :high :medium :low])

(mr/def ::status
  [:enum :pending])

(mr/def ::metadata-generation-proposal
  [:map
   [:id             ms/PositiveInt]
   [:last_run_id    [:maybe ms/PositiveInt]]
   [:table_id       ms/PositiveInt]
   [:field_id       ms/PositiveInt]
   [:attribute      ::run/attribute]
   [:proposed_value :string]
   [:confidence     [:maybe ::confidence]]
   [:reasoning      [:maybe :string]]
   [:status         ::status]
   [:created_at     some?]
   [:updated_at     some?]])

(mr/def ::new-proposal
  "The columns a run sets when it upserts a proposal."
  [:map {:closed true}
   [:last_run_id    ms/PositiveInt]
   [:table_id       ms/PositiveInt]
   [:field_id       ms/PositiveInt]
   [:attribute      ::run/attribute]
   [:proposed_value :string]
   [:confidence     [:maybe ::confidence]]
   [:reasoning      [:maybe :string]]])

(t2/deftransforms :model/MetadataGenerationProposal
  {:attribute  mi/transform-keyword
   :confidence mi/transform-keyword
   :status     mi/transform-keyword})

(t2/define-before-insert :model/MetadataGenerationProposal
  [proposal]
  (merge {:status :pending} proposal))
