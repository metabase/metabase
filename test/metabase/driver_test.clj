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
