(ns metabase-enterprise.replacement.schema
  (:require
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.source-swap.schema :as source-swap.schema]
   [metabase.util.malli.registry :as mr]
   [metabase.util.malli.schema :as ms]))

(set! *warn-on-reflection* true)

(mr/def ::source-entity-id
  [:or ::lib.schema.id/card ::lib.schema.id/table])

(mr/def ::source-entity-type
  [:enum :card :table :transform])

(mr/def ::run-id
  pos-int?)

(mr/def ::run-status
  [:enum :pending :started :succeeded :failed :canceled :timeout])

(mr/def ::run
  [:map
   [:id ::run-id]
   [:status ::run-status]
   [:is_active [:maybe :boolean]]
   [:source_entity_type ::source-entity-type]
   [:source_entity_id ::source-entity-id]
   [:target_entity_type ::source-entity-type]
   [:target_entity_id ::source-entity-id]
   [:progress [:maybe number?]]
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

(mr/def ::error-type
  [:enum :cycle-detected :database-mismatch :incompatible-implicit-joins :affects-gtap-policies])

(mr/def ::column-mapping
  [:map
   [:source {:optional true} [:maybe ::column]]
   [:target {:optional true} [:maybe ::column]]
   [:errors {:optional true} [:sequential ::source-swap.schema/column-error]]])

(mr/def ::check-replace-source-response
  [:map
   [:success         :boolean]
   [:errors          {:optional true} [:sequential ::error-type]]
   [:column_mappings {:optional true} [:sequential ::column-mapping]]])

(mr/def ::replacement-run
  "A ReplacementRun as selected from the app DB: every column of `:source_replacement_run`."
  [:map {:closed true}
   [:id                 ms/PositiveInt]
   [:source_entity_type [:or :keyword :string]]
   [:source_entity_id   ms/PositiveInt]
   [:target_entity_type [:or :keyword :string]]
   [:target_entity_id   ms/PositiveInt]
   [:status             [:or :keyword :string]]
   [:is_active          [:maybe :boolean]]
   [:progress           [:maybe number?]]
   [:message            [:maybe :string]]
   [:user_id            [:maybe ::lib.schema.id/user]]
   [:start_time         ms/TemporalInstant]
   [:end_time           [:maybe ms/TemporalInstant]]])

(mr/def ::replacement-run.update
  "What an update (or insert) of a ReplacementRun accepts: every column of `:source_replacement_run` except `id`, all optional."
  [:map {:closed true}
   [:source_entity_type {:optional true} [:maybe [:or :keyword :string]]]
   [:source_entity_id   {:optional true} [:maybe ms/PositiveInt]]
   [:target_entity_type {:optional true} [:maybe [:or :keyword :string]]]
   [:target_entity_id   {:optional true} [:maybe ms/PositiveInt]]
   [:status             {:optional true} [:maybe [:or :keyword :string]]]
   [:is_active          {:optional true} [:maybe :boolean]]
   [:progress           {:optional true} [:maybe number?]]
   [:message            {:optional true} [:maybe :string]]
   [:user_id            {:optional true} [:maybe ::lib.schema.id/user]]
   [:start_time         {:optional true} [:maybe ms/TemporalInstant]]
   [:end_time           {:optional true} [:maybe ms/TemporalInstant]]])
