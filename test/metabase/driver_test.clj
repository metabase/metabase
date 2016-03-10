(ns metabase.driver-test
  (:require [expectations :refer :all]
            [metabase.driver :refer :all]))


(defrecord TestDriver []
  clojure.lang.Named
  (getName [_] "TestDriver"))

(extend TestDriver
  IDriver
  {:features (constantly #{:a})})


;; driver-supports?

(expect true (driver-supports? (TestDriver.) :a))
(expect false (driver-supports? (TestDriver.) :b))
