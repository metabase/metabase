(ns metabase.failing-test
  (:require [clojure.test :refer :all]))

(deftest failing-test
  (testing "This test"
    (testing "should fail!"
      (is (= {:x {:y 2, :z 3}}
             {:x {:y 2, :z 1}})
          "WHOOPS"))))
