(ns metabase.lib.schema.expression.temporal-test
  (:require
   [clojure.test :refer [are deftest is testing]]
   [malli.core :as mc]
   [malli.error :as me]
   [metabase.lib.schema]
   [metabase.lib.schema.expression :as expression]))

(comment metabase.lib.schema/keep-me)

(deftest ^:parallel absolute-datetime-type-of-test
  (are [literal expected] (= expected
                             (expression/type-of [:absolute-datetime
                                                  {:lib/uuid "00000000-0000-0000-0000-000000000000"}
                                                  literal
                                                  :day]))
    "2023-03-08"          :type/Date
    "2023-03-08T20:34:00" :type/DateTime))

(deftest ^:parallel absolute-datetime-test
  (testing ::expression/date
    (are [s unit] (not (me/humanize
                        (mc/explain
                         ::expression/date
                         [:absolute-datetime {:lib/uuid "00000000-0000-0000-0000-000000000000"} s unit])))
      "2023-03-08" :day
      "2023-03"    :day
      "2023"       :day
      "2023-03-08" :default
      :current     :day
      :current     :month))
  (testing ::expression/datetime
    (are [s unit] (not (me/humanize
                        (mc/explain
                         ::expression/datetime
                         [:absolute-datetime {:lib/uuid "00000000-0000-0000-0000-000000000000"} s unit])))
      "2023-03-08T03:18-07:00" :month
      "2023-03-08T19:55:01"    :day
      :current                 :hour
      :current                 :default)))

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

(deftest ^:parallel temporal-extract-test
  (is (not (me/humanize
            (mc/explain
             :mbql.clause/temporal-extract
             [:temporal-extract
              {:lib/uuid "202ec127-f7b9-49ce-b785-cd7b96996660"}
              [:field {:temporal-unit :default, :lib/uuid "cde9c9d4-c399-4808-8476-24b65842ba82"} 1]
              :year-of-era])))))

(deftest ^:parallel relative-datetime-test
  (are [clause] (not (mc/explain :mbql.clause/relative-datetime clause))
    [:relative-datetime {:lib/uuid "00000000-0000-0000-0000-000000000000"} -1 :day]
    [:relative-datetime {:lib/uuid "00000000-0000-0000-0000-000000000000"} -1 :minute]
    [:relative-datetime {:lib/uuid "00000000-0000-0000-0000-000000000000"} 0 :day]
    [:relative-datetime {:lib/uuid "00000000-0000-0000-0000-000000000000"} :current :day]
    [:relative-datetime {:lib/uuid "00000000-0000-0000-0000-000000000000"} :current :minute]
    [:relative-datetime {:lib/uuid "00000000-0000-0000-0000-000000000000"} :current]))
