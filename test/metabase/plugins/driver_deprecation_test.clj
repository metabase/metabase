(ns metabase.plugins.driver-deprecation-test
  (:require
   [clojure.test :refer :all]
   [metabase.driver.util :as driver.u]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]))

(use-fixtures :once (fixtures/initialize :db :plugins :test-drivers))

(deftest driver-deprecation-test
  (mt/with-driver :driver-deprecation-test-legacy
    (is (= :driver-deprecation-test-new
           (get-in (driver.u/available-drivers-info) [:driver-deprecation-test-legacy :superseded-by])))))
