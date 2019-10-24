(ns metabase.util.date-2.parse-test
  (:require [clojure.test :refer :all]
            [java-time :as t]
            [metabase.util.date-2.parse :as parse]))

(deftest parse-iso-8601-datetime-test
  (testing "millisecond resolution"
    (is (= (t/offset-date-time 2019 10 23 2 51 0 0 -7)
           (parse/parse "2019-10-23T02:51:00.000-07:00"))
        "with offset")
    (is (= (t/local-date-time 2019 10 23 2 51 0 0)
           (parse/parse "2019-10-23T02:51:00.000"))
        "no offset"))
  (testing "second resolution"
    (is (= (t/offset-date-time 2019 10 23 2 51 0 0 -7)
           (parse/parse "2019-10-23T02:51:00-07:00"))
        "with offset")
    (is (= (t/local-date-time 2019 10 23 2 51 0 0)
           (parse/parse "2019-10-23T02:51:00"))
        "no offset"))
  (testing "minute resolution"
    (is (= (t/offset-date-time 2019 10 23 2 51 0 0 -7)
           (parse/parse "2019-10-23T02:51-07:00"))
        "with offset")
    (is (= (t/local-date-time 2019 10 23 2 51 0 0)
           (parse/parse "2019-10-23T02:51"))
        "no offset"))
  (testing "hour resolution"
    (is (= (t/offset-date-time 2019 10 23 2 0 0 0 -7)
           (parse/parse "2019-10-23T02-07:00"))
        "with offset")
    (is (= (t/local-date-time 2019 10 23 2 0 0 0)
           (parse/parse "2019-10-23T02"))
        "no offset")))

(deftest parse-iso-8601-date-test
  (testing "day resolution"
    (is (= (t/offset-date-time 2019 10 23 0 0 0 0 -7)
           (parse/parse "2019-10-23-07:00"))
        "with offset")
    (is (= (t/local-date 2019 10 23)
           (parse/parse "2019-10-23"))
        "no offset"))
  (testing "month resolution"
    #_(is (= (t/offset-date-time 2019 10 1 0 0 0 0 -7)
           (parse/parse "2019-10-07:00"))
        "with offset")
    (is (= (t/local-date 2019 10)
           (parse/parse "2019-10"))
        "no offset"))
  (testing "year resolution"
    #_(is (= (t/offset-date-time 2019 1 1 0 0 0 0 -7)
           (parse/parse "2019-07:00"))
        "with offset")
    (is (= (t/local-date 2019)
           (parse/parse "2019"))
        "no offset")))

(deftest parse-iso-8601-time-test
  (testing "millisecond resolution"
    (is (= (t/offset-time 3 37 30 (* 555 1000 1000) -7)
           (parse/parse "03:37:30.555-07:00"))
        "with offset")
    (is (= (t/local-time 3 37 30 (* 555 1000 1000))
           (parse/parse "03:37:30.555"))
        "without offset"))
  (testing "second resolution"
    (is (= (t/offset-time 3 37 30 0 -7)
           (parse/parse "03:37:30-07:00"))
        "with offset")
    (is (= (t/local-time 3 37 30)
           (parse/parse "03:37:30"))
        "without offset"))
  (testing "minute resolution"
    (is (= (t/offset-time 3 37 0 0 -7)
           (parse/parse "03:37-07:00"))
        "with offset")
    (is (= (t/local-time 3 37)
           (parse/parse "03:37"))
        "without offset")))

(deftest parse-sql-datetime-test
  (testing "millisecond resolution"
    (is (= (t/offset-date-time 2019 10 23 2 51 0 0 -7)
           (parse/parse "2019-10-23 02:51:00.000-07:00"))
        "with offset")
    (is (= (t/local-date-time 2019 10 23 2 51 0 0)
           (parse/parse "2019-10-23 02:51:00.000"))
        "no offset"))
  (testing "second resolution"
    (is (= (t/offset-date-time 2019 10 23 2 51 0 0 -7)
           (parse/parse "2019-10-23 02:51:00-07:00"))
        "with offset")
    (is (= (t/local-date-time 2019 10 23 2 51 0 0)
           (parse/parse "2019-10-23 02:51:00"))
        "no offset"))
  (testing "minute resolution"
    (is (= (t/offset-date-time 2019 10 23 2 51 0 0 -7)
           (parse/parse "2019-10-23 02:51-07:00"))
        "with offset")
    (is (= (t/local-date-time 2019 10 23 2 51 0 0)
           (parse/parse "2019-10-23 02:51"))
        "no offset"))
  (testing "hour resolution"
    (is (= (t/offset-date-time 2019 10 23 2 0 0 0 -7)
           (parse/parse "2019-10-23 02-07:00"))
        "with offset")
    (is (= (t/local-date-time 2019 10 23 2 0 0 0)
           (parse/parse "2019-10-23 02"))
        "no offset")))
