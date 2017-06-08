(ns metabase.driver-test
  (:require [expectations :refer :all]
            [metabase.driver :as driver]))


(defrecord TestDriver []
  clojure.lang.Named
  (getName [_] "TestDriver"))

(extend TestDriver
  driver/IDriver
  {:features (constantly #{:a})})


;; driver-supports?

(expect true  (driver/driver-supports? (TestDriver.) :a))
(expect false (driver/driver-supports? (TestDriver.) :b))

;; values->base-type
(expect
  :type/Text
  (driver/values->base-type ["A" "B" "C"]))

;; should ignore nils
(expect
  :type/Text
  (driver/values->base-type [nil nil "C"]))

;; should pick base-type of most common class
(expect
  :type/Text
  (driver/values->base-type ["A" 100 "C"]))

;; should fall back to :type/* if no better type is found
(expect
  :type/*
  (driver/values->base-type [(Object.)]))
