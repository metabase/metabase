(ns build-drivers.common-test
  (:require [build-drivers.common :as c]
            [clojure.test :refer :all]))

(deftest has-edition-profile?-test
  (testing :ee
    (is (= true
           (c/has-edition-profile? :oracle :ee)))
    (is (= false
           (c/has-edition-profile? :sqlite :ee))))
  (testing :oss
    (is (= false
           (c/has-edition-profile? :oracle :oss)))
    (is (= false
           (c/has-edition-profile? :sqlite :oss)))))
