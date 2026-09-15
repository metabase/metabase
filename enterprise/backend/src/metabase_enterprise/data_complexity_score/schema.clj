(ns metabase-enterprise.data-complexity-score.schema
  "Malli schemas for the data-complexity-score module."
  (:require
   [metabase.util.malli.registry :as mr]
   [metabase.util.malli.schema :as ms]))

(mr/def ::data-complexity-score.leaf
  "A `component-score` leaf: a computed `:measurement`/`:score` pair, or an `:error` when computing it failed."
  [:or
   [:map {:closed true, :probe/id "enterprise/backend/src/metabase_enterprise/data_complexity_score/schema.clj:10"}
    [:measurement :double]
    [:score number?]]
   [:map {:closed true, :probe/id "enterprise/backend/src/metabase_enterprise/data_complexity_score/schema.clj:13"}
    [:error :string]]])

(mr/def ::data-complexity-score.catalog
  "One catalog's `score-catalog` result: a `:size`/`:ambiguity` rollup of `::data-complexity-score.leaf`s. A cached
  snapshot re-published without recomputing may carry an empty `:components`."
  [:map {:closed true, :probe/id "enterprise/backend/src/metabase_enterprise/data_complexity_score/schema.clj:19"}
   [:score [:maybe number?]]
   [:components
    [:map {:closed true, :probe/id "enterprise/backend/src/metabase_enterprise/data_complexity_score/schema.clj:22"}
     [:size {:optional true} [:map {:closed true, :probe/id "enterprise/backend/src/metabase_enterprise/data_complexity_score/schema.clj:23"}
                              [:score [:maybe number?]]
                              [:components [:map {:closed true, :probe/id "enterprise/backend/src/metabase_enterprise/data_complexity_score/schema.clj:25"}
                                            [:entity-count ::data-complexity-score.leaf]
                                            [:field-count ::data-complexity-score.leaf]]]]]
     [:ambiguity {:optional true} [:map {:closed true, :probe/id "enterprise/backend/src/metabase_enterprise/data_complexity_score/schema.clj:28"}
                                   [:score [:maybe number?]]
                                   [:components [:map {:closed true, :probe/id "enterprise/backend/src/metabase_enterprise/data_complexity_score/schema.clj:30"}
                                                 [:name-collisions ::data-complexity-score.leaf]
                                                 [:synonym-pairs ::data-complexity-score.leaf]
                                                 [:repeated-measures ::data-complexity-score.leaf]]]]]]]])

(mr/def ::data-complexity-score.score-data
  "The `:score_data` column of a DataComplexityScore, decoded."
  [:map {:closed true, :probe/id "enterprise/backend/src/metabase_enterprise/data_complexity_score/schema.clj:37"}
   [:library ::data-complexity-score.catalog]
   [:universe ::data-complexity-score.catalog]
   [:metabot ::data-complexity-score.catalog]
   [:meta [:map {:closed true, :probe/id "enterprise/backend/src/metabase_enterprise/data_complexity_score/schema.clj:41"}
           [:formula-version :int]
           [:format-version :int]
           [:synonym-threshold number?]
           [:weights [:map {:closed true, :probe/id "enterprise/backend/src/metabase_enterprise/data_complexity_score/schema.clj:45"}
                      [:entity :int]
                      [:name-collision :int]
                      [:synonym-pair :int]
                      [:field :int]
                      [:repeated-measure :int]]]
           [:embedding-model {:optional true} [:maybe [:map {:closed true, :probe/id "enterprise/backend/src/metabase_enterprise/data_complexity_score/schema.clj:51"}
                                                       [:provider [:maybe [:or :string :keyword]]]
                                                       [:model-name [:maybe :string]]
                                                       [:model-dimensions [:maybe :int]]]]]
           [:text-variant {:optional true} [:maybe :keyword]]
           [:metabot-source {:optional true} [:maybe :keyword]]]]])

(mr/def ::data-complexity-score
  "A DataComplexityScore as selected from the app DB: every column of `:data_complexity_score`."
  [:merge
   ::data-complexity-score.update
   [:map {:closed true, :probe/id "enterprise/backend/src/metabase_enterprise/data_complexity_score/schema.clj:62"}
    [:id          ms/PositiveInt]]])

(mr/def ::data-complexity-score.update
  "What an update (or insert) of a DataComplexityScore accepts: every column of `:data_complexity_score` except `id`, all optional."
  [:map {:closed true}
   [:fingerprint {:optional true} [:maybe :string]]
   [:score_data  {:optional true} [:maybe ::data-complexity-score.score-data]]
   [:created_at  {:optional true} [:maybe ms/TemporalInstant]]
   [:source      {:optional true} [:maybe [:or :keyword :string]]]])
