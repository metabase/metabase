(ns metabase.search.schema
  "Malli schemas for the search module."
  (:require
   [malli.util :as mut]
   [metabase.util.malli.registry :as mr]
   [metabase.util.malli.schema :as ms]))

(mr/def ::search-index-metadata.update
  "A SearchIndexMetadata by its `id` with the columns to change, each optional."
  [:map {:closed true}
   [:id         ms/PositiveInt]
   [:engine     {:optional true} [:maybe [:or :keyword :string]]]
   [:version    {:optional true} [:maybe :string]]
   [:index_name {:optional true} [:maybe :string]]
   [:status     {:optional true} [:maybe [:or :keyword :string]]]
   [:created_at {:optional true} [:maybe ms/TemporalInstant]]
   [:updated_at {:optional true} [:maybe ms/TemporalInstant]]
   [:lang_code  {:optional true} [:maybe :string]]])

(mr/def ::search-index-metadata.create
  "What creating a SearchIndexMetadata takes: the columns of an update without the `:id` and the timestamps, and the
  engine, version, language and status of an index, and its name."
  [:merge
   (reduce mut/dissoc ::search-index-metadata.update [:id :created_at :updated_at])
   [:map {:closed true}
    [:engine     :keyword]
    [:version    :string]
    [:lang_code  :string]
    [:status     [:enum :pending :active :retired]]
    [:index_name :string]]])

(mr/def ::search-index-metadata
  "A SearchIndexMetadata as selected from the app DB: every column of `:search_index_metadata`."
  ::search-index-metadata.update)

(mr/def ::weights.overrides
  "The search weights a client overrides, by weight name, with the context they apply to."
  [:map {:closed false, :description "search weight overrides"}
   [:context       {:default :default} :keyword]
   [:search_engine {:optional true} [:maybe :string]]])
