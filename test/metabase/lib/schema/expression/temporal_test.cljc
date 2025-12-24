(ns metabase.lib.schema.expression.temporal-test
  (:require
   [clojure.test :refer [are deftest is testing]]
   [malli.error :as me]
   [metabase.lib.core :as lib]
   [metabase.lib.schema]
   [metabase.lib.schema.expression :as expression]
   [metabase.lib.schema.expression.temporal :as temporal]
   [metabase.util.malli.registry :as mr]))

(comment metabase.lib.schema/keep-me)

(def ^:private default-options
  {:lib/uuid "00000000-0000-0000-0000-000000000000"})

(deftest ^:parallel absolute-datetime-type-of-test
  (are [literal expected] (= expected
                             (expression/type-of [:absolute-datetime
                                                  default-options
                                                  literal
                                                  :day]))
    "2023-03-08"          :type/Date
    "2023-03-08T20:34:00" :type/DateTime))

(deftest ^:parallel absolute-datetime-test
  (testing ::expression/date
    (are [s unit] (not (me/humanize
                        (mr/explain
                         ::expression/date
                         [:absolute-datetime default-options s unit])))
      "2023-03-08" :day
      "2023-03"    :day
      "2023"       :day
      "2023-03-08" :default
      :current     :day
      :current     :month))
  (testing ::expression/datetime
    (are [s unit] (not (me/humanize
                        (mr/explain
                         ::expression/datetime
                         [:absolute-datetime default-options s unit])))
      "2023-03-08T03:18-07:00" :month
      "2023-03-08T19:55:01"    :day
      :current                 :hour
      :current                 :default)))

(deftest ^:parallel invalid-absolute-datetime-test
  (binding [expression/*suppress-expression-type-check?* false]
    (are [expr] (me/humanize (mr/explain ::expression/date expr))
      ;; wrong literal string
      [:absolute-datetime default-options "2023-03-08T19:55:01" :day]
      ;; wrong unit
      [:absolute-datetime default-options "2023-03-08" :hour]
      ;; base-type specified, but it's non-temporal
      [:absolute-datetime
       {:lib/uuid "00000000-0000-0000-0000-000000000000", :base-type :type/Integer}
       "2023-03-08T19:55:01"
       :day])))

(deftest ^:parallel temporal-extract-test
  (is (not (me/humanize
            (mr/explain
             :mbql.clause/temporal-extract
             [:temporal-extract
              {:lib/uuid "202ec127-f7b9-49ce-b785-cd7b96996660"}
              [:field {:temporal-unit :default, :lib/uuid "cde9c9d4-c399-4808-8476-24b65842ba82"} 1]
              :year-of-era])))))

(deftest ^:parallel relative-datetime-test
  (are [clause] (not (mr/explain :mbql.clause/relative-datetime clause))
    [:relative-datetime default-options -1 :day]
    [:relative-datetime default-options -1 :minute]
    [:relative-datetime default-options 0 :day]
    [:relative-datetime default-options :current :day]
    [:relative-datetime default-options :current :minute]
    [:relative-datetime default-options :current]))

(deftest ^:parallel datetime-diff-test
  (are [clause] (not (mr/explain :mbql.clause/datetime-diff clause))
    [:datetime-diff default-options "2024-01-01" "2024-01-02" :year]
    [:datetime-diff default-options "2024-01-01" "2024-01-02" :quarter]
    [:datetime-diff default-options "2024-01-01" "2024-01-02" :month]
    [:datetime-diff default-options "2024-01-01" "2024-01-02" :week]
    [:datetime-diff default-options "2024-01-01" "2024-01-02" :day]
    [:datetime-diff default-options "2024-01-01T10:20:30" "2024-01-02T20:30:40" :hour]
    [:datetime-diff default-options "2024-01-01T10:20:30" "2024-01-02T20:30:40" :minute]
    [:datetime-diff default-options "2024-01-01T10:20:30" "2024-01-02T20:30:40" :second]))

(deftest ^:parallel invalid-datetime-diff-test
  (are [clause] (mr/explain :mbql.clause/datetime-diff clause)
    [:datetime-diff default-options "2024-01-01T10:20:30" "2024-01-02T20:30:40" :millisecond]))

(deftest ^:parallel timezone-id-test
  (are [input error] (= error
                        (me/humanize (mr/explain ::temporal/timezone-id input)))
    "US/Pacific"  nil
    "US/Specific" ["invalid timezone ID: \"US/Specific\"" "timezone offset string literal"]
    ""            ["should be at least 1 character" "non-blank string" "invalid timezone ID: \"\"" "timezone offset string literal"]
    "  "          ["non-blank string" "invalid timezone ID: \"  \"" "timezone offset string literal"]
    nil           ["should be a string" "non-blank string" "invalid timezone ID: nil" "timezone offset string literal"]))

(deftest ^:parallel convert-timezone-test
  (are [clause error] (= error
                         (me/humanize (mr/explain :mbql.clause/convert-timezone clause)))
    ;; with both target and source timezone
    [:convert-timezone
     default-options
     [:field default-options 1]
     "Asia/Seoul"
     "US/Pacific"]
    nil

    ;; with just the target timezone
    [:convert-timezone
     default-options
     [:field default-options 1]
     "Asia/Seoul"]
    nil

    ;; source cannot be nil
    [:convert-timezone
     default-options
     [:field default-options 1]
     "Asia/Seoul"
     nil]
    [nil nil nil nil ["should be a string" "non-blank string" "invalid timezone ID: nil" "timezone offset string literal" "Valid :convert-timezone clause"]]

    ;; invalid timezone ID
    [:convert-timezone
     default-options
     [:field default-options 1]
     "US/Specific"]
    [nil nil nil ["invalid timezone ID: \"US/Specific\"" "timezone offset string literal"]]))

(deftest ^:parallel get-week-test
  (are [clause error] (= error
                         (me/humanize (mr/explain :mbql.clause/get-week clause)))
    ;; without mode
    [:get-week default-options "2023-05-25"]
    nil

    ;; with mode
    [:get-week default-options "2023-05-25" :iso]
    nil

    ;; invalid mode
    [:get-week default-options "2023-05-25" :isolation]
    [nil nil nil ["should be either :iso, :us or :instance" "Valid :get-week clause"]]

    ;; mode is not allowed to be nil
    [:get-week default-options "2023-05-25" nil]
    [nil nil nil ["should be either :iso, :us or :instance" "Valid :get-week clause"]]))

(deftest ^:parallel normalize-datetime-test
  (is (= [:datetime
          {:lib/uuid "8b343e3b-a549-4d22-87a3-d5888793209b", :mode :simple-bytes, :lib/expression-name "parsed_date"}
          [:field
           {:lib/uuid "9da67f88-9c46-4917-b964-07806f60870c", :effective-type :type/*, :base-type :type/*}
           "DATE_TIME"]]
         (lib/normalize
          ["datetime"
           {:lib/uuid "8b343e3b-a549-4d22-87a3-d5888793209b", :mode "simple-bytes", :lib/expression-name "parsed_date"}
           ["field"
            {:lib/uuid "9da67f88-9c46-4917-b964-07806f60870c", :effective-type "type/*", :base-type "type/*"}
            "DATE_TIME"]]))))

(deftest ^:parallel time-test
  (are [t] (not (me/humanize (mr/explain :mbql.clause/time [:time {:lib/uuid "00000000-0000-0000-0000-000000000000"} t :default])))
    "08:00"
    #?@(:clj [#t "08:00"
              #t "08:00+05:30"])))
