(ns metabase.lib.schema.expression.temporal-test
  (:require
   [clojure.test :refer [are deftest]]
   [malli.core :as mc]
   [malli.error :as me]
   [metabase.lib.schema.expression :as expression]))

(deftest ^:parallel absolute-datetime-type-of-test
  (are [literal expected] (= expected
                             (expression/type-of [:absolute-datetime
                                                  {:lib/uuid "00000000-0000-0000-0000-000000000000"}
                                                  literal
                                                  :day]))
    "2023-03-08"          :type/Date
    "2023-03-08T20:34:00" :type/DateTime))

(deftest ^:parallel absolute-datetime-test
  (are [s unit] (not (me/humanize
                      (mc/explain
                       ::expression/date
                       [:absolute-datetime {:lib/uuid "00000000-0000-0000-0000-000000000000"} s unit])))
    "2023-03-08" :day
    "2023-03"    :day
    "2023"       :day
    "2023-03-08" :default)
  (are [s unit] (not (me/humanize
                      (mc/explain
                       ::expression/datetime
                       [:absolute-datetime {:lib/uuid "00000000-0000-0000-0000-000000000000"} s unit])))
    "2023-03-08T19:55:01" :day))

(deftest ^:parallel invalid-absolute-datetime-test
  (are [expr] (me/humanize (mc/explain ::expression/date expr))
    ;; wrong literal string
    [:absolute-datetime {:lib/uuid "00000000-0000-0000-0000-000000000000"} "2023-03-08T19:55:01" :day]
    ;; wrong unit
    [:absolute-datetime {:lib/uuid "00000000-0000-0000-0000-000000000000"} "2023-03-08" :hour]
    ;; base-type specified, but it's non-temporal
    [:absolute-datetime
     {:lib/uuid "00000000-0000-0000-0000-000000000000", :base-type :type/Integer}
     "2023-03-08T19:55:01"
     :day]))
