(ns metabase.search.schema
  "Malli schemas for the search module."
  (:require
   [metabase.util.malli.registry :as mr]
   [metabase.util.malli.schema :as ms]))

(mr/def ::index-coordinate
  [:map {:closed true}
   [:engine :keyword]
   [:lang-code :string]
   [:version :string]])

(mr/def ::rebuild-context
  [:map {:closed true}
   [:coordinate ::index-coordinate]
   [:table :keyword]])

(mr/def ::document-source
  [:maybe [:or (ms/InstanceOfClass clojure.lang.IReduceInit)
           (ms/InstanceOfClass clojure.lang.Seqable)]])

(mr/def ::search-index-metadata
  "A SearchIndexMetadata as selected from the app DB: every column of `:search_index_metadata`."
  [:merge
   ::search-index-metadata.update
   [:map {:closed true}
    [:id         ms/PositiveInt]]])

(mr/def ::search-index-metadata.update
  "What an update (or insert) of a SearchIndexMetadata accepts: every column of `:search_index_metadata` except `id`, all optional."
  [:map {:closed true}
   [:engine     {:optional true} [:maybe [:or :keyword :string]]]
   [:version    {:optional true} [:maybe :string]]
   [:index_name {:optional true} [:maybe :string]]
   [:status     {:optional true} [:maybe [:or :keyword :string]]]
   [:created_at {:optional true} [:maybe ms/TemporalInstant]]
   [:updated_at {:optional true} [:maybe ms/TemporalInstant]]
   [:completed_at {:optional true} [:maybe ms/TemporalInstant]]
   [:lang_code  {:optional true} [:maybe :string]]])
