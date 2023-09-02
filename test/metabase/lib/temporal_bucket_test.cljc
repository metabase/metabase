(ns metabase.lib.temporal-bucket-test
  (:require
   [clojure.test :refer [are deftest is testing]]
   [medley.core :as m]
   [metabase.lib.core :as lib]
   [metabase.lib.temporal-bucket :as lib.temporal-bucket]
   [metabase.lib.test-metadata :as meta]
   [metabase.lib.test-util :as lib.tu]))

(deftest ^:parallel describe-temporal-interval-test
  (doseq [unit [:day nil]]
    (testing unit
      (are [n expected] (= expected
                           (lib.temporal-bucket/describe-temporal-interval n unit))
        -2 "Previous 2 Days"
        -1 "Yesterday"
        0  "Today"
        1  "Tomorrow"
        2  "Next 2 Days")))
  (testing :month
    (are [n expected] (= expected
                         (lib.temporal-bucket/describe-temporal-interval n :month))
      -2 "Previous 2 Months"
      -1 "Previous Month"
      0  "This Month"
      1  "Next Month"
      2  "Next 2 Months"))
  (testing "unknown unit"
    (are [n expected] (= expected
                         (lib.temporal-bucket/describe-temporal-interval n :century))
      -2 "Previous 2 Century"
      -1 "Previous Century"
      0  "This Century"
      1  "Next Century"
      2  "Next 2 Century")))

(deftest ^:parallel describe-relative-datetime-test
  (doseq [unit [:day nil]]
    (testing unit
      (are [n expected] (= expected
                           (lib.temporal-bucket/describe-relative-datetime n unit))
        -2 "2 days ago"
        -1 "1 day ago"
        0  "Now"
        1  "1 day from now"
        2  "2 days from now")))
  (testing "unknown unit"
    (are [n expected] (= expected
                         (lib.temporal-bucket/describe-relative-datetime n :century))
      -2 "2 century ago"
      -1 "1 century ago"
      0  "Now"
      1  "1 century from now"
      2  "2 century from now")))

(deftest ^:parallel describe-temporal-unit-test
  (is (= ""
         (lib.temporal-bucket/describe-temporal-unit nil)))
  (is (= "Day of month"
         (lib.temporal-bucket/describe-temporal-unit :day-of-month)))
  (is (= "Day"
         (lib.temporal-bucket/describe-temporal-unit :day)
         (lib.temporal-bucket/describe-temporal-unit 1 :day)
         (lib.temporal-bucket/describe-temporal-unit -1 :day)))
  (is (= "Days"
         (lib.temporal-bucket/describe-temporal-unit 2 :day)))
  (is (= "Unknown unit"
         (lib.temporal-bucket/describe-temporal-unit :unknown-unit)
         (lib.temporal-bucket/describe-temporal-unit 2 :unknown-unit))))

(deftest ^:parallel available-temporal-buckets-test
  (let [column {:description nil
                :lib/type :metadata/column
                :database-is-auto-increment false
                :fingerprint-version 5
                :base-type :type/DateTimeWithLocalTZ
                :semantic-type :type/CreationTimestamp
                :database-required false
                :table-id 806
                :name "CREATED_AT"
                :coercion-strategy nil
                :lib/source :source/fields
                :lib/source-column-alias "CREATED_AT"
                :settings nil
                :caveats nil
                :nfc-path nil
                :database-type "TIMESTAMP WITH TIME ZONE"
                :effective-type :type/DateTimeWithLocalTZ
                :fk-target-field-id nil
                :custom-position 0
                :active true
                :id 3068
                :parent-id nil
                :points-of-interest nil
                :visibility-type :normal
                :lib/desired-column-alias "CREATED_AT"
                :display-name "Created At"
                :position 7
                :has-field-values nil
                :json-unfolding false
                :preview-display true
                :database-position 7
                :fingerprint
                {:global {:distinct-count 200, :nil% 0.0}}}
        expected-units #{:minute :hour
                         :day :week :month :quarter :year
                         :minute-of-hour :hour-of-day
                         :day-of-week :day-of-month :day-of-year
                         :week-of-year :month-of-year :quarter-of-year}
        expected-defaults [{:lib/type :option/temporal-bucketing, :unit :day, :default true}]]
    (testing "missing fingerprint"
      (let [column (dissoc column :fingerprint)
            options (lib.temporal-bucket/available-temporal-buckets-method nil -1 column)]
          (is (= expected-units
                 (into #{} (map :unit) options)))
          (is (= expected-defaults
                 (filter :default options)))))
    (testing "existing fingerprint"
      (doseq [[latest unit] {"2019-04-15T13:34:19.931Z" :month
                             "2017-04-15T13:34:19.931Z" :week
                             "2016-05-15T13:34:19.931Z" :day
                             "2016-04-27T13:34:19.931Z" :minute
                             nil                        :day
                             "garbage"                  :day}]
        (testing latest
          (let [bounds {:earliest "2016-04-26T19:29:55.147Z"
                        :latest latest}
                column (assoc-in column [:fingerprint :type :type/DateTime] bounds)
                options (lib.temporal-bucket/available-temporal-buckets-method nil -1 column)]
            (is (= expected-units
                   (into #{} (map :unit) options)))
            (is (= (assoc-in expected-defaults [0 :unit] unit)
                   (filter :default options)))))))))

(deftest ^:parallel temporal-bucketing-options-test
  (let [query (-> (lib/query meta/metadata-provider (meta/table-metadata :products))
                  (lib/with-fields [(meta/field-metadata :products :created-at)]))]
    (is (= [{:unit :minute}
            {:unit :hour}
            {:unit :day}
            {:unit :week}
            {:unit :month, :default true}
            {:unit :quarter}
            {:unit :year}
            {:unit :minute-of-hour}
            {:unit :hour-of-day}
            {:unit :day-of-week}
            {:unit :day-of-month}
            {:unit :day-of-year}
            {:unit :week-of-year}
            {:unit :month-of-year}
            {:unit :quarter-of-year}]
           (->> (lib/returned-columns query)
                first
                (lib/available-temporal-buckets query)
                (mapv #(select-keys % [:unit :default])))))))

(deftest ^:parallel temporal-bucketing-options-expressions-test
  (testing "There should be no bucketing options for expressions as they are not supported (#31367)"
    (let [query (-> lib.tu/venues-query
                    (lib/expression "myadd" (lib/+ 1 (meta/field-metadata :venues :category-id))))]
      (is (empty? (->> (lib/returned-columns query)
                       (m/find-first (comp #{"myadd"} :name))
                       (lib/available-temporal-buckets query)))))))
