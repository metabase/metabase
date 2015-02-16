(ns metabase.test-util
  (:require [expectations :refer :all]
            [metabase.util :refer :all]))

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
