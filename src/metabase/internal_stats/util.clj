(ns metabase.internal-stats.util)

(defn count-case
  "Counts number of times a boolean value is try for a SQL query"
  [case-boolean]
  [:count [:case case-boolean [:inline 1] :else [:inline nil]]])
