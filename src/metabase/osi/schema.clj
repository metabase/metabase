(ns metabase.osi.schema
  "Malli schemas for the osi module."
  (:require
   [metabase.entity-retrieval.core :as entity-retrieval]
   [metabase.util.malli.registry :as mr]
   [metabase.util.malli.schema :as ms]))

(def ^:private max-item-len
  "Cap on each synonym/example string — these are short phrases or questions, not prose. They become
  embedded index docs, so this also keeps a single value under the embedding provider's token limit."
  1000)

(def ^:private max-list-len
  "Cap on the synonyms/examples list length — a curated entity needs a handful, not hundreds."
  50)

(mr/def ::osi-ai-context.ai-context
  "The `:ai_context` column of a OsiAiContext, decoded."
  [:map {:closed true, :probe/id "src/metabase/osi/schema.clj:19"}
   [:instructions {:optional true} [:maybe [:string {:max entity-retrieval/max-instructions-len}]]]
   [:synonyms     {:optional true} [:sequential {:max max-list-len} [:string {:max max-item-len}]]]
   [:examples     {:optional true} [:sequential {:max max-list-len} [:string {:max max-item-len}]]]])

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
