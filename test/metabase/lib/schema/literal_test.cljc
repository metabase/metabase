(ns metabase.lib.schema.literal-test
  (:require
   [clojure.test :refer [are deftest is testing]]
   [malli.core :as mc]
   [metabase.lib.schema.expression :as expression]
   [metabase.lib.schema.literal :as literal]
   [malli.error :as me]))

(deftest ^:parallel integer-literal-test
  (testing "valid schemas"
    (are [n] (are [schema] (mc/validate schema n)
               ::expression/integer
               ::expression/number
               ::expression/orderable
               ::expression/equality-comparable
               ::expression/expression)
      (int 1)
      (long 1)
      #?@(:clj ((bigint 1)
                (biginteger 1)))))
  (testing "invalid schemas"
    (are [n] (are [schema] (mc/explain schema n)
               ::expression/boolean
               ::expression/string
               ::expression/date
               ::expression/time
               ::expression/datetime
               ::expression/temporal)
      (int 1)
      (long 1)
      #?@(:clj ((bigint 1)
                (biginteger 1))))))

(deftest ^:parallel string-literal-type-of-test
  (is (mc/validate ::literal/string.datetime "2023-03-08T03:18"))
  (are [s expected] (= expected
                       (expression/type-of s))
    ""                 :type/Text
    "abc"              :type/Text
    "2023"             :type/Text
    "2023-03-08"       #{:type/Text :type/Date}
    "03:18"            #{:type/Text :type/Time}
    "2023-03-08T03:18" #{:type/Text :type/DateTime}))

(deftest ^:parallel string-literal-test
  (testing "valid schemas"
    (are [schema] (mc/validate schema "s")
      ::expression/string
      ::expression/orderable
      ::expression/equality-comparable
      ::expression/expression))
  (testing "invalid schemas"
    (are [schema] (mc/explain schema "s")
      ::expression/boolean
      ::expression/integer
      ::expression/number
      ::expression/date
      ::expression/time
      ::expression/datetime
      ::expression/temporal)))

(deftest ^:parallel absolute-datetime-type-of-test
  (are [literal expected] (= expected
                             (expression/type-of [:absolute-datetime
                                                  {:lib/uuid "00000000-0000-0000-0000-000000000000"}
                                                  literal
                                                  :day]))
    "2023-03-08"          :type/Date
    "2023-03-08T20:34:00" :type/DateTime))

(deftest ^:parallel temporal-literals-test
  (are [expr schema] (not (me/humanize (mc/explain schema expr)))
    "2023-03-08"
    ::literal/date

    [:absolute-datetime
     {:base-type :type/Date, :lib/uuid "00000000-0000-0000-0000-000000000000"}
     "2023-03-08"
     :day]
    ::literal/date

    [:absolute-datetime
     {:base-type :type/Date, :lib/uuid "00000000-0000-0000-0000-000000000000"}
     "2023-03-08"
     :default]
    ::literal/date))

(deftest ^:parallel invalid-temporal-literals-test
  (are [expr schema] (me/humanize (mc/explain schema expr))
    "2023-03-08T19:55:01"
    ::literal/date

    ;; wrong literal string
    [:absolute-datetime
     {:base-type :type/Date, :lib/uuid "00000000-0000-0000-0000-000000000000"}
     "2023-03-08T19:55:01"
     :day]
    ::literal/date

    ;; wrong base type
    [:absolute-datetime
     {:base-type :type/DateTime, :lib/uuid "00000000-0000-0000-0000-000000000000"}
     "2023-03-08"
     :day]
    ::literal/date

    ;; wrong unit
    [:absolute-datetime
     {:base-type :type/Date, :lib/uuid "00000000-0000-0000-0000-000000000000"}
     "2023-03-08"
     :hour]
    ::literal/date))
