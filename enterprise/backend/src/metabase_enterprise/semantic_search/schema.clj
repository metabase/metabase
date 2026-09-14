(ns metabase-enterprise.semantic-search.schema
  "Malli schemas for the semantic-search module."
  (:require
   [metabase.util.malli.registry :as mr]
   [metabase.util.malli.schema :as ms]))

(mr/def ::semantic-search-token-tracking
  "A SemanticSearchTokenTracking as selected from the app DB: every column of `:semantic_search_token_tracking`."
  [:map {:closed true}
   [:id           ms/PositiveInt]
   [:model_name   :string]
   [:request_type [:maybe [:or :keyword :string]]]
   [:created_at   ms/TemporalInstant]
   [:total_tokens :int]])

(mr/def ::semantic-search-token-tracking.update
  "What an update (or insert) of a SemanticSearchTokenTracking accepts: every column of `:semantic_search_token_tracking` except `id`, all optional."
  [:map {:closed true}
   [:model_name   {:optional true} [:maybe :string]]
   [:request_type {:optional true} [:maybe [:or :keyword :string]]]
   [:created_at   {:optional true} [:maybe ms/TemporalInstant]]
   [:total_tokens {:optional true} [:maybe :int]]])
