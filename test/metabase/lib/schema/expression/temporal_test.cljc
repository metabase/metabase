(ns metabase.lib.schema.expression.temporal-test
  (:require
   [clojure.test :refer [are deftest is testing]]
   [malli.core :as mc]
   [malli.error :as me]
   [metabase.lib.schema]
   [metabase.lib.schema.expression :as expression]
   [metabase.lib.schema.expression.temporal :as temporal]))

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

(deftest ^:parallel timezone-id-test
  (are [input error] (= error
                        (me/humanize (mc/explain ::temporal/timezone-id input)))
    "US/Pacific"  nil
    "US/Specific" ["invalid timezone ID: \"US/Specific\"" "timezone offset string literal"]
    ""            ["should be at least 1 character" "non-blank string" "invalid timezone ID: \"\"" "timezone offset string literal"]
    "  "          ["non-blank string" "invalid timezone ID: \"  \"" "timezone offset string literal"]
    nil           ["should be a string" "non-blank string" "invalid timezone ID: nil" "timezone offset string literal"]))

(deftest ^:parallel convert-timezone-test
  (are [clause error] (= error
                         (me/humanize (mc/explain :mbql.clause/convert-timezone clause)))
    ;; with both target and source timezone
    [:convert-timezone
     {:lib/uuid "00000000-0000-0000-0000-000000000000"}
     [:field {:lib/uuid "00000000-0000-0000-0000-000000000000"} 1]
     "Asia/Seoul"
     "US/Pacific"]
    nil

    ;; with just the target timezone
    [:convert-timezone
     {:lib/uuid "00000000-0000-0000-0000-000000000000"}
     [:field {:lib/uuid "00000000-0000-0000-0000-000000000000"} 1]
     "Asia/Seoul"]
    nil

    ;; source cannot be nil
    [:convert-timezone
     {:lib/uuid "00000000-0000-0000-0000-000000000000"}
     [:field {:lib/uuid "00000000-0000-0000-0000-000000000000"} 1]
     "Asia/Seoul"
     nil]
    [nil nil nil nil ["should be a string" "non-blank string" "invalid timezone ID: nil" "timezone offset string literal" "Valid :convert-timezone clause"]]

    ;; invalid timezone ID
    [:convert-timezone
     {:lib/uuid "00000000-0000-0000-0000-000000000000"}
     [:field {:lib/uuid "00000000-0000-0000-0000-000000000000"} 1]
     "US/Specific"]
    [nil nil nil ["invalid timezone ID: \"US/Specific\"" "timezone offset string literal"]]))

(deftest ^:parallel get-week-test
  (are [clause error] (= error
                         (me/humanize (mc/explain :mbql.clause/get-week clause)))
    ;; without mode
    [:get-week {:lib/uuid "00000000-0000-0000-0000-000000000000"} "2023-05-25"]
    nil

    ;; with mode
    [:get-week {:lib/uuid "00000000-0000-0000-0000-000000000000"} "2023-05-25" :iso]
    nil

    ;; invalid mode
    [:get-week {:lib/uuid "00000000-0000-0000-0000-000000000000"} "2023-05-25" :isolation]
    [nil nil nil ["should be either :iso, :us or :instance" "Valid :get-week clause"]]

    ;; mode is not allowed to be nil
    [:get-week {:lib/uuid "00000000-0000-0000-0000-000000000000"} "2023-05-25" nil]
    [nil nil nil ["should be either :iso, :us or :instance" "Valid :get-week clause"]]))
