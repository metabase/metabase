(ns ^:mb/driver-tests metabase-enterprise.workspaces.drivers-test
  (:require
   [clojure.test :refer :all]
   [metabase.driver :as driver]
   [metabase.test :as mt]))

(deftest drivers-support-workspaces-has-to-support-db-swapping-test
  (mt/test-drivers (mt/normal-drivers-with-feature :workspace)
    (let [db-swapped? (fn []
                        (try
                          (mt/run-mbql-query venues {:limit 1})
                          false
                          (catch Exception _e
                            true)))]
      (testing "db is swapped if being executed inside a macros"
        (driver/with-swapped-connection-details (mt/id) {:user "unicorn"}
          (is (db-swapped?))))

      (testing "sanity check that it's not swapped outside of the macros"
        (is (not (db-swapped?)))))))
