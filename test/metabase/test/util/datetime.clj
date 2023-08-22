(ns metabase.test.util.datetime
  (:require
   [clojure.test :refer :all]
   [java-time :as t]
   [metabase.util.malli :as mu])
  (:import
   (java.time Duration)
   (java.time.temporal Temporal)))

(mu/defn temporal-close? :- boolean?
  "Check if t1 is is in the range of (t2 - delta, t2 + delta).

    (close?
      (t/zoned-date-time 2000 01 01 10 00 00)
      (t/zoned-date-time 2000 01 01 10 00 02)
      (t/second 3))
    ;; => true


    (close?
      (t/zoned-date-time 2000 01 01 10 00 00)
      (t/zoned-date-time 2000 01 01 10 00 02)
      (t/second 1))
    ;; => false"
  [t1 :- [:fn #(instance? Temporal %)]
   t2 :- [:fn #(instance? Temporal %)]
   delta :- [:fn #(instance? Duration %)]]
  (assert (= (type t1) (type t2)), "t1 and t2 must be of the same type")
  (and (t/after? t1 (t/minus t2 delta))
       (t/before? t1 (t/plus t2 delta))))


(deftest temporal-close-test
  (is (false? (temporal-close? (t/zoned-date-time 2000 01 01 10 20 58)
                               (t/zoned-date-time 2000 01 01 10 20 00)
                               (t/seconds 2))))

  (is (false? (temporal-close? (t/zoned-date-time 2000 01 01 10 20 00)
                               (t/zoned-date-time 2000 01 01 10 20 02)
                               (t/seconds 2))))

  (is (true? (temporal-close? (t/zoned-date-time 2000 01 01 10 20 00)
                              (t/zoned-date-time 2000 01 01 10 20 02)
                              (t/seconds 3))))

  (is (true? (temporal-close? (t/zoned-date-time 2000 01 01 10 19 58)
                              (t/zoned-date-time 2000 01 01 10 20 00)
                              (t/seconds 3))))

  (is (true? (temporal-close? (t/local-date-time 2000 01 01 10 20 00)
                              (t/local-date-time 2000 01 01 10 20 00)
                              (t/seconds 3))))

  (is (thrown-with-msg? java.lang.AssertionError #"t1 and t2 must be of the same type"
                        (temporal-close? (t/local-date-time 2000 01 01 10 20 00)
                                         (t/zoned-date-time 2000 01 01 10 20 00)
                                         (t/seconds 3))))

  (is (thrown-with-msg? clojure.lang.ExceptionInfo #"Invalid input"
                        (temporal-close? "2000-01-01T10:00:00"
                                         (t/zoned-date-time 2000 01 01 10 20 00)
                                         (t/seconds 3)))))
