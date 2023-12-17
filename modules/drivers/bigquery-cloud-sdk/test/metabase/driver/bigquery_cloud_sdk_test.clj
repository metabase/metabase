(ns metabase.driver.bigquery-cloud-sdk-test
  (:require
   [clojure.core.async :as a]
   [clojure.string :as str]
   [clojure.test :refer :all]
   [metabase.db.metadata-queries :as metadata-queries]
   [metabase.driver :as driver]
   [metabase.driver.bigquery-cloud-sdk :as bigquery]
   [metabase.driver.bigquery-cloud-sdk.common :as bigquery.common]
   [metabase.models :refer [Database Field Table]]
   [metabase.query-processor :as qp]
   [metabase.sync :as sync]
   [metabase.test :as mt]
   [metabase.test.data.bigquery-cloud-sdk :as bigquery.tx]
   [metabase.test.data.interface :as tx]
   [metabase.test.util.random :as tu.random]
   [metabase.util :as u]
   [metabase.util.log :as log]
   [toucan2.core :as t2]
   [toucan2.tools.with-temp :as t2.with-temp])
  (:import
   (com.google.cloud.bigquery BigQuery)))

(set! *warn-on-reflection* true)

(def ^:private test-db-name (bigquery.tx/test-dataset-id "test_data"))

(defmacro ^:private calculate-bird-scarcity [formula & [filter-clause]]
  `(mt/dataset ~'daily-bird-counts
     (mt/$ids ~'bird-count
       (calculate-bird-scarcity* ~formula ~filter-clause))))

(defn- do-with-temp-obj [name-fmt-str create-args-fn drop-args-fn f]
  (driver/with-driver :bigquery-cloud-sdk
    (let [obj-name (format name-fmt-str (tu.random/random-name))]
      (mt/with-temp-copy-of-db
        (try
          (apply bigquery.tx/execute! (create-args-fn obj-name))
          (f obj-name)
          (finally
            (apply bigquery.tx/execute! (drop-args-fn obj-name))))))))

(defmacro with-view [[view-name-binding] & body]
  `(do-with-temp-obj "view_%s"
                     (fn [view-nm#] [(str "CREATE VIEW `%s.%s` AS "
                                          "SELECT v.id AS id, v.name AS venue_name, c.name AS category_name "
                                          "FROM `%s.%s.venues` v "
                                          "LEFT JOIN `%s.%s.categories` c "
                                          "ON v.category_id = c.id "
                                          "ORDER BY v.id ASC "
                                          "LIMIT 3")
                                     ~test-db-name
                                     view-nm#
                                     (bigquery.tx/project-id)
                                     ~test-db-name
                                     (bigquery.tx/project-id)
                                     ~test-db-name])
                     (fn [view-nm#] ["DROP VIEW IF EXISTS `%s.%s`" ~test-db-name view-nm#])
                     (fn [~(or view-name-binding '_)] ~@body)))

(def ^:private numeric-val "-1.2E20")
(def ^:private decimal-val "2.3E16")
(def ^:private bignumeric-val "-7.5E30")
(def ^:private bigdecimal-val "5.2E35")

(defn- bigquery-project-id []
  (-> (tx/db-test-env-var-or-throw :bigquery-cloud-sdk :service-account-json)
      bigquery.common/service-account-json->service-account-credential
      (.getProjectId)))

(defmacro with-numeric-types-table [[table-name-binding] & body]
  `(do-with-temp-obj "table_%s"
                     (fn [tbl-nm#] [(str "CREATE TABLE `%s.%s` AS SELECT "
                                         "NUMERIC '%s' AS numeric_col, "
                                         "DECIMAL '%s' AS decimal_col, "
                                         "BIGNUMERIC '%s' AS bignumeric_col, "
                                         "BIGDECIMAL '%s' AS bigdecimal_col")
                                    ~test-db-name
                                    tbl-nm#
                                    ~numeric-val
                                    ~decimal-val
                                    ~bignumeric-val
                                    ~bigdecimal-val])
                     (fn [tbl-nm#] ["DROP TABLE IF EXISTS `%s.%s`" ~test-db-name tbl-nm#])
                     (fn [~(or table-name-binding '_)] ~@body)))

(deftest not-retry-cancellation-exception-test
  (mt/test-driver :bigquery-cloud-sdk
    (let [fake-execute-called (atom false)
          orig-fn        @#'bigquery/execute-bigquery]
      (testing "Should not retry query on cancellation"
        (with-redefs [bigquery/execute-bigquery (fn [^BigQuery client ^String sql parameters _ _]
                                                  ;; We only want to simulate exception on the query that we're testing and not on possible db setup queries
                                                  (if (and (re-find #"notRetryCancellationExceptionTest" sql) (not @fake-execute-called))
                                                    (do (reset! fake-execute-called true)
                                                        ;; Simulate a cancellation happening
                                                        (throw (ex-info (tru "Query cancelled") {::bigquery/cancelled? true})))
                                                    (orig-fn client sql parameters nil nil)))]
          (try
            (qp/process-query {:native {:query "SELECT CURRENT_TIMESTAMP() AS notRetryCancellationExceptionTest"} :database (mt/id)
                               :type     :native})
            ;; If no exception is thrown, then the test should fail
            (is false "Query should have failed")
            (catch clojure.lang.ExceptionInfo e
              ;; Verify exception as expected
              (is (= "Query cancelled" (.getMessage e)))
              ;; make sure that the fake exception was thrown
              (is (true? @fake-execute-called)))))))))

(deftest query-cancel-test
  (mt/test-driver :bigquery-cloud-sdk
    (testing "BigQuery queries can be canceled successfully"
      (mt/with-open-channels [canceled-chan (a/promise-chan)]
        (binding [bigquery/*page-size*     1000 ; set a relatively small pageSize
                  bigquery/*page-callback* (fn []
                                             (log/debug "*page-callback* called, sending cancel message")
                                             (a/>!! canceled-chan ::cancel))]
          (try
            ;; there's a race. Some data might be processed, and if so we get the partial result
            (mt/dataset test-data
              (let [rows      (mt/rows (mt/process-query (mt/query orders) {:canceled-chan canceled-chan}))
                    row-count (count rows)]
                (log/debugf "Loaded %d rows before BigQuery query was canceled" row-count)
                (testing "Somewhere between 0 and the size of the orders table rows were loaded before cancellation"
                  (is (< 0 row-count 10000)))))
            (catch clojure.lang.ExceptionInfo e
              (is (= (ex-message e) "Query cancelled")))))))))

;; TODO Temporarily disabling due to flakiness (#33140)
#_
(deftest global-max-rows-test
  (mt/test-driver :bigquery-cloud-sdk
    (testing "The limit middleware prevents us from fetching more pages than are necessary to fulfill query max-rows"
      (let [page-size          100
            max-rows           1000
            num-page-callbacks (atom 0)]
        (binding [bigquery/*page-size*     page-size
                  bigquery/*page-callback* (fn []
                                             (swap! num-page-callbacks inc))]
          (mt/dataset test-data
            (let [rows (mt/rows (mt/process-query (mt/query orders {:query {:limit max-rows}})))]
              (is (= max-rows (count rows)))
              (is (= (/ max-rows page-size) @num-page-callbacks)))))))))

(defn- sync-and-assert-filtered-tables [database assert-table-fn]
  (t2.with-temp/with-temp [Database db-filtered database]
    (sync/sync-database! db-filtered {:scan :schema})
    (doseq [table (t2/select-one Table :db_id (u/the-id db-filtered))]
      (assert-table-fn table))))
