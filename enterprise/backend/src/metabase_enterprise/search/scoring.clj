(ns metabase-enterprise.search.scoring
  ;; TODO -- move to `metabase-enterprise.<feature>.*`
  (:require [metabase.public-settings.premium-features :refer [defenterprise]]
            [metabase.search.scoring :as scoring]))

(defn- official-collection-score
  "A scorer for items in official collections"
  [{:keys [collection_authority_level]}]
  (if (contains? #{"official"} collection_authority_level)
    1
    0))

(defn- verified-score
  "A scorer for verified items."
  [{:keys [moderated_status]}]
  (if (contains? #{"verified"} moderated_status)
    1
    0))

(defenterprise score-result
  "Scoring implementation that adds score for items in official collections."
  :feature :any
  [result]
  (conj (scoring/weights-and-scores result)
        {:weight 2
         :score  (official-collection-score result)
         :name   "official collection score"}
        {:weight 2
         :score  (verified-score result)
         :name   "verified"}))
