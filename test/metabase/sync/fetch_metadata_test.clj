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

(defn- sql-exception
  ([message state] (sql-exception message state 0))
  ([message state code] (SQLException. ^String message ^String state (int code))))

(deftest log-if-error-levels-test
  (testing "the sync step logs every failure; fetch-metadata adds an ERROR only for what might be a Metabase bug (GHY-4946)"
    (doseq [[expected e] [[:error (SQLException. "syntax error at or near \"FROM\"" "42601")]
                          [:debug (ex-info "Unable to connect to the database" {} (CannotAcquireResourceException. "x"))]
                          [:debug (sql-exception "password authentication failed for user \"mb\"" "28P01")]
                          [:debug (sql-exception "permission denied for table orders" "42501")]
                          [:debug (sql-exception "SELECT command denied to user 'mb'@'localhost' for table 'orders'" "42000" 1142)]
                          [:error (sql-exception "You have an error in your SQL syntax" "42000" 1064)]
                          [:debug (ex-info "Error executing query" {} (sql-exception "ERROR: user mapping not found for \"mb\"" "42704"))]
                          [:debug (RuntimeException. "You are not authorized to perform: athena:ListDatabases on the resource.")]
                          [:debug (sql-exception "User: arn:aws:iam::1:user/mb is not authorized to perform: glue:GetTables" "HY000")]]]
      (testing (ex-message e)
        (is (= [expected]
               ;; `log-if-error` is a macro, so it logs under the namespace it's expanded in
               (mt/with-log-messages-for-level [messages [metabase.sync.fetch-metadata-test :debug]]
                 (is (thrown? Throwable (fetch-metadata/log-if-error "test" (throw e))))
                 (mapv :level (messages)))))))))
