(ns metabase-enterprise.search.scoring
  (:require [metabase-enterprise.enhancements.ee-strategy-impl :as ee-strategy-impl]
            [metabase.public-settings.metastore :as settings.metastore]
            [metabase.search.scoring :as scoring]))

(defn- official-collection-score
  "A scorer for items in official collections"
  [{:keys [collection_authority_level]}]
  (if (contains? #{"official"} collection_authority_level)
    1
    0))

(def scoring-impl
  "Scoring implementation that adds score for items in official collections."
  (reify scoring/ResultScore
    (score-result [_ result]
      (conj (scoring/score-result scoring/oss-score-impl result)
            {:weight 2
             :score  (official-collection-score result)
             :name   "official collection score"}))))

(def ee-scoring
  "Enterprise scoring of results, falling back to the open source version if enterprise is not enabled."
  (ee-strategy-impl/reify-ee-strategy-impl #'settings.metastore/enable-enhancements?
                                           scoring-impl scoring/oss-score-impl
                                           scoring/ResultScore))
