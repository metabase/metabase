(ns metabase.lib.temporal-bucket-test
  (:require
   [clojure.test :refer [deftest is]]
   [metabase.lib.temporal-bucket :as lib.temporal-bucket]))

(deftest ^:parallel format-bucketing-test
  (is (= ""
         (lib.temporal-bucket/format-bucketing nil)
         (lib.temporal-bucket/format-bucketing "")))
  (is (= "Day"
         (lib.temporal-bucket/format-bucketing "day")
         (lib.temporal-bucket/format-bucketing "day" 1)
         (lib.temporal-bucket/format-bucketing :day)
         (lib.temporal-bucket/format-bucketing :day 1)))
  (is (= "Days"
         (lib.temporal-bucket/format-bucketing "day" 2)
         (lib.temporal-bucket/format-bucketing :day 2)))
  (is (= "Unknown unit"
         (lib.temporal-bucket/format-bucketing "unknown-unit")
         (lib.temporal-bucket/format-bucketing :unknown-unit)
         (lib.temporal-bucket/format-bucketing "unknown-unit" 2)
         (lib.temporal-bucket/format-bucketing :unknown-unit 2))))
