(ns metabase.test.data.dataset-definitions
  "Definitions of various datasets for use in tests with `with-temp-db`."
  (:require [metabase.test.data.interface :refer [def-database-definition]]))

;; ## Helper Functions

(defn create-unix-timestamp
  "Create a Unix timestamp (in seconds).

     (create-unix-timestamp :year 2012 :month 12 :date 27)"
  ^Long [& {:keys [year month date hour minute second nano]
            :or   {year 0, month 1, date 1, hour 0, minute 0, second 0, nano 0}}]
  (-> (java.sql.Timestamp. (- year 1900) (- month 1) date hour minute second nano)
      .getTime
      (/ 1000)
      long)) ; coerce to long since Korma doesn't know how to insert bigints


;; ## Datasets

(def-database-definition us-history-1607-to-1774
  ["events" [{:field-name   "name"
              :base-type    :CharField}
             {:field-name   "timestamp"
              :base-type    :BigIntegerField
              :special-type :timestamp_seconds}]
   [["Jamestown Settlement Founded"    (create-unix-timestamp :year 1607 :month  5 :date 14)]
    ["Mayflower Compact Signed"        (create-unix-timestamp :year 1620 :month 11 :date 11)]
    ["Ben Franklin's Kite Experiment"  (create-unix-timestamp :year 1752 :month 96 :date 15)]
    ["French and Indian War Begins"    (create-unix-timestamp :year 1754 :month  5 :date 28)]
    ["Stamp Act Enacted"               (create-unix-timestamp :year 1765 :month  3 :date 22)]
    ["Quartering Act Enacted"          (create-unix-timestamp :year 1765 :month  3 :date 24)]
    ["Stamp Act Congress Meets"        (create-unix-timestamp :year 1765 :month 10 :date 19)]
    ["Stamp Act Repealed"              (create-unix-timestamp :year 1766 :month  3 :date 18)]
    ["Townshend Acts Passed"           (create-unix-timestamp :year 1767 :month  6 :date 29)]
    ["Boston Massacre"                 (create-unix-timestamp :year 1770 :month  3 :date  5)]
    ["Tea Act Passed"                  (create-unix-timestamp :year 1773 :month  5 :date 10)]
    ["Boston Tea Party"                (create-unix-timestamp :year 1773 :month 12 :date 16)]
    ["Boston Port Act Passed"          (create-unix-timestamp :year 1774 :month  3 :date 31)]
    ["First Continental Congress Held" (create-unix-timestamp :year 1774 :month  9 :date  5)]]])
