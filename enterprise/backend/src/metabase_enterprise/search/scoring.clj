(ns metabase-enterprise.search.scoring
  (:require
   [metabase.premium-features.core :refer [defenterprise]]
   [metabase.search.appdb.scoring :as appdb.scoring]
   [metabase.search.config :as search.config]
   [metabase.search.in-place.scoring :as scoring]
   [metabase.search.scoring :as search.scoring]))

(defenterprise scorers
  "Return the select-item expressions used to calculate the score for each search result."
  :feature :none
  [search-ctx view-count-percentiles]
  (assoc (appdb.scoring/base-scorers search-ctx view-count-percentiles)
         :official (search.scoring/truthy :official)))

;; ------------ LEGACY ----------

(defn- official-score
  "A scorer for items in remote-synced collections."
  [{:keys [collection_is_remote_synced]}]
  (if (contains? #{true 1} collection_is_remote_synced)
    1
    0))

(defenterprise score-result
  "Scoring implementation that adds score for items in remote-synced collections."
  :feature :none
  [result]
  (conj (scoring/weights-and-scores result)
        {:name   "official"
         :score  (official-score result)
         :weight (search.config/weight {} :official)}))
