(ns metabase.lib.temporal-bucket-test
  (:require
   [clojure.test :refer [deftest is]]
   [metabase.lib.temporal-bucket :as lib.temporal-bucket]))

(deftest ^:parallel describe-temporal-unit-test
  (is (= ""
         (lib.temporal-bucket/describe-temporal-unit nil)))
  (is (= "Day"
         (lib.temporal-bucket/describe-temporal-unit :day)
         (lib.temporal-bucket/describe-temporal-unit 1 :day)))
  (is (= "Days"
         (lib.temporal-bucket/describe-temporal-unit 2 :day)))
  (is (= "Unknown unit"
         (lib.temporal-bucket/describe-temporal-unit :unknown-unit)
         (lib.temporal-bucket/describe-temporal-unit 2 :unknown-unit))))
