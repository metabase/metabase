(ns metabase-enterprise.replacement.schema
  (:require
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.util.malli.registry :as mr]
   [metabase.util.malli.schema :as ms]))

(set! *warn-on-reflection* true)

(mr/def ::entity-id
  [:or ::lib.schema.id/card ::lib.schema.id/table])

(mr/def ::entity-type
  [:enum :card :table :dashboard :transform :segment :measure])

(mr/def ::entity-ref
  [:tuple ::entity-type ::entity-id])

(mr/def ::run-id
  pos-int?)

(mr/def ::run-status
  [:enum :started :succeeded :failed :canceled :timeout])

(mr/def ::run
  [:map
   [:id ::run-id]
   [:status ::run-status]
   [:is_active [:maybe :boolean]]
   [:source_entity_type ::entity-type]
   [:source_entity_id ::entity-id]
   [:target_entity_type ::entity-type]
   [:target_entity_id ::entity-id]
   [:progress [:maybe :double]]
   [:message [:maybe :string]]
   [:user_id [:maybe ::lib.schema.id/user]]
   [:start_time ms/TemporalInstant]
   [:end_time [:maybe ms/TemporalInstant]]])

(mr/def ::column
  [:map
   [:id             [:maybe ::lib.schema.id/field]]
   [:name           :string]
   [:display_name   :string]
   [:base_type      [:maybe :string]]
   [:effective_type [:maybe :string]]
   [:semantic_type  [:maybe :string]]])

(mr/def ::column-error-type
  [:enum :column-type-mismatch :missing-primary-key :extra-primary-key :missing-foreign-key :foreign-key-mismatch])

(mr/def ::error-type
  [:enum :cycle-detected :database-mismatch :incompatible-implicit-joins])

(mr/def ::column-mapping
  [:map
   [:source {:optional true} [:maybe ::column]]
   [:target {:optional true} [:maybe ::column]]
   [:errors {:optional true} [:sequential ::column-error-type]]])

(mr/def ::check-replace-source-response
  [:map
   [:success         :boolean]
   [:errors          {:optional true} [:sequential ::error-type]]
   [:column_mappings {:optional true} [:sequential ::column-mapping]]])
