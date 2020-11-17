(ns metabase.driver.impl-test
  (:require [clojure.test :refer :all]
            [metabase.driver.impl :as impl]))

(deftest driver->expected-namespace-test
  (testing "expected namespace for a non-namespaced driver should be `metabase.driver.<driver>`"
    (is (= 'metabase.driver.sql-jdbc
           (#'impl/driver->expected-namespace :sql-jdbc))))
  (testing "for a namespaced driver it should be the namespace of the keyword"
    (is (= 'metabase.driver.impl-test
           (#'impl/driver->expected-namespace ::toucans)))))
