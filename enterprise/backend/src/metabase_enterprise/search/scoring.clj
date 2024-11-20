(ns metabase-enterprise.search.scoring
  ;; TODO -- move to `metabase-enterprise.<feature>.*`
  (:require
   [metabase.public-settings.premium-features :as premium-features :refer [defenterprise]]
   [metabase.search.config :as search.config]
   [metabase.search.in-place.scoring :as scoring]
   [metabase.search.postgres.scoring :as fulltext.scoring]))

(def ^:private enterprise-scorers
  {:official-collection {:expr (fulltext.scoring/truthy :official_collection)
                         :pred #(premium-features/has-feature? :official-collections)}
   :verified            {:expr (fulltext.scoring/truthy :verified)
                         :pred #(premium-features/has-feature? :content-verification)}})

(defn- additional-scorers
  "Which additional scorers are active?"
  []
  (into {}
        (keep (fn [[k {:keys [expr pred]}]]
                (when (pred)
                  [k expr])))
        enterprise-scorers))

(defenterprise scorers
  "Return the select-item expressions used to calculate the score for each search result."
  :feature :none
  []
  (merge (fulltext.scoring/base-scorers) (additional-scorers)))

;; ------------ LEGACY ----------

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

(def ^:private legacy-scorers
  {:official-collection official-collection-score
   :verified            verified-score})

(defn- legacy-name [k]
  (if (= k :official-collection)
    "official collection score"
    (name k)))

(defn- legacy-score-result [k result]
  {:name   (legacy-name k)
   :score  (let [f (get legacy-scorers k)]
             (f result))
   :weight (search.config/weight k)})

(defenterprise score-result
  "Scoring implementation that adds score for items in official collections."
  :feature :none
  [result]
  (into (scoring/weights-and-scores result)
        (map #(legacy-score-result % result))
        (keys (additional-scorers))))
