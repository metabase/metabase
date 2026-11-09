(ns metabase-enterprise.data-complexity-score.schema
  "Malli schemas for the data-complexity-score module."
  (:require
   [metabase.util.malli.registry :as mr]
   [metabase.util.malli.schema :as ms]))

(mr/def ::data-complexity-score.leaf
  "A measure in the score tree: a computed `:measurement`/`:score` pair, or an `:error` when computing it failed. An
  error's nil `:score` cascades into every rollup above it."
  [:or
   [:map {:closed true}
    [:measurement :double]
    [:score number?]]
   [:map {:closed true}
    [:error :string]
    [:score {:optional true} :nil]]])

(defn- rollup
  "A rollup in the score tree: the sum of the `:components` described by `entries`. `:score` is nil when a measure
  below it failed."
  [& entries]
  [:map {:closed true}
   [:score [:maybe number?]]
   [:components (into [:map {:closed true}] entries)]])

(mr/def ::data-complexity-score.size
  "How big the catalog is."
  (rollup [:entity-count ::data-complexity-score.leaf]
          [:field-count ::data-complexity-score.leaf]
          [:collection-tree-size ::data-complexity-score.leaf]
          [:fields-per-entity ::data-complexity-score.leaf]
          [:measure-to-dim-ratio ::data-complexity-score.leaf]))

(mr/def ::data-complexity-score.synonym
  "How many entity names are semantically close to each other. Only computed at level 2."
  (rollup [:pairs ::data-complexity-score.leaf]
          [:edge-density ::data-complexity-score.leaf]
          [:components ::data-complexity-score.leaf]
          [:largest-component ::data-complexity-score.leaf]
          [:avg-component ::data-complexity-score.leaf]
          [:clustering-coef ::data-complexity-score.leaf]
          [:avg-degree ::data-complexity-score.leaf]
          [:degree (rollup [:p50 ::data-complexity-score.leaf]
                           [:p90 ::data-complexity-score.leaf]
                           [:max ::data-complexity-score.leaf])]))

(mr/def ::data-complexity-score.ambiguity
  "How easily entities are confused with each other, by exact name and by meaning."
  (rollup [:name (rollup [:collisions ::data-complexity-score.leaf]
                         [:collisions-density ::data-complexity-score.leaf]
                         [:concentration ::data-complexity-score.leaf]
                         [:field-collisions ::data-complexity-score.leaf]
                         [:repeated-measures ::data-complexity-score.leaf])]
          [:synonym {:optional true} ::data-complexity-score.synonym]))

(mr/def ::data-complexity-score.metadata
  "How much of the catalog lacks descriptions, semantic types and curation. `:embedding-coverage` is only computed at
  level 2."
  (rollup [:description-coverage ::data-complexity-score.leaf]
          [:field-description-coverage ::data-complexity-score.leaf]
          [:semantic-type-coverage ::data-complexity-score.leaf]
          [:curated-metric-coverage ::data-complexity-score.leaf]
          [:description-quality ::data-complexity-score.leaf]
          [:embedding-coverage {:optional true} ::data-complexity-score.leaf]))

(mr/def ::data-complexity-score.catalog
  "One catalog's `score-catalog` result. At level 0, or in a cached snapshot re-published without recomputing, it has
  no `:score` and an empty `:components`."
  [:map {:closed true}
   [:score {:optional true} [:maybe number?]]
   [:components [:map {:closed true}
                 [:size {:optional true} ::data-complexity-score.size]
                 [:ambiguity {:optional true} ::data-complexity-score.ambiguity]
                 [:metadata {:optional true} ::data-complexity-score.metadata]]]])

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
           [:level {:optional true} :int]
           [:weights {:optional true} [:map {:closed true}
                                       [:entity number?]
                                       [:field number?]
                                       [:collection-tree-size number?]
                                       [:fields-per-entity number?]
                                       [:measure-to-dim-ratio number?]
                                       [:name-collisions number?]
                                       [:name-collisions-density number?]
                                       [:name-concentration number?]
                                       [:name-field-collisions number?]
                                       [:name-repeated-measures number?]
                                       [:synonym-pairs number?]
                                       [:synonym-edge-density number?]
                                       [:synonym-components number?]
                                       [:synonym-largest-component number?]
                                       [:synonym-avg-component number?]
                                       [:synonym-clustering-coef number?]
                                       [:synonym-avg-degree number?]
                                       [:synonym-degree-p50 number?]
                                       [:synonym-degree-p90 number?]
                                       [:synonym-degree-max number?]
                                       [:description-coverage number?]
                                       [:field-description-coverage number?]
                                       [:semantic-type-coverage number?]
                                       [:curated-metric-coverage number?]
                                       [:embedding-coverage number?]
                                       [:description-quality number?]]]
           [:embedding-model {:optional true} [:maybe [:map {:closed true}
                                                       [:provider [:maybe [:or :string :keyword]]]
                                                       [:model-name [:maybe :string]]
                                                       [:model-dimensions [:maybe :int]]]]]
           [:text-variant {:optional true} [:maybe :keyword]]
           [:metabot-source {:optional true} [:maybe :keyword]]]]])

(mr/def ::data-complexity-score
  "A DataComplexityScore as selected from the app DB: every column of `:data_complexity_score`."
  [:merge
   ::data-complexity-score.update
   [:map {:closed true}
    [:id          ms/PositiveInt]]])

(mr/def ::data-complexity-score.update
  "What an update (or insert) of a DataComplexityScore accepts: every column of `:data_complexity_score` except `id`, all optional."
  [:map {:closed true}
   [:fingerprint {:optional true} [:maybe :string]]
   [:score_data  {:optional true} [:maybe ::data-complexity-score.score-data]]
   [:created_at  {:optional true} [:maybe ms/TemporalInstant]]
   [:source      {:optional true} [:maybe [:or :keyword :string]]]])
