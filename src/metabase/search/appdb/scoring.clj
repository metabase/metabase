(ns metabase.search.appdb.scoring
  (:require
   [honey.sql.helpers :as sql.helpers]
   [metabase.premium-features.core :refer [defenterprise]]
   [metabase.search.appdb.specialization.api :as specialization]
   [metabase.search.config :as search.config]
   [metabase.search.query-expr :as query-expr]
   [metabase.search.scoring :as search.scoring]))

(defn all-scores
  "Score stats for each scorer"
  [weights scorers index-row]
  (search.scoring/all-scores weights scorers index-row))

(defn- view-count-expr [view-count-percentiles]
  (let [cases (for [[sm v] view-count-percentiles]
                [[:= :search_index.model (name sm)] (max (or v 0) 1)])]
    (search.scoring/size :view_count (if (seq cases)
                                       (into [:case] cat cases)
                                       1))))

(defn- name-scoring-texts
  "The texts to compare result names against: see [[query-expr/name-scoring-texts]] for a structured query."
  [search-expr search-string]
  (cond
    search-expr   (query-expr/name-scoring-texts search-expr)
    search-string [search-string]
    :else         []))

(defn- best-name-score
  "The best of `score-fn` over `texts`, or 0 when there are none."
  [texts score-fn]
  (case (count texts)
    0 [:inline 0]
    1 (score-fn (first texts))
    (into [:greatest] (map score-fn) texts)))

(defn base-scorers
  "The default constituents of the search ranking scores. `view-count-percentiles` maps each model to its view-count
  percentile (see `metabase.search.db/view-count-percentile-rows`)."
  [{:keys [search-expr search-string] :as search-ctx} view-count-percentiles]
  (if (search.scoring/no-scoring-required? search-ctx)
    {:model       [:inline 1]}
    ;; NOTE: we calculate scores even if the weight is zero, so that it's easy to consider how we could affect any
    ;; given set of results. At some point, we should optimize away the irrelevant scores for any given context.
    {:text         (specialization/text-score)
     :view-count   (view-count-expr view-count-percentiles)
     :pinned       (search.scoring/truthy :pinned)
     :bookmarked   search.scoring/bookmark-score-expr
     :recency      (search.scoring/inverse-duration [:coalesce :last_viewed_at :model_updated_at] [:now] search.config/stale-time-in-days)
     :user-recency (search.scoring/inverse-duration (search.scoring/user-recency-expr search-ctx) [:now] search.config/stale-time-in-days)
     :dashboard    (search.scoring/size :dashboardcard_count search.config/dashboard-count-ceiling)
     :model        (search.scoring/model-rank-expr search-ctx)
     :mine         (search.scoring/equal :search_index.creator_id (:current-user-id search-ctx))
     :exact        (best-name-score (name-scoring-texts search-expr search-string)
                                    ;; normalize both sides in the database, in case it behaves differently to our helper
                                    #(search.scoring/equal (search.scoring/normalize-text-expr :search_index.name)
                                                           (search.scoring/normalize-text-expr %)))
     :prefix       (best-name-score (name-scoring-texts search-expr search-string)
                                    ;; in this case, we need to transform the string into a pattern in code, so forced to use helper
                                    #(search.scoring/prefix (search.scoring/normalize-text-expr :search_index.name)
                                                            (search.scoring/normalize-text %)))
     :library      (search.scoring/library-score-expr)
     :data-layer   (search.scoring/data-layer-score-expr search-ctx)}))

(defenterprise scorers
  "Return the select-item expressions used to calculate the score for each search result."
  metabase-enterprise.search.scoring
  [search-ctx view-count-percentiles]
  (base-scorers search-ctx view-count-percentiles))

(defn with-scores
  "Add a bunch of SELECT columns for the individual and total scores, and a corresponding ORDER BY."
  [{:keys [current-user-id] :as search-ctx} scorers qry]
  (-> (search.scoring/with-scores search-ctx scorers qry)
      (search.scoring/join-bookmarks current-user-id)
      (sql.helpers/order-by [:total_score :desc])))
