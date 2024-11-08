(ns metabase.search.postgres.scoring
  (:require
   [honey.sql.helpers :as sql.helpers]
   [metabase.api.common :as api]
   [metabase.search.config :as search.config]))

(def ^:private seconds-in-a-day 86400)

(defn- truthy
  "Prefer it when a (potentially nullable) boolean is true."
  [column]
  [:coalesce [:cast column :integer] [:inline 0]])

(defn- size
  "Prefer items whose value is larger, up to some saturation point. Items beyond that point are equivalent."
  [column ceiling]
  [:least [:/ [:coalesce column [:inline 0]] [:inline (double ceiling)]] [:inline 1]])

(defn- inverse-duration
  "Score at item based on the duration between two dates, where less is better."
  [from-column to-column ceiling-in-days]
  (let [ceiling [:inline ceiling-in-days]]
    [:/
     [:greatest
      [:- ceiling
       [:/
        ;; Use seconds for granularity in the fraction.
        [[:raw "EXTRACT(epoch FROM (" [:- to-column from-column] [:raw "))"]]]
        [:inline (double seconds-in-a-day)]]]
      [:inline 0]]
     ceiling]))

(defn- idx-rank
  "Prefer items whose value is earlier in some list."
  [idx-col len]
  (if (pos? len)
    [:/ [:- [:inline (dec len)] idx-col] [:inline len]]
    [:inline 1]))

(defn- sum-columns [column-names]
  (if (seq column-names)
    (reduce (fn [expr col] [:+ expr col])
            (first column-names)
            (rest column-names))
    [:inline 1]))

(defn- weighted-score [[column-alias expr]]
  [:* [:inline (search.config/weights column-alias 0)] expr])

(defn- select-items [scorers]
  (concat
   (for [[column-alias expr] scorers]
     [expr column-alias])
   [[(sum-columns (map weighted-score scorers))
     :total_score]]))

(def ^:private scorers
  ;; ts_rank 1: divides rank by log(len(doc))
  {:text      [:ts_rank :search_vector :query [:inline 1]]
   :pinned    (truthy :pinned)
   :bookmarked [:case
                [:and [:= :model "card"] [:!= nil :card_bookmark.card_id]] [:inline 1]
                [:and [:= :model "collection"] [:!= nil :collection_bookmark.collection_id]] [:inline 1]
                [:and [:= :model "dashboard"] [:!= nil :dashboard_bookmark.dashboard_id]] [:inline 1]
                :else [:inline 0]]
   :recency (inverse-duration :model_updated_at [:now] search.config/stale-time-in-days)
   :dashboard (size :dashboardcard_count search.config/dashboard-count-ceiling)
   :model (idx-rank :model_rank (count search.config/all-models))})

(def ^:private precalculated-select-items (select-items scorers))

(defn with-scores
  "Add a bunch of SELECT columns for the individual and total scores, and a corresponding ORDER BY."
  [qry]
  (-> (apply sql.helpers/select qry precalculated-select-items)
      ;; todo: must join only on current user
      (sql.helpers/left-join
       :card_bookmark [:and [:= :model [:inline "card"]] [:and [:= api/*current-user-id* :card_bookmark.user_id] [:= :model_id :card_id]]]
       :collection_bookmark [:and [:= :model [:inline "collection"]] [:and [:= api/*current-user-id* :collection_bookmark.user_id] [:= :model_id :collection_bookmark.collection_id]]]
       :dashboard_bookmark [:and [:= :model [:inline "dashboard"]] [:and [:= api/*current-user-id* :dashboard_bookmark.user_id] [:= :model_id :dashboard_id]]])
      (sql.helpers/order-by [:total_score :desc])))
