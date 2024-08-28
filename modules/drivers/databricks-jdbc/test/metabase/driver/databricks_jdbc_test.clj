(ns metabase.driver.databricks-jdbc-test
  (:require
   [clojure.test :refer :all]))

(deftest ^:parallel dummy-test
  (is (= 1 1)))
