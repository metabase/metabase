(ns metabase.util.number-test
  (:require
   [clojure.test :refer [are deftest testing]]
   [metabase.util.number :as u.number]))

(deftest bigint-test
  (testing "should coerce the value to a bigint"
    (are [exp value] (= exp (str (u.number/bigint value)))
      "10"               10
      "10"               (u.number/bigint 10)
      "9007199254740993" "9007199254740993")))

(deftest bigint?-test
  (testing "should check if the value is a bigint"
    (are [exp value] (= exp (u.number/bigint? value))
      true  (u.number/bigint 10)
      true  (u.number/bigint "9007199254740993")
      false 10
      false "9007199254740993")))

(deftest integer?-test
  (testing "should check if the value is an integer"
    (are [exp value] (= exp (u.number/integer? value))
      true  0
      true  10
      true  -10
      true  (u.number/bigint 10)
      true  (u.number/bigint "9223372036854775808")
      true  (u.number/bigint "-9223372036854775808")
      false 10.1
      false -10.1
      false "9223372036854775808")))

(deftest parse-bigint-test
  (testing "should parse the value as a bigint"
    (are [exp value] (= exp (u.number/parse-bigint value))
      (u.number/bigint 10)                 "10"
      (u.number/bigint "9007199254740993") "9007199254740993"
      nil                                  "a"
      nil                                  "10.2")))
