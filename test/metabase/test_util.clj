(ns metabase.test-util
  (:require [expectations :refer :all]
            [metabase.util :refer :all]))


;; tests for CONTAINS-MANY?

(let [m {:a 1 :b 1 :c 2}]
  (expect true (contains-many? m :a))
  (expect true (contains-many? m :a :b))
  (expect true (contains-many? m :a :b :c))
  (expect false (contains-many? m :a :d))
  (expect false (contains-many? m :a :b :d)))


;;; tests for SELECT-NON-NIL-KEYS

(expect {:a 100 :b 200}
  (select-non-nil-keys {:a 100 :b 200 :c nil :d 300} :a :b :c))


;;; tests for ASSOC*

(expect {:a 100
         :b 200
         :c 300}
  (assoc* {}
          :a 100
          :b (+ 100 (:a <>))
          :c (+ 100 (:b <>))))


;;; tests for RPARTIAL

(expect 3
  ((rpartial - 5) 8))

(expect -7
  ((rpartial - 5 10) 8))
