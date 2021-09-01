(ns metabase.driver.impl-test
  (:require [clojure.core.async :as a]
            [clojure.test :refer :all]
            [metabase.driver :as driver]
            [metabase.driver.impl :as impl]
            [metabase.test.util.async :as tu.async]))

(deftest driver->expected-namespace-test
  (testing "expected namespace for a non-namespaced driver should be `metabase.driver.<driver>`"
    (is (= 'metabase.driver.sql-jdbc
           (#'impl/driver->expected-namespace :sql-jdbc))))
  (testing "for a namespaced driver it should be the namespace of the keyword"
    (is (= 'metabase.driver.impl-test
           (#'impl/driver->expected-namespace ::toucans)))))

(deftest load-driver-namespace-race-condition-test
  (testing "Make sure we don't report a driver as being registered if its namespace is in the process of being loaded (#13114)"
    (alter-var-root #'impl/hierarchy underive ::race-condition-test :metabase.driver/driver)
    ;; basic idea for this test is simulate loading a driver namespace on a different thread and have it register
    ;; itself immediately. Then on another thread we should call `the-initialized-driver`, but it shouldn't return
    ;; until the namespace has completed loading.
    (tu.async/with-open-channels [started-loading-chan (a/promise-chan)]
      (let [finished-loading (atom false)]
        (with-redefs [impl/require-driver-ns (fn [_]
                                               (driver/register! ::race-condition-test)
                                               (a/>!! started-loading-chan :start)
                                               (Thread/sleep 100)
                                               (reset! finished-loading true))]
          ;; fire off a separate thread that will start loading the driver
          (future (driver/the-initialized-driver ::race-condition-test))
          (tu.async/wait-for-result started-loading-chan 500)
          (is (= ::race-condition-test
                 (driver/the-initialized-driver ::race-condition-test)))
          (is (= true
                 @finished-loading)))))))
