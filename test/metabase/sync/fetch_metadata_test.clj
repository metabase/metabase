(ns metabase.sync.fetch-metadata-test
  (:require
   [clojure.test :refer :all]
   [metabase.sync.fetch-metadata :as fetch-metadata]
   [metabase.test :as mt])
  (:import
   (com.mchange.v2.resourcepool CannotAcquireResourceException)
   (java.sql SQLException)))

(defn- tables-attempted
  "Run the describe-table fallback over the test DB with every table failing with `e`. Returns the number of tables
  attempted and whether the run threw."
  [e]
  (let [attempted (atom 0)
        ;; outside the redef: the first `mt/db` creates and syncs the test DB, which must not see the failures
        db        (mt/db)]
    (mt/with-dynamic-fn-redefs [fetch-metadata/table-fields-metadata (fn [_database _table]
                                                                       (swap! attempted inc)
                                                                       (throw e))]
      (let [threw? (try
                     (dorun (#'fetch-metadata/describe-fields-using-describe-table :h2 db))
                     false
                     (catch Throwable _ true))]
        {:attempted @attempted, :threw? threw?}))))

(deftest describe-fields-fallback-aborts-on-transient-failure-test
  (testing "an unreachable warehouse fails every table the same way, so stop after the first (GHY-4944)"
    (is (= {:attempted 1, :threw? true}
           (tables-attempted (SQLException. "Connections could not be acquired from the underlying database!"
                                            (CannotAcquireResourceException. "A ResourcePool could not acquire a resource"))))))
  (testing "a failure specific to one table is skipped, and the rest are still described"
    (is (=? {:attempted #(> % 1), :threw? false}
            (tables-attempted (SQLException. "permission denied for table"))))))
