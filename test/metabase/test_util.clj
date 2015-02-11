(ns metabase.test-util
  (:require [expectations :refer :all]
            [metabase.util :refer :all]))

;;; tests for select-non-nil-keys

(expect {:a 100 :b 200}
  (select-non-nil-keys {:a 100 :b 200 :c nil :d 300} :a :b :c))
