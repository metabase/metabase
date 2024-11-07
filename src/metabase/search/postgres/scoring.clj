(ns metabase.search.postgres.scoring
  (:require [honey.sql :as sql]
            [honey.sql.helpers :as sql.helpers]
            [metabase.search.config :as search.config]))

(def ^:private seconds-in-a-day 86400)

(defn- truthy
  "Prefer it when a (potentially nullable) boolean is true."
  [column]
  [:coalesce [:cast column :integer] [:inline 0]])

(defn- fraction
  "Prefer items whose value is closer to achieving some saturation point. Items beyond that point are equivalent."
  [column ceiling]
  [:least [:/ [:coalesce column [:inline 0]] [:inline (double ceiling)]] [:inline 1]])

(defn- duration-fraction
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
  ;; this repetition of the form sucks
  [:* [:inline (search.config/weights column-alias 0)]
   #_(keyword (str (name column-alias) "_score"))
   expr])

(defn- select-items [scorers]
  (concat
   (for [[column-alias expr] scorers]
     [expr column-alias])
   [[(sum-columns (map weighted-score scorers))
     :total_score]]))

(defn- scorers [{:keys [stale-time-in-days dashboard-count-ceiling model-count]}]
  {:text      [:ts_rank :search_vector :query]
   :pinned    (truthy :pinned)
   ;; :bookmarked user specific join
   :recency   (duration-fraction :model_updated_at [:now] stale-time-in-days)
   :dashboard (fraction :dashboardcard_count dashboard-count-ceiling)
   :model     (idx-rank :model_rank model-count)})

(def ^:private select-items-4real
  (select-items (scorers {:stale-time-in-days      search.config/stale-time-in-days
                          :dashboard-count-ceiling search.config/dashboard-count-ceiling
                          :model-count             (count search.config/all-models)})))

(defn ranking-clause
  "Add a bunch of selects for the individual and total scores"
  [qry]
  (apply sql.helpers/select qry select-items-4real))

(comment
  (sql/format
   (apply sql.helpers/select {:from :a} (select-items {})))

  (sql/format
   (apply sql.helpers/select {:from :a}
          (select-items {:a (truthy :pinned)
                         :b (duration-fraction [:now] :updated_at search.config/stale-time-in-days)}))))

(sql/format
 (apply sql.helpers/select {:from :search_index} select-items-4real))
