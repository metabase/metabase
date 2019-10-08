(ns metabase.driver.redshift-test
  (:require [clojure.test :refer :all]
            [metabase.plugins.jdbc-proxy :as jdbc-proxy]
            [metabase.test
             [fixtures :as fixtures]
             [util :as tu]]
            [metabase.test.data.datasets :refer [expect-with-driver]]))

(use-fixtures :once (fixtures/initialize :plugins))

(expect-with-driver :redshift
  "UTC"
  (tu/db-timezone-id))

(deftest correct-driver-test
  (is (= "com.amazon.redshift.jdbc.Driver"
         (.getName (class (jdbc-proxy/wrapped-driver (java.sql.DriverManager/getDriver "jdbc:redshift://host:5432/testdb")))))
      "Make sure we're using the correct driver for Redshift"))
