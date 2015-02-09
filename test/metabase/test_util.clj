(ns metabase.test-util
  (:require [expectations :refer :all]
            [metabase.util :refer :all]))

;;; tests for select-non-nil-keys

(expect {:a 100 :b 200}
  (select-non-nil-keys {:a 100 :b 200 :c nil :d 300} :a :b :c))

;;; tests for apply-kwargs

(expect {:a 1 :c 3 :d 4}
  (apply-kwargs assoc {:a 1} {:c 3 :d 4})) ; should work like (assoc {:a 1} :c 3 :d 4)

(expect {:a 1 :b 2 :c 3 :d 4}
    (apply-kwargs assoc {:a 1} :b 2 {:c 3 :d 4})) ; should work like (assoc {:a 1} :b 2 :c 3 :d 4)
