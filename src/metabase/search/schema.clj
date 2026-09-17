(ns metabase.search.schema
  "Malli schemas for the search module."
  (:require
   [malli.util :as mut]
   [metabase.util.malli.registry :as mr]
   [metabase.util.malli.schema :as ms]))

(mr/def ::search-index-metadata
  "A SearchIndexMetadata as selected from the app DB: every column of `:search_index_metadata`."
  [:merge
   ::search-index-metadata.columns
   [:map {:closed true}
    [:id         ms/PositiveInt]]])

(mr/def ::search-index-metadata.partial
  "A SearchIndexMetadata row as selected, where a `:columns` narrowing may have left out any column."
  [:merge ::search-index-metadata [:map {:closed true} [:id {:optional true} ms/PositiveInt]]])

(mr/def ::search-index-metadata.columns
  "Every column of `:search_index_metadata` except `id`, all optional."
  [:map {:closed true}
   [:engine     {:optional true} [:maybe [:or :keyword :string]]]
   [:version    {:optional true} [:maybe :string]]
   [:index_name {:optional true} [:maybe :string]]
   [:status     {:optional true} [:maybe [:or :keyword :string]]]
   [:created_at {:optional true} [:maybe ms/TemporalInstantOrNow]]
   [:updated_at {:optional true} [:maybe ms/TemporalInstantOrNow]]
   [:lang_code  {:optional true} [:maybe :string]]])

(mr/def ::search-index-metadata.create
  "What an insert of a SearchIndexMetadata accepts."
  (mut/select-keys (mr/schema ::search-index-metadata.columns)
                   [:engine :version :index_name :status :created_at :updated_at :lang_code]))

(mr/def ::search-index-metadata.update
  "What an update of a SearchIndexMetadata accepts: every column but `:created_at`, which nothing ever updates."
  (mut/select-keys (mr/schema ::search-index-metadata.columns)
                   [:engine :version :index_name :status :updated_at :lang_code]))

(mr/def ::search-index-metadata.column
  "A column of `search_index_metadata`, for the `:columns` option of the queries in [[metabase.search.db]]."
  (into [:enum :id] (mut/keys (mr/schema ::search-index-metadata.columns))))
