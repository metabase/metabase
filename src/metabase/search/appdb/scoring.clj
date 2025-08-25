(ns metabase.search.appdb.scoring
  (:require
   [clojure.core.memoize :as memoize]
   [honey.sql.helpers :as sql.helpers]
   [metabase.config.core :as config]
   [metabase.premium-features.core :refer [defenterprise]]
   [metabase.search.appdb.index :as search.index]
   [metabase.search.appdb.specialization.api :as specialization]
   [metabase.search.config :as search.config]
   [metabase.search.scoring :as search.scoring]
   [metabase.util :as u]
   [toucan2.core :as t2]))

(defn all-scores
  "Score stats for each scorer"
  [weights scorers index-row]
  (search.scoring/all-scores weights scorers index-row))

;; TODO move these to the spec definitions
(def ^:private bookmarked-models [:card :collection :dashboard])

(def ^:private sub-models {:card [:card :metric :dataset]})

(def ^:private bookmark-score-expr
  (let [match-clause (fn [m] [[:and
                               (if-let [sms (sub-models (keyword m))]
                                 [:in :search_index.model (mapv (fn [k] [:inline (name k)]) sms)]
                                 [:= :search_index.model [:inline m]])
                               [:!= nil (keyword (str m "_bookmark." m "_id"))]]
                              [:inline 1]])]
    (into [:case] (concat (mapcat (comp match-clause name) bookmarked-models) [:else [:inline 0]]))))

(defn- user-recency-expr [{:keys [current-user-id]}]
  {:select [[[:max :recent_views.timestamp] :last_viewed_at]]
   :from   [:recent_views]
   :where  [:and
            [:= :recent_views.user_id current-user-id]
            [:= [:cast :recent_views.model_id :text] :search_index.model_id]
            [:= :recent_views.model
             [:case
              [:= :search_index.model [:inline "dataset"]] [:inline "card"]
              [:= :search_index.model [:inline "metric"]] [:inline "card"]
              :else :search_index.model]]]})

(defn- view-count-percentiles*
  [p-value]
  (into {} (for [{:keys [model vcp]} (t2/query (specialization/view-count-percentile-query
                                                (search.index/active-table)
                                                p-value))]
             [(keyword model) vcp])))

(def ^{:private true
       :arglists '([p-value])}
  view-count-percentiles
  (if config/is-prod?
    (memoize/ttl view-count-percentiles*
                 :ttl/threshold (u/hours->ms 1))
    view-count-percentiles*))

(defn- view-count-expr [percentile]
  (let [views (view-count-percentiles percentile)
        cases (for [[sm v] views]
                [[:= :search_index.model [:inline (name sm)]] (max (or v 0) 1)])]
    (search.scoring/size :view_count (if (seq cases)
                                       (into [:case] cat cases)
                                       1))))

(defn- model-rank-exp [{:keys [context]}]
  (let [search-order search.config/models-search-order
        n            (double (count search-order))
        cases        (map-indexed (fn [i sm]
                                    [[:= :search_index.model sm]
                                     (or (search.config/scorer-param context :model sm)
                                         [:inline (/ (- n i) n)])])
                                  search-order)]
    (-> (into [:case] cat (concat cases))
        ;; if you're not listed, get a very poor score
        (into [:else [:inline 0.01]]))))

(defn base-scorers
  "The default constituents of the search ranking scores."
  [{:keys [search-string limit-int] :as search-ctx}]
  (if (and limit-int (zero? limit-int))
    {:model       [:inline 1]}
    ;; NOTE: we calculate scores even if the weight is zero, so that it's easy to consider how we could affect any
    ;; given set of results. At some point, we should optimize away the irrelevant scores for any given context.
    {:text         (specialization/text-score)
     :view-count   (view-count-expr search.config/view-count-scaling-percentile)
     :pinned       (search.scoring/truthy :pinned)
     :bookmarked   bookmark-score-expr
     :recency      (search.scoring/inverse-duration [:coalesce :last_viewed_at :model_updated_at] [:now] search.config/stale-time-in-days)
     :user-recency (search.scoring/inverse-duration (user-recency-expr search-ctx) [:now] search.config/stale-time-in-days)
     :dashboard    (search.scoring/size :dashboardcard_count search.config/dashboard-count-ceiling)
     :model        (model-rank-exp search-ctx)
     :mine         (search.scoring/equal :search_index.creator_id (:current-user-id search-ctx))
     :exact        (if search-string
                     ;; perform the lower casing within the database, in case it behaves differently to our helper
                     (search.scoring/equal [:lower :search_index.name] [:lower search-string])
                     [:inline 0])
     :prefix       (if search-string
                     ;; in this case, we need to transform the string into a pattern in code, so forced to use helper
                     (search.scoring/prefix [:lower :search_index.name] (u/lower-case-en search-string))
                     [:inline 0])}))

(defenterprise scorers
  "Return the select-item expressions used to calculate the score for each search result."
  metabase-enterprise.search.scoring
  [search-ctx]
  (base-scorers search-ctx))

(defn- bookmark-join [model user-id]
  (let [model-name (name model)
        table-name (str model-name "_bookmark")]
    [(keyword table-name)
     [:and
      (if-let [sms (sub-models model)]
        [:in :search_index.model (mapv (fn [m] [:inline (name m)]) sms)]
        [:= :search_index.model [:inline model-name]])
      [:= (keyword (str table-name ".user_id")) user-id]
      [:= :search_index.model_id [:cast (keyword (str table-name "." model-name "_id")) :text]]]]))

(defn- join-bookmarks [qry user-id]
  (apply sql.helpers/left-join qry (mapcat #(bookmark-join % user-id) bookmarked-models)))

(defn with-scores
  "Add a bunch of SELECT columns for the individual and total scores, and a corresponding ORDER BY."
  [{:keys [current-user-id] :as search-ctx} scorers qry]
  (-> (search.scoring/with-scores search-ctx scorers qry)
      (join-bookmarks current-user-id)
      (sql.helpers/order-by [:total_score :desc])))
