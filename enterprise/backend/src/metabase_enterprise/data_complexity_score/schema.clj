(ns metabase-enterprise.data-complexity-score.schema
  "Malli schemas for the data-complexity-score module."
  (:require
   [malli.util :as mut]
   [metabase.util.malli.registry :as mr]
   [metabase.util.malli.schema :as ms]))

(mr/def ::data-complexity-score.leaf
  "A `component-score` leaf: a computed `:measurement`/`:score` pair, or an `:error` when computing it failed."
  [:or
   [:map {:closed true}
    [:measurement :double]
    [:score number?]]
   [:map {:closed true}
    [:error :string]]])

(mr/def ::data-complexity-score.catalog
  "One catalog's `score-catalog` result: a `:size`/`:ambiguity` rollup of `::data-complexity-score.leaf`s. A cached
  snapshot re-published without recomputing may carry an empty `:components`."
  [:map {:closed true}
   [:score [:maybe number?]]
   [:components
    [:map {:closed true}
     [:size {:optional true} [:map {:closed true}
                              [:score [:maybe number?]]
                              [:components [:map {:closed true}
                                            [:entity-count ::data-complexity-score.leaf]
                                            [:field-count ::data-complexity-score.leaf]]]]]
     [:ambiguity {:optional true} [:map {:closed true}
                                   [:score [:maybe number?]]
                                   [:components [:map {:closed true}
                                                 [:name-collisions ::data-complexity-score.leaf]
                                                 [:synonym-pairs ::data-complexity-score.leaf]
                                                 [:repeated-measures ::data-complexity-score.leaf]]]]]]]])

(mr/def ::data-complexity-score.score-data
  "The `:score_data` column of a DataComplexityScore, decoded."
  [:map {:closed true}
   [:library ::data-complexity-score.catalog]
   [:universe ::data-complexity-score.catalog]
   [:metabot ::data-complexity-score.catalog]
   [:meta [:map {:closed true}
           [:formula-version :int]
           [:format-version :int]
           [:synonym-threshold number?]
           [:weights {:optional true} [:map {:closed true}
                                       [:entity :int]
                                       [:name-collision :int]
                                       [:synonym-pair :int]
                                       [:field :int]
                                       [:repeated-measure :int]]]
           [:embedding-model {:optional true} [:maybe [:map {:closed true}
                                                       [:provider [:maybe [:or :string :keyword]]]
                                                       [:model-name [:maybe :string]]
                                                       [:model-dimensions [:maybe :int]]]]]
           [:text-variant {:optional true} [:maybe :keyword]]
           [:metabot-source {:optional true} [:maybe :keyword]]]]])

(mr/def ::data-complexity-score
  "A DataComplexityScore as selected from the app DB: every column of `:data_complexity_score`."
  [:merge
   ::data-complexity-score.columns
   [:map {:closed true}
    [:id          ms/PositiveInt]]])

(mr/def ::data-complexity-score.partial
  "A DataComplexityScore row as selected, where a `:columns` narrowing may have left out any column."
  [:merge ::data-complexity-score [:map {:closed true} [:id {:optional true} ms/PositiveInt]]])

(mr/def ::data-complexity-score.columns
  "Every column of `:data_complexity_score` except `id`, all optional."
  [:map {:closed true}
   [:fingerprint {:optional true} [:maybe :string]]
   [:score_data  {:optional true} [:maybe ::data-complexity-score.score-data]]
   [:created_at  {:optional true} [:maybe ms/TemporalInstantOrNow]]
   [:source      {:optional true} [:maybe [:or :keyword :string]]]])

(mr/def ::data-complexity-score.create
  "What an insert of a DataComplexityScore accepts: no column is proven immutable, so every column is allowed."
  (mut/select-keys (mr/schema ::data-complexity-score.columns) [:fingerprint :score_data :created_at :source]))

(mr/def ::data-complexity-score.column
  "A column of `:data_complexity_score`, for the `:columns` option of the queries in
  [[metabase-enterprise.data-complexity-score.db]]."
  (into [:enum :id] (mut/keys (mr/schema ::data-complexity-score.columns))))
