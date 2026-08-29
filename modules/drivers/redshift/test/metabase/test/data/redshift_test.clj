(ns metabase.test.data.redshift-test
  "Tests for the Redshift test-data utilities themselves."
  (:require
   [clojure.test :refer :all]
   [metabase.driver.sql.test-util.unique-prefix :as sql.tu.unique-prefix]
   [metabase.test.data.redshift :as redshift.tx]))

(set! *warn-on-reflection* true)

(deftest dataset-schema-test
  (testing "each dataset gets its own schema, normalized for Redshift's lower-case identifiers"
    (is (= (str (sql.tu.unique-prefix/unique-prefix) "test_data")
           (redshift.tx/dataset-schema "test-data")))
    (is (not= (redshift.tx/dataset-schema "test-data")
              (redshift.tx/dataset-schema "sad-toucan-incidents"))))
  (testing "the scratch schema is not a dataset schema"
    (is (not= (redshift.tx/unique-session-schema)
              (redshift.tx/dataset-schema "test-data"))))
  (testing "dataset schemas keep the date prefix, so the existing age-based reaper still collects
            them and cleanup needs no changes of its own"
    (is (sql.tu.unique-prefix/old-dataset-name?
         "2023_02_01_14_82e897cb_ad31_4c82_a4b6_3e9e2e1dc1cb_test_data"))))
