(ns metabase.search.schema
  "Malli schemas for the search module."
  (:require
   [metabase.util.malli.registry :as mr]
   [metabase.util.malli.schema :as ms]))

(mr/def ::search-index-metadata
  "A SearchIndexMetadata as selected from the app DB: every column of `:search_index_metadata`."
  [:map {:closed true}
   [:id         ms/PositiveInt]
   [:engine     [:or :keyword :string]]
   [:version    :string]
   [:index_name :string]
   [:status     [:maybe [:or :keyword :string]]]
   [:created_at ms/TemporalInstant]
   [:updated_at ms/TemporalInstant]
   [:lang_code  :string]])

(mr/def ::search-index-metadata.update
  "What an update (or insert) of a SearchIndexMetadata accepts: every column of `:search_index_metadata` except `id`, all optional."
  [:map {:closed true}
   [:engine     {:optional true} [:maybe [:or :keyword :string]]]
   [:version    {:optional true} [:maybe :string]]
   [:index_name {:optional true} [:maybe :string]]
   [:status     {:optional true} [:maybe [:or :keyword :string]]]
   [:created_at {:optional true} [:maybe ms/TemporalInstant]]
   [:updated_at {:optional true} [:maybe ms/TemporalInstant]]
   [:lang_code  {:optional true} [:maybe :string]]])
