(ns ^:mb/driver-tests metabase.driver.druid-test
  (:require
   [clojure.test :refer :all]
   [metabase.driver :as driver]
   [metabase.driver.druid]
   [metabase.test :as mt]))

(comment metabase.driver.druid/keep-me)

(deftest ^:parallel druid-is-deprecated-test
  (testing "Legacy :druid driver should be deprecated (QUE2-639, QUE2-640)"
    ;; Run (#'metabase.test.initialize.plugins/load-plugin-manifests! #{:druid}) to reload the manifest
    (mt/test-driver :druid
      (is (= :druid-jdbc
             (driver/superseded-by :druid)))
      (is (= "Druid (Deprecated)"
             (driver/display-name :druid))))))
