(ns metabase.search.postgres.scoring
  (:require
   [honey.sql.helpers :as sql.helpers]
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
  ;; TODO bookmarked (user specific)
  {:text      [:ts_rank :search_vector :query]
   :pinned    (truthy :pinned)
   :recency   (inverse-duration :model_updated_at [:now] search.config/stale-time-in-days)
   :dashboard (size :dashboardcard_count search.config/dashboard-count-ceiling)
   :model     (idx-rank :model_rank (count search.config/all-models))})

(def ^:private precalculated-select-items (select-items scorers))

(defn with-scores
  "Add a bunch of SELECT columns for the individual and total scores, and a corresponding ORDER BY."
  [qry]
  (-> (apply sql.helpers/select qry precalculated-select-items)
      (sql.helpers/order-by [:total_score :desc])))
