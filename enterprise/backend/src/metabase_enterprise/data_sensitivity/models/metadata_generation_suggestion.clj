(ns metabase-enterprise.data-sensitivity.models.metadata-generation-suggestion
  "A `metadata_generation_suggestion` is the value a metadata generation run proposes for one attribute of one field.
  `source` and `current_value` record the effective value at run time and the layer that gave it (decision
  `ghy-4721-metadata-layer-precedence`), so apply can tell when the value changed after the run. `edited_value` is
  the value a person chose in place of `proposed_value`; apply writes it as the person's value (decision
  `ghy-4721-edited-suggestion-layer`)."
  (:require
   [metabase-enterprise.data-sensitivity.models.metadata-generation-run :as run]
   [metabase.models.interface :as mi]
   [metabase.util.malli.registry :as mr]
   [metabase.util.malli.schema :as ms]
   [methodical.core :as methodical]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(methodical/defmethod t2/table-name :model/MetadataGenerationSuggestion [_model] :metadata_generation_suggestion)

(derive :model/MetadataGenerationSuggestion :metabase/model)
(derive :model/MetadataGenerationSuggestion :hook/timestamped?)

(mr/def ::source
  [:enum :human :ai :deterministic :none])

(mr/def ::confidence
  [:enum :high :medium :low])

(mr/def ::status
  [:enum :pending :accepted :rejected :stale :applied])

(mr/def ::metadata-generation-suggestion
  [:map
   [:id             ms/PositiveInt]
   [:run_id         ms/PositiveInt]
   [:table_id       ms/PositiveInt]
   [:field_id       ms/PositiveInt]
   [:attribute      ::run/attribute]
   [:source         ::source]
   [:current_value  [:maybe :string]]
   [:proposed_value :string]
   [:edited_value   [:maybe :string]]
   [:confidence     [:maybe ::confidence]]
   [:reasoning      [:maybe :string]]
   [:status         ::status]
   [:decided_by     [:maybe ms/PositiveInt]]
   [:decided_at     [:maybe some?]]
   [:created_at     some?]
   [:updated_at     some?]])

(mr/def ::new-suggestion
  "The columns a run sets when it inserts a suggestion."
  [:map {:closed true}
   [:run_id         ms/PositiveInt]
   [:table_id       ms/PositiveInt]
   [:field_id       ms/PositiveInt]
   [:attribute      ::run/attribute]
   [:source         ::source]
   [:current_value  [:maybe :string]]
   [:proposed_value :string]
   [:confidence     [:maybe ::confidence]]
   [:reasoning      [:maybe :string]]])

(t2/deftransforms :model/MetadataGenerationSuggestion
  {:attribute  mi/transform-keyword
   :source     mi/transform-keyword
   :confidence mi/transform-keyword
   :status     mi/transform-keyword})

(t2/define-before-insert :model/MetadataGenerationSuggestion
  [suggestion]
  (merge {:status :pending} suggestion))
