(ns metabase-enterprise.semantic-search.schema
  "Malli schemas for the semantic-search module."
  (:require
   [malli.util :as mut]
   [metabase.util.malli.registry :as mr]
   [metabase.util.malli.schema :as ms]))

(mr/def ::semantic-search-token-tracking
  "A SemanticSearchTokenTracking as selected from the app DB: every column of `:semantic_search_token_tracking`."
  [:merge
   ::semantic-search-token-tracking.columns
   [:map {:closed true}
    [:id           ms/PositiveInt]]])

(mr/def ::semantic-search-token-tracking.columns
  "Every column of `:semantic_search_token_tracking` except `id`, all optional."
  [:map {:closed true}
   [:model_name   {:optional true} [:maybe :string]]
   [:request_type {:optional true} [:maybe [:or :keyword :string]]]
   [:created_at   {:optional true} [:maybe ms/TemporalInstantOrNow]]
   [:total_tokens {:optional true} [:maybe :int]]])

(mr/def ::semantic-search-token-tracking.create
  "What an insert of a SemanticSearchTokenTracking accepts."
  (mut/select-keys (mr/schema ::semantic-search-token-tracking.columns) [:model_name :request_type :total_tokens]))

(mr/def ::semantic-search-token-tracking.partial
  "A SemanticSearchTokenTracking row as selected, where a `:columns` narrowing may have left out any column."
  [:merge ::semantic-search-token-tracking [:map {:closed true} [:id {:optional true} ms/PositiveInt]]])

(mr/def ::semantic-search-token-tracking.column
  "A column of `semantic_search_token_tracking`, for the `:columns` option of the queries in
  [[metabase-enterprise.semantic-search.db]]."
  (into [:enum :id] (mut/keys (mr/schema ::semantic-search-token-tracking.columns))))
