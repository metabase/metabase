(ns metabase.util.date-test
  (:require [clojure.test :refer :all]
            [metabase.util.date :as du]))

(def ^:private saturday-the-31st #inst "2005-12-31T19:05:55")
(def ^:private sunday-the-1st    #inst "2006-01-01T04:18:26")
(def ^:private with-milliseconds #inst "2019-09-24T15:07:30.555")

(deftest is-temporal-test
  (are [expected arg] (= expected
                         (du/is-temporal? arg))
    false nil
    false 123
    false "abc"
    false [1 2 3]
    false {:a "b"}
    true  saturday-the-31st))

(deftest ->Timestamp-test
  (are [actual] (= saturday-the-31st
                   actual)
    (du/->Timestamp (du/->Date saturday-the-31st))
    (du/->Timestamp (du/->Calendar saturday-the-31st))
    (du/->Timestamp (du/->Calendar (.getTime saturday-the-31st)))
    (du/->Timestamp (.getTime saturday-the-31st))
    (du/->Timestamp "2005-12-31T19:05:55+00:00" du/utc)))

(deftest ->iso-8601-datetime-test
  (are [expected inst timezone] (= expected
                                   (du/->iso-8601-datetime inst timezone))
    nil                             nil               nil
    "2005-12-31T19:05:55.000Z"      saturday-the-31st nil
    "2005-12-31T11:05:55.000-08:00" saturday-the-31st "US/Pacific"
    "2006-01-01T04:05:55.000+09:00" saturday-the-31st "Asia/Tokyo"))


(deftest date-extract-test
  (testing "UTC timezone"
    (are [expected unit inst] (= expected
                                 (du/date-extract unit inst "UTC"))
      5    :minute-of-hour  saturday-the-31st
      19   :hour-of-day     saturday-the-31st
      7    :day-of-week     saturday-the-31st
      1    :day-of-week     sunday-the-1st
      31   :day-of-month    saturday-the-31st
      365  :day-of-year     saturday-the-31st
      53   :week-of-year    saturday-the-31st
      12   :month-of-year   saturday-the-31st
      4    :quarter-of-year saturday-the-31st
      2005 :year            saturday-the-31st))
  (testing "US/Pacific timezone"
    (are [expected unit inst] (= expected
                                 (du/date-extract unit inst "US/Pacific"))
      5    :minute-of-hour  saturday-the-31st
      11   :hour-of-day     saturday-the-31st
      7    :day-of-week     saturday-the-31st
      7    :day-of-week     sunday-the-1st
      31   :day-of-month    saturday-the-31st
      365  :day-of-year     saturday-the-31st
      53   :week-of-year    saturday-the-31st
      12   :month-of-year   saturday-the-31st
      4    :quarter-of-year saturday-the-31st
      2005 :year            saturday-the-31st))
  (testing "Asia/Tokyo timezone"
    (are [expected unit inst] (= expected
                                 (du/date-extract unit inst "Asia/Tokyo"))
      5    :minute-of-hour  saturday-the-31st
      4    :hour-of-day     saturday-the-31st
      1    :day-of-week     saturday-the-31st
      1    :day-of-week     sunday-the-1st
      1    :day-of-month    saturday-the-31st
      1    :day-of-year     saturday-the-31st
      1    :week-of-year    saturday-the-31st
      1    :month-of-year   saturday-the-31st
      1    :quarter-of-year saturday-the-31st
      2006 :year            saturday-the-31st)))

(deftest date-trunc-test
  (testing "UTC timezone"
    (are [expected unit inst] (= expected
                                 (du/date-trunc unit inst "UTC"))
      #inst "2019-09-24T15:07:30" :second  with-milliseconds
      #inst "2005-12-31T19:05"    :minute  saturday-the-31st
      #inst "2005-12-31T19:00"    :hour    saturday-the-31st
      #inst "2005-12-31"          :day     saturday-the-31st
      #inst "2005-12-25"          :week    saturday-the-31st
      #inst "2006-01-01"          :week    sunday-the-1st
      #inst "2005-12-01"          :month   saturday-the-31st
      #inst "2005-10-01"          :quarter saturday-the-31st))
  (testing "US/Pacific timezone"
    (are [expected unit inst] (= expected
                                 (du/date-trunc unit inst "US/Pacific"))
      #inst "2019-09-24T15:07:30" :second  with-milliseconds
      #inst "2005-12-31T19:05"    :minute  saturday-the-31st
      #inst "2005-12-31T19:00"    :hour    saturday-the-31st
      #inst "2005-12-31-08:00"    :day     saturday-the-31st
      #inst "2005-12-25-08:00"    :week    saturday-the-31st
      #inst "2005-12-25-08:00"    :week    sunday-the-1st
      #inst "2005-12-01-08:00"    :month   saturday-the-31st
      #inst "2005-10-01-08:00"    :quarter saturday-the-31st))
  (testing "Asia/Tokyo timezone"
    (are [expected unit inst] (= expected
                                 (du/date-trunc unit inst "Asia/Tokyo"))
      #inst "2019-09-24T15:07:30" :second  with-milliseconds
      #inst "2005-12-31T19:05"    :minute  saturday-the-31st
      #inst "2005-12-31T19:00"    :hour    saturday-the-31st
      #inst "2006-01-01+09:00"    :day     saturday-the-31st
      #inst "2006-01-01+09:00"    :week    saturday-the-31st
      #inst "2006-01-01+09:00"    :week    sunday-the-1st
      #inst "2006-01-01+09:00"    :month   saturday-the-31st
      #inst "2006-01-01+09:00"    :quarter saturday-the-31st)))
