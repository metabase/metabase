(ns metabase-enterprise.data-complexity-score.schema
  "Malli schemas for the data-complexity-score module."
  (:require
   [metabase.util.malli.registry :as mr]
   [metabase.util.malli.schema :as ms]))

(mr/def ::data-complexity-score
  "A DataComplexityScore as selected from the app DB: every column of `:data_complexity_score`."
  [:map {:closed true}
   [:id          ms/PositiveInt]
   [:fingerprint [:or :string :map sequential?]]
   [:score_data  [:or :string :map sequential?]]
   [:created_at  ms/TemporalInstant]
   [:source      [:or :keyword :string]]])

(mr/def ::data-complexity-score.update
  "What an update (or insert) of a DataComplexityScore accepts: every column of `:data_complexity_score` except `id`, all optional."
  [:map {:closed true}
   [:fingerprint {:optional true} [:maybe [:or :string :map sequential?]]]
   [:score_data  {:optional true} [:maybe [:or :string :map sequential?]]]
   [:created_at  {:optional true} [:maybe ms/TemporalInstant]]
   [:source      {:optional true} [:maybe [:or :keyword :string]]]])
