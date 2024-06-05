(ns metabase.driver.databricks-jdbc-test
  (:require
   [clojure.test :refer :all]
   [metabase.test :as mt]))

;; TODO: can connect with details test

;; This is used now just to repl verify no exception is thrown during db creation.
(deftest dummy-test
  (mt/test-driver
   :databricks-jdbc
   (mt/dataset
    places-cam-likes
    (mt/db))))

;; This is used now just to repl verify no exception is thrown during db creation.
(deftest dummy-test-2
  (mt/test-driver
   :databricks-jdbc
   (mt/dataset
    test-data
    (mt/db))))
