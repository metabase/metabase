(ns metabase.driver.databricks-jdbc-test
  (:require
   [clojure.test :refer :all]
   [metabase.test :as mt]))

;; can connect with details...
(deftest dummy-test
  (mt/test-driver
   :databricks-jdbc
   (mt/dataset
    places-cam-likes
    (mt/db))))

(deftest dummy-test-2
  (mt/test-driver
   :databricks-jdbc
   (mt/dataset
    test-data
    (mt/db))))
