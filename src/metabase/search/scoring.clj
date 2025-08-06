(ns metabase.search.scoring
  (:require
   [clojure.string :as str]
   [honey.sql.helpers :as sql.helpers]
   [metabase.search.config :as search.config]))

(def ^:private seconds-in-a-day 86400)

(defn truthy
  "Prefer it when a (potentially nullable) boolean is true."
  [column]
  [:coalesce [:cast column :integer] [:inline 0]])

(defn equal
  "Prefer it when it matches a specific (non-null) value"
  [column value]
  [:coalesce [:case [:= column value] [:inline 1] :else [:inline 0]] [:inline 0]])

(defn prefix
  "Prefer it when the given value is a completion of a specific (non-null) value"
  [column value]
  [:coalesce [:case [:like column (str (str/replace value "%" "%%") "%")] [:inline 1] :else [:inline 0]] [:inline 0]])

(defn size
  "Prefer items whose value is larger, up to some saturation point. Items beyond that point are equivalent."
  [column ceiling]
  [:least
   [:inline 1]
   [:/
    [:coalesce column [:inline 0]]
    ;; protect against div / 0
    [:greatest
     [:inline 1]
     (if (number? ceiling)
       [:inline (double ceiling)]
       [:cast ceiling :float])]]])

(defn inverse-duration
  "Score at item based on the duration between two dates, where less is better."
  [from-column to-column ceiling-in-days]
  (let [ceiling [:inline ceiling-in-days]]
    [:/
     [:greatest
      [:- ceiling
       [:/
        ;; Use seconds for granularity in the fraction.
        ;; TODO will probably need to specialize this based on (mdb/db-type)
        [[:raw "EXTRACT(epoch FROM (" [:- to-column from-column] [:raw "))"]]]
        [:inline (double seconds-in-a-day)]]]
      [:inline 0]]
     ceiling]))

(defn sum-columns
  "Sum the columns in `column-names`."
  [column-names]
  (if (seq column-names)
    (reduce (fn [expr col] [:+ expr col])
            (first column-names)
            (rest column-names))
    [:inline 1]))

(defn weighted-score
  "Multiply a score by its weight."
  [context [column-alias expr]]
  [:* [:inline (search.config/weight context column-alias)] expr])

(defn select-items
  "Select expressions for each scorer, plus a :total_score that is the weighted sum of the `scorers`."
  [context scorers]
  (concat
   (for [[column-alias expr] scorers]
     [expr column-alias])
   [[(sum-columns (map (partial weighted-score context) scorers))
     :total_score]]))

(defn with-scores
  "Add a bunch of SELECT columns for the individual and total scores."
  [search-ctx scorers qry]
  (apply sql.helpers/select qry (select-items (:context search-ctx) scorers)))
