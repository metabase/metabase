(ns metabase.search.postgres.ranking)

(def ^:private seconds-in-a-day 86400)

(defn- truthy
  "Return 1 for true values of a potentially nullable column."
  [column]
  [:coalesce [:cast column :integer] 0])

(defn- saturated-fraction
  "The fraction of a positive value compared to an upper ceiling value. Capped at 1."
  [column ceiling]
  [:coalesce [:least [:/ column ceiling] 1] 0])

(defn- saturated-duration [from-column to-column ceiling-in-days]
  (let [ceiling [:inline ceiling-in-days]]
    [:/ [:greatest
         [:- ceiling
          [:coalesce
           [:/
            ;; Use seconds for granularity in the fraction.
            [:extract :epoch [:- to-column from-column]]
            seconds-in-a-day]
           ceiling]]
         0]
     ceiling]))

[:now]

(honey.sql/format
 (honey.sql.helpers/select [(recency 10) :recency]))
