(ns ^:mb/driver-tests metabase-enterprise.transforms.bigquery-consistency-test
  "Minimal repro test for BigQuery eventual consistency issues.

   Tests whether insertAll can 404 even after getTable confirms table exists,
   particularly after rapid create/drop/recreate cycles."
  (:require
   [clojure.string :as str]
   [clojure.test :refer :all]
   [metabase.driver :as driver]
   [metabase.driver.bigquery-cloud-sdk.common :as bigquery.common]
   [metabase.test :as mt]
   [metabase.test.data.bigquery-cloud-sdk :as bigquery.tx]
   [metabase.test.data.impl :as data.impl]
   [metabase.test.data.interface :as tx]
   [metabase.util :as u]
   [metabase.util.log :as log]
   [toucan2.core :as t2])
  (:import
   (com.google.api.gax.core CredentialsProvider)
   (com.google.cloud.bigquery.storage.v1
    BigQueryWriteClient
    BigQueryWriteSettings
    JsonStreamWriter)
   (org.json JSONArray JSONObject)))

(def ^:private test-columns
  {"id"    "INT"
   "value" "STRING"})

(defn- create-test-table!
  "Create a simple test table."
  [db-id qualified-table-name]
  (driver/create-table! driver/*driver* db-id qualified-table-name test-columns))

(defn- drop-test-table!
  "Drop the test table, ignoring errors if it doesn't exist."
  [db-id qualified-table-name]
  (try
    (driver/drop-table! driver/*driver* db-id qualified-table-name)
    (catch Exception ex
      (when-not (str/includes? (ex-message ex) "Not found")
        (throw ex)))))

(defn- poll-until-exists!
  "Poll until table exists via driver/table-exists? Returns the poll duration in ms."
  [database qualified-table-name timeout-ms]
  (let [start (System/currentTimeMillis)
        table-name (name qualified-table-name)
        schema (namespace qualified-table-name)]
    (u/poll {:thunk       #(driver/table-exists?
                            driver/*driver*
                            database
                            {:name table-name :schema schema})
             :done?       true?
             :timeout-ms  timeout-ms
             :interval-ms 100})
    (- (System/currentTimeMillis) start)))

(defn- insert-row!
  "Insert a single row via driver/insert-from-source! with NO retry.
   This is the call that might 404 even after getTable succeeds."
  [db-id qualified-table-name row-data]
  (driver/insert-from-source!
   driver/*driver*
   db-id
   {:name qualified-table-name :columns test-columns}
   {:source :rows :data [row-data]}))

(deftest bigquery-create-insert-unique-tables-test
  (mt/test-driver :bigquery-cloud-sdk
    (let [db-id (mt/id)
          database (t2/select-one :model/Database db-id)
          ;; Get the dataset ID from the test framework (handles hashing etc)
          schema (bigquery.tx/test-dataset-id
                  (tx/get-dataset-definition
                   (or data.impl/*dbdef-used-to-create-db*
                       (tx/default-dataset :bigquery-cloud-sdk))))
          ;; Use unique table name per iteration to avoid per-table rate limit
          ;; (BigQuery: 5 metadata ops per 10s per table)
          table-prefix (str "bq_consistency_" (rand-int 100000) "_")
          iterations 10
          results (atom {:success 0 :fail 0 :errors []})]

      (log/infof "Starting BigQuery consistency test: %s iterations, unique tables with prefix: %s"
                 iterations table-prefix)

      (dotimes [i iterations]
        (let [table-name (str table-prefix i)
              qualified-table-name (keyword schema table-name)
              start (System/currentTimeMillis)]
          (try
            ;; 1. Create table (fresh name each iteration)
            (create-test-table! db-id qualified-table-name)
            (let [create-done (System/currentTimeMillis)
                  create-ms (- create-done start)]

              ;; 2. Poll until getTable says it exists
              (let [poll-ms (poll-until-exists! database qualified-table-name 30000)
                    poll-done (System/currentTimeMillis)]

                ;; 3. Attempt insert immediately - NO RETRY
                ;; This tests if insertAll 404s on a freshly-created table
                (try
                  (insert-row! db-id qualified-table-name [i (str "value-" i)])
                  (let [insert-done (System/currentTimeMillis)]
                    (log/infof "Iteration %d (%s): SUCCESS (create=%dms, poll=%dms, insert=%dms)"
                               i table-name create-ms poll-ms (- insert-done poll-done))
                    (swap! results update :success inc))

                  (catch Exception e
                    (let [msg (ex-message e)]
                      (log/errorf "Iteration %d (%s): FAILED after poll (create=%dms, poll=%dms): %s"
                                  i table-name create-ms poll-ms msg)
                      (swap! results update :fail inc)
                      (swap! results update :errors conj {:iteration i :table table-name :error msg}))))))

            (catch Exception e
              (log/errorf "Iteration %d: ERROR during setup: %s" i (ex-message e))
              (swap! results update :fail inc)
              (swap! results update :errors conj {:iteration i :error (ex-message e) :phase :setup}))

            (finally
              ;; Clean up
              (drop-test-table! db-id qualified-table-name)))))

      ;; Report results
      (let [{:keys [success fail errors]} @results]
        (log/infof "BigQuery consistency test complete: %d/%d succeeded, %d failed"
                   success iterations fail)
        (when (seq errors)
          (log/warnf "Errors: %s" (pr-str errors)))

        (if (pos? fail)
          (log/warnf "CONFIRMED: BigQuery insertAll can 404 after getTable succeeds (%d/%d failures)"
                     fail iterations)
          (log/infof "No consistency issues observed in %d iterations" iterations))

        (is (zero? fail)
            (format "BigQuery insertAll failed %d/%d times after getTable confirmed existence. Errors: %s"
                    fail iterations (pr-str errors)))))))

(deftest ^:parallel bigquery-same-table-recreate-test
  (mt/test-driver :bigquery-cloud-sdk
    (let [db-id (mt/id)
          database (t2/select-one :model/Database db-id)
          schema (bigquery.tx/test-dataset-id
                  (tx/get-dataset-definition
                   (or data.impl/*dbdef-used-to-create-db*
                       (tx/default-dataset :bigquery-cloud-sdk))))
          ;; Same table name, but with 2s delay between iterations
          ;; to stay under rate limit (5 ops per 10s = 1 create+drop per 4s is safe)
          table-name (str "bq_recreate_test_" (rand-int 100000))
          qualified-table-name (keyword schema table-name)
          iterations 5
          inter-iteration-delay-ms 4000
          results (atom {:success 0 :fail 0 :errors []})]

      (log/infof "Starting BigQuery recreate test: %s iterations, same table: %s, %dms between iterations"
                 iterations table-name inter-iteration-delay-ms)

      ;; Clean up any leftover
      (dotimes [i iterations]
        (let [start (System/currentTimeMillis)]
          (try
            (create-test-table! db-id qualified-table-name)
            (let [create-ms (- (System/currentTimeMillis) start)
                  poll-ms (poll-until-exists! database qualified-table-name 30000)]

              (try
                (insert-row! db-id qualified-table-name [i (str "value-" i)])
                (log/infof "Iteration %d: SUCCESS (create=%dms, poll=%dms)" i create-ms poll-ms)
                (swap! results update :success inc)

                (catch Exception e
                  (log/errorf "Iteration %d: FAILED (create=%dms, poll=%dms): %s"
                              i create-ms poll-ms (ex-message e))
                  (swap! results update :fail inc)
                  (swap! results update :errors conj {:iteration i :error (ex-message e)}))))

            (catch Exception e
              (swap! results update :fail inc)
              (swap! results update :errors conj {:iteration i :error (ex-message e) :phase :setup}))

            (finally
              (drop-test-table! db-id qualified-table-name)
              ;; Wait between iterations to avoid rate limit
              (when (< i (dec iterations))
                (Thread/sleep inter-iteration-delay-ms))))))

      (let [{:keys [success fail errors]} @results]
        (log/infof "Recreate test complete: %d/%d succeeded" success iterations)
        (if (pos? fail)
          (log/warnf "Same-table recreate: %d/%d failures" fail iterations)
          (log/infof "No failures with same-table recreate (with rate-limit delays)"))

        (is (zero? fail)
            (format "BigQuery insertAll failed %d/%d times on same-table recreate. Errors: %s"
                    fail iterations (pr-str errors)))))))

;; =============================================================================
;; SQL INSERT tests - testing if standard SQL INSERT has better consistency
;; than the streaming API (insertAll)
;; =============================================================================

(defn- insert-row-sql!
  "Insert a single row via SQL INSERT (not streaming API).
   This goes through BigQuery's query engine which may share metadata cache with DDL."
  [db-id qualified-table-name row-data]
  (let [database (t2/select-one :model/Database db-id)
        [id value] row-data
        ;; Quote the table name properly for BigQuery
        table-str (format "`%s`.`%s`"
                          (namespace qualified-table-name)
                          (name qualified-table-name))
        sql (format "INSERT INTO %s (id, value) VALUES (%d, '%s')"
                    table-str id value)]
    (driver/execute-raw-queries! driver/*driver* database [[sql]])))

(deftest bigquery-create-insert-sql-test
  (mt/test-driver :bigquery-cloud-sdk
    (let [db-id (mt/id)
          database (t2/select-one :model/Database db-id)
          schema (bigquery.tx/test-dataset-id
                  (tx/get-dataset-definition
                   (or data.impl/*dbdef-used-to-create-db*
                       (tx/default-dataset :bigquery-cloud-sdk))))
          ;; Use unique table name per iteration
          table-prefix (str "bq_sql_insert_" (rand-int 100000) "_")
          iterations 1
          results (atom {:success 0 :fail 0 :errors []})]

      (log/infof "Starting BigQuery SQL INSERT test: %s iterations, prefix: %s"
                 iterations table-prefix)

      (dotimes [i iterations]
        (let [table-name (str table-prefix i)
              qualified-table-name (keyword schema table-name)
              start (System/currentTimeMillis)]
          (try
            ;; 1. Create table
            (create-test-table! db-id qualified-table-name)
            (let [create-done (System/currentTimeMillis)
                  create-ms (- create-done start)]

              ;; 2. Poll until getTable says it exists
              (let [poll-ms (poll-until-exists! database qualified-table-name 30000)
                    poll-done (System/currentTimeMillis)]

                ;; 3. Attempt SQL INSERT immediately - NO RETRY
                ;; Hypothesis: SQL INSERT shares metadata cache with DDL
                (try
                  (insert-row-sql! db-id qualified-table-name [i (str "value-" i)])
                  (let [insert-done (System/currentTimeMillis)]
                    (log/infof "SQL INSERT %d (%s): SUCCESS (create=%dms, poll=%dms, insert=%dms)"
                               i table-name create-ms poll-ms (- insert-done poll-done))
                    (swap! results update :success inc))

                  (catch Exception e
                    (let [msg (ex-message e)]
                      (log/errorf "SQL INSERT %d (%s): FAILED (create=%dms, poll=%dms): %s"
                                  i table-name create-ms poll-ms msg)
                      (swap! results update :fail inc)
                      (swap! results update :errors conj {:iteration i :table table-name :error msg}))))))

            (catch Exception e
              (log/errorf e "Iteration %d: ERROR during setup: %s" i (ex-message e))
              (swap! results update :fail inc)
              (swap! results update :errors conj {:iteration i :error (ex-message e) :phase :setup}))

            (finally
              (drop-test-table! db-id qualified-table-name)))))

      (let [{:keys [success fail errors]} @results]
        (log/infof "SQL INSERT test complete: %d/%d succeeded, %d failed"
                   success iterations fail)
        (when (seq errors)
          (log/warnf "Errors: %s" (pr-str errors)))

        (if (pos? fail)
          (log/warnf "SQL INSERT also fails - not a streaming-specific issue")
          (log/infof "SQL INSERT works! This confirms streaming API has separate metadata cache"))

        (is (zero? fail)
            (format "BigQuery SQL INSERT failed %d/%d times. Errors: %s"
                    fail iterations (pr-str errors)))))))

;; =============================================================================
;; Storage Write API tests - testing if the newer API has better consistency
;; than the legacy streaming API (insertAll)
;; =============================================================================

(defn- get-bigquery-write-settings
  "Create BigQueryWriteSettings from database details using the same credentials as the main driver."
  [db-details]
  (let [creds (bigquery.common/database-details->service-account-credential db-details)]
    (-> (BigQueryWriteSettings/newBuilder)
        (.setCredentialsProvider (reify CredentialsProvider
                                   (getCredentials [_] creds)))
        (.build))))

(defn- insert-row-storage-api!
  "Insert a single row via the BigQuery Storage Write API (not legacy streaming insertAll).
   Uses the default stream which provides exactly-once semantics."
  [db-details project-id dataset-id table-name row-data]
  (let [settings (get-bigquery-write-settings db-details)
        [id value] row-data]
    (with-open [client (BigQueryWriteClient/create settings)]
      ;; Use the default stream for simplicity - this is the recommended approach
      ;; for most use cases and should have consistent metadata
      (let [parent-table (str "projects/" project-id "/datasets/" dataset-id "/tables/" table-name)
            default-stream (str parent-table "/streams/_default")]
        (with-open [writer (-> (JsonStreamWriter/newBuilder default-stream client)
                               (.build))]
          (let [row (doto (JSONObject.)
                      (.put "id" id)
                      (.put "value" value))
                rows (doto (JSONArray.)
                       (.put row))
                response (.append writer rows)]
            ;; Wait for the append to complete
            (.get response)))))))

(defn- get-project-id
  "Get project ID from database details, falling back to credentials."
  [{:keys [project-id] :as details}]
  (or project-id (bigquery.common/database-details->credential-project-id details)))

(deftest bigquery-storage-write-api-test
  (mt/test-driver :bigquery-cloud-sdk
    (let [db-id (mt/id)
          database (t2/select-one :model/Database db-id)
          db-details (:details database)
          project-id (get-project-id db-details)
          schema (bigquery.tx/test-dataset-id
                  (tx/get-dataset-definition
                   (or data.impl/*dbdef-used-to-create-db*
                       (tx/default-dataset :bigquery-cloud-sdk))))
          table-prefix (str "bq_storage_api_" (rand-int 100000) "_")
          iterations 10
          results (atom {:success 0 :fail 0 :errors []})]

      (log/infof "Starting BigQuery Storage Write API test: %s iterations, prefix: %s"
                 iterations table-prefix)

      (dotimes [i iterations]
        (let [table-name (str table-prefix i)
              qualified-table-name (keyword schema table-name)
              start (System/currentTimeMillis)]
          (try
            ;; 1. Create table
            (create-test-table! db-id qualified-table-name)
            (let [create-done (System/currentTimeMillis)
                  create-ms (- create-done start)]

              ;; 2. Poll until getTable says it exists
              (let [poll-ms (poll-until-exists! database qualified-table-name 30000)
                    poll-done (System/currentTimeMillis)]

                ;; 3. Attempt Storage Write API insert immediately - NO RETRY
                ;; Hypothesis: Storage Write API shares metadata cache with DDL
                (try
                  (insert-row-storage-api! db-details project-id schema table-name [i (str "value-" i)])
                  (let [insert-done (System/currentTimeMillis)]
                    (log/infof "Storage API %d (%s): SUCCESS (create=%dms, poll=%dms, insert=%dms)"
                               i table-name create-ms poll-ms (- insert-done poll-done))
                    (swap! results update :success inc))

                  (catch Exception e
                    (let [msg (ex-message e)]
                      (log/errorf "Storage API %d (%s): FAILED (create=%dms, poll=%dms): %s"
                                  i table-name create-ms poll-ms msg)
                      (swap! results update :fail inc)
                      (swap! results update :errors conj {:iteration i :table table-name :error msg}))))))

            (catch Exception e
              (log/errorf e "Iteration %d: ERROR during setup: %s" i (ex-message e))
              (swap! results update :fail inc)
              (swap! results update :errors conj {:iteration i :error (ex-message e) :phase :setup}))

            (finally
              (drop-test-table! db-id qualified-table-name)))))

      (let [{:keys [success fail errors]} @results]
        (log/infof "Storage Write API test complete: %d/%d succeeded, %d failed"
                   success iterations fail)
        (when (seq errors)
          (log/warnf "Errors: %s" (pr-str errors)))

        (if (pos? fail)
          (log/warnf "Storage Write API also has consistency issues (%d/%d failures)" fail iterations)
          (log/infof "Storage Write API works! This confirms it shares metadata cache with DDL"))

        (is (zero? fail)
            (format "BigQuery Storage Write API failed %d/%d times. Errors: %s"
                    fail iterations (pr-str errors)))))))
