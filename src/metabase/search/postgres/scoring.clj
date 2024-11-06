(ns metabase.search.postgres.scoring
  (:require [metabase.search.config :as search.config]))

(def ^:private seconds-in-a-day 86400)

(defn- truthy
  "Return 1 for true values of a potentially nullable column."
  [column]
  [:coalesce [:cast column :integer] [:inline 0]])

(defn- saturated-fraction
  "The fraction of a positive value compared to an upper ceiling value. Capped at 1."
  [column ceiling]
  [:coalesce [:least [:/ column ceiling] [:inline 1]] [:inline 0]])

(defn- saturated-duration [from-column to-column ceiling-in-days]
  (let [ceiling [:inline ceiling-in-days]]
    [:/ [:greatest
         [:- ceiling
          [:coalesce
           [:/
            ;; Use seconds for granularity in the fraction.
            [:extract :epoch [:- to-column from-column]]
            [:inline seconds-in-a-day]]
           ceiling]]
         [:inline 0]]
     ceiling]))

(defn- idx-rank [idx-col len]
  (if (pos? len)
    [:/ [:- [:inline (dec len)] idx-col] [:inline len]]
    [:inline 1]))

(defn- multiply-columns [column-names]
  (if (seq column-names)
    (reduce (fn [expr col] [:* expr col])
            (first column-names)
            (rest column-names))
    [:inline 1]))

(defn- weighted-score [{column-alias :alias w :weight}]
  [:* [:inline (or w 0)] column-alias])

(defn- select-items [rankers]
  (into [[(multiply-columns (map weighted-score rankers))
          :total_score]]
        (for [{column-alias :alias expr :expr} rankers]
          [expr column-alias])))

(defn scorers [{:keys [stale-time-in-days dashboard-count-ceiling model-count]}]
  {:pinned    (truthy :pinned)
   ;; :bookmarked ...
   :recency   (saturated-duration [:now] :updated_at stale-time-in-days)
   :dashboard (saturated-fraction :dashboardcard_count dashboard-count-ceiling)
   :model     (idx-rank :model_index model-count)})

(honey.sql/format
 (apply honey.sql.helpers/select {:from :a} (select-items [])))

(honey.sql/format
 (apply honey.sql.helpers/select {:from :a}
        (select-items [{:alias :a :expr (truthy :pinned)}
                       {:alias :b :expr (saturated-duration [:now] :updated_at search.config/stale-time-in-days)}]))
 )
