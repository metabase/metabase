(ns metabase.osi.schema
  "Malli schemas for the osi module."
  (:require
   [metabase.util.malli.registry :as mr]
   [metabase.util.malli.schema :as ms]))

(mr/def ::osi-ai-context.ai-context
  "The `:ai_context` column of a OsiAiContext, decoded."
  :map)

(mr/def ::osi-ai-context
  "A OsiAiContext as selected from the app DB: every column of `:osi_ai_context`."
  [:map {:closed true}
   [:entity_type     [:or :keyword :string]]
   [:entity_local_id ms/PositiveInt]
   [:ai_context      ::osi-ai-context.ai-context]
   [:created_at      ms/TemporalInstant]
   [:updated_at      ms/TemporalInstant]])

(mr/def ::osi-ai-context.update
  "What an update (or insert) of a OsiAiContext accepts: every column of `:osi_ai_context` except `id`, all optional."
  [:map {:closed true}
   [:entity_type     {:optional true} [:maybe [:or :keyword :string]]]
   [:entity_local_id {:optional true} [:maybe ms/PositiveInt]]
   [:ai_context      {:optional true} [:maybe ::osi-ai-context.ai-context]]
   [:created_at      {:optional true} [:maybe ms/TemporalInstant]]
   [:updated_at      {:optional true} [:maybe ms/TemporalInstant]]])
