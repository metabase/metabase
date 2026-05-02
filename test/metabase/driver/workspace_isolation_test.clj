(ns ^:mb/driver-tests metabase.driver.workspace-isolation-test
  "Driver-agnostic tests for workspace database isolation. For any driver that
   supports the `:workspace` feature, exercises the full provisioning lifecycle
   (`init-workspace-isolation!` → `grant-workspace-read-access!` →
   `destroy-workspace-isolation!`) against a real warehouse and asserts that the
   workspace user has *exactly* the privileges the design promises:

   - Can SELECT from input tables it has been granted access to.
   - Cannot INSERT/UPDATE/DELETE or run DDL against the input schema.
   - Can SELECT, INSERT, UPDATE, DELETE, and run DDL against its own output
     schema.

   Setup model: the test runs against the existing test database `(mt/db)` and
   creates a per-run uniquely-named source table inside its default input
   schema. Rationale: cloud DWs (Redshift, Snowflake) don't support drop+create
   of databases at will, but creating a per-run table inside a shared DB works
   the same way everywhere.

   Cross-driver counterpart to the postgres-only
   `workspace-user-cannot-write-to-input-schema-test`."
  (:require
   [clojure.java.jdbc :as jdbc]
   [clojure.test :refer :all]
   [metabase.driver :as driver]
   [metabase.driver.bigquery-cloud-sdk :as bigquery]
   [metabase.driver.sql-jdbc.connection :as sql-jdbc.conn]
   [metabase.driver.sql.util :as sql.u]
   [metabase.driver.util :as driver.u]
   [metabase.test :as mt]
   [metabase.util :as u]
   [metabase.util.log :as log])
  (:import
   (com.google.api.gax.core CredentialsProvider)
   (com.google.auth.oauth2 ImpersonatedCredentials ServiceAccountCredentials)
   (com.google.cloud.bigquery
    BigQuery
    BigQuery$DatasetDeleteOption
    BigQuery$DatasetOption
    BigQuery$JobOption
    BigQueryException
    BigQueryOptions
    DatasetId
    DatasetInfo
    FieldValueList
    TableResult
    QueryJobConfiguration)
   (com.google.cloud.iam.admin.v1 IAMClient IAMSettings)
   (java.io ByteArrayInputStream)))

(set! *warn-on-reflection* true)

(defn- find-sql-exception
  "Walk the cause chain until we find a `java.sql.SQLException`, or nil."
  [^Throwable t]
  (loop [t t]
    (cond
      (nil? t)                            nil
      (instance? java.sql.SQLException t) t
      :else                               (recur (.getCause t)))))

(defn- create-input-namespace-sql
  "DDL to create a fresh per-run input namespace (a schema for schema'd drivers,
   a database for schema-less ones like MySQL/ClickHouse). We always use a
   freshly-created namespace rather than the driver's default (`public`/`dbo`)
   because Redshift's `public` has `CREATE` granted to `PUBLIC` by default —
   any USAGE-granted user can create tables there, breaking the input-deny
   contract regardless of how we revoke from the workspace user. A fresh
   namespace has no implicit PUBLIC grants."
  [driver namespace-name]
  (case driver
    (:postgres :redshift :snowflake) (str "CREATE SCHEMA \"" namespace-name "\"")
    :sqlserver                       (str "CREATE SCHEMA [" namespace-name "]")
    (:mysql :clickhouse)             (str "CREATE DATABASE `" namespace-name "`")))

(defn- drop-input-namespace-sqls
  "DDL to drop the per-run input namespace and any tables left in it. Schema'd
   drivers with CASCADE (postgres/redshift/snowflake) and database-as-namespace
   drivers (mysql/clickhouse) take a single statement; SQL Server has no DROP
   SCHEMA CASCADE so the source table has to be dropped explicitly first."
  [driver namespace-name table-name]
  (case driver
    (:postgres :redshift :snowflake) [(str "DROP SCHEMA \"" namespace-name "\" CASCADE")]
    :sqlserver                       [(str "DROP TABLE [" namespace-name "].[" table-name "]")
                                      (str "DROP SCHEMA [" namespace-name "]")]
    (:mysql :clickhouse)             [(str "DROP DATABASE `" namespace-name "`")]))

(defn- qualify
  "Per-driver identifier-quoted `schema.table` (or `database.table` for schema-less
   drivers — see [[input-schema]]). Uses `sql.u/quote-name` so identifiers with
   hyphens or other special chars (e.g. MySQL's `test-data` db-name) survive."
  [driver schema table]
  (sql.u/quote-name driver :table schema table))

(defn- create-table-tail
  "Trailing clause appended to `CREATE TABLE ... (cols)` per driver. ClickHouse
   requires every table to declare a storage engine and (for MergeTree-family)
   an ORDER BY key; SQL drivers don't."
  [driver]
  (case driver
    :clickhouse " ENGINE = MergeTree() ORDER BY id"
    ""))

(defn- supports-update-delete-as-perm-test?
  "True for drivers whose UPDATE/DELETE failure on the input schema, and
   UPDATE/DELETE success on the output schema, are meaningful signals about
   workspace permissions. False for column-oriented engines where standard
   UPDATE/DELETE aren't supported regardless of perms (ClickHouse MergeTree
   needs `ALTER TABLE … UPDATE/DELETE` mutation syntax instead)."
  [driver]
  (case driver
    :clickhouse false
    true))

(defn- expect-sql-denied!
  "Assert that executing `sql` against `user-spec` raises a `SQLException`."
  [user-spec sql label]
  (testing (format "%s is denied" label)
    (try
      (jdbc/execute! user-spec [sql])
      (is false (format "%s unexpectedly succeeded" label))
      (catch Throwable t
        (let [sqle (find-sql-exception t)]
          (is (some? sqle)
              (format "expected SQLException for %s; got %s" label (class t))))))))

(defn- random-suffix
  "Eight hex chars from a random UUID. Per-run unique enough to avoid collisions
   from leftover state in the shared test DB."
  []
  (subs (str (random-uuid)) 0 8))

(deftest ^:synchronized workspace-isolation-perms-test
  ;; BigQuery isn't a JDBC driver (its workspace isolation goes through GCP IAM
  ;; rather than SQL ACLs), so it's covered by `workspace-isolation-perms-bigquery-test`
  ;; below. Everything else fans out through this single JDBC-shaped test.
  (mt/test-drivers (filter #(isa? driver/hierarchy % :sql-jdbc) (mt/normal-drivers-with-feature :workspace))
    (testing "workspace user gets read-only access to input schema, full access to output schema"
      (let [driver       driver/*driver*
            database     (mt/db)
            details      (:details database)
            admin-spec   (sql-jdbc.conn/connection-details->spec driver details)
            ;; Per-run identifiers — the test runs against a shared warehouse DB
            ;; (`(mt/db)`), so anything we create has to be uniquely named or
            ;; it'll collide with leftover state from a prior failed run.
            run-id       (random-suffix)
            in-schema    (str "mb_iso_in_" run-id)
            src-name     (str "ws_iso_src_" run-id)
            sneaky-name  (str "ws_iso_sneaky_" run-id)
            out-name     (str "ws_iso_out_" run-id)
            src          (qualify driver in-schema src-name)
            workspace    {:id   (Long/parseLong run-id 16)
                          :name (str "wsd-permstest-" run-id)}
            ;; Pre-init synthetic ws-details for cleanup. Every driver's destroy impl
            ;; derives its actual identifiers from `workspace :id` (via the `driver.u`
            ;; namespace-/user-name helpers), so this skeleton is enough to drive an
            ;; idempotent destroy even if init never ran or only partially succeeded.
            ;; We swap in the real init-result once we have it, but the atom always
            ;; holds *something* destroy can be called with.
            ws-state     (atom (merge workspace
                                      {:schema           (driver.u/workspace-isolation-namespace-name workspace)
                                       :database_details {:user (driver.u/workspace-isolation-user-name workspace)}}))]
        (try
          (jdbc/execute! admin-spec [(create-input-namespace-sql driver in-schema)])
          (jdbc/execute! admin-spec [(str "CREATE TABLE " src " (id INT, v VARCHAR(8))" (create-table-tail driver))])
          (jdbc/execute! admin-spec [(str "INSERT INTO " src " VALUES (1, 'a')")])
          (let [init-result     (driver/init-workspace-isolation! driver database workspace)
                ws-with-details (merge workspace init-result)
                _               (reset! ws-state ws-with-details)
                user-details    (merge details (:database_details ws-with-details))
                user-spec       (sql-jdbc.conn/connection-details->spec driver user-details)
                out-schema      (:schema ws-with-details)
                out             (qualify driver out-schema out-name)]
            (driver/grant-workspace-read-access! driver database ws-with-details
                                                 [{:schema in-schema :name src-name}])
            (testing "workspace user can SELECT from a granted input table"
              (is (= [{:id 1 :v "a"}]
                     (jdbc/query user-spec [(str "SELECT id, v FROM " src " ORDER BY id")]))))
            (testing "workspace user cannot write to or DDL against the input schema"
              (let [base-ops [[:insert       (str "INSERT INTO " src " VALUES (2, 'b')")]
                              [:create-table (str "CREATE TABLE "
                                                  (qualify driver in-schema sneaky-name)
                                                  " (id INT)" (create-table-tail driver))]
                              [:drop-table   (str "DROP TABLE " src)]]
                    ops      (cond-> base-ops
                               (supports-update-delete-as-perm-test? driver)
                               (into [[:update (str "UPDATE " src " SET v = 'x'")]
                                      [:delete (str "DELETE FROM " src)]]))]
                (doseq [[label sql] ops]
                  (expect-sql-denied! user-spec sql label))))
            (testing "workspace user cannot read from an ungranted namespace"
              (let [ungranted-ns   (str "mb_iso_nogrant_" run-id)
                    ungranted-tbl  (str "ws_iso_secret_" run-id)
                    ungranted-fq   (qualify driver ungranted-ns ungranted-tbl)]
                (try
                  (jdbc/execute! admin-spec [(create-input-namespace-sql driver ungranted-ns)])
                  (jdbc/execute! admin-spec [(str "CREATE TABLE " ungranted-fq " (id INT, secret VARCHAR(8))"
                                                  (create-table-tail driver))])
                  (jdbc/execute! admin-spec [(str "INSERT INTO " ungranted-fq " VALUES (1, 'hidden')")])
                  (expect-sql-denied! user-spec
                                      (str "SELECT * FROM " ungranted-fq)
                                      :select-ungranted-namespace)
                  (finally
                    (doseq [sql (drop-input-namespace-sqls driver ungranted-ns ungranted-tbl)]
                      (try (jdbc/execute! admin-spec [sql]) (catch Throwable _ nil)))))))
            (testing "workspace user has full read+write access to its own output schema"
              (jdbc/execute! user-spec [(str "CREATE TABLE " out " (id INT, v VARCHAR(8))" (create-table-tail driver))])
              (jdbc/execute! user-spec [(str "INSERT INTO " out " VALUES (1, 'a')")])
              (is (= [{:id 1 :v "a"}]
                     (jdbc/query user-spec [(str "SELECT id, v FROM " out)])))
              (when (supports-update-delete-as-perm-test? driver)
                (jdbc/execute! user-spec [(str "UPDATE " out " SET v = 'b'")])
                (is (= [{:id 1 :v "b"}]
                       (jdbc/query user-spec [(str "SELECT id, v FROM " out)])))
                (jdbc/execute! user-spec [(str "DELETE FROM " out)])
                (is (empty? (jdbc/query user-spec [(str "SELECT id, v FROM " out)]))))
              (jdbc/execute! user-spec [(str "DROP TABLE " out)])))
          (finally
            ;; Always attempt destroy first — drivers' impls are idempotent (`IF EXISTS`
            ;; everywhere) so this is safe whether init succeeded fully, partially, or
            ;; not at all. Catch+log so a destroy failure doesn't shadow the real
            ;; test failure.
            (try (driver/destroy-workspace-isolation! driver database @ws-state)
                 (catch Throwable t
                   (log/warnf t "destroy-workspace-isolation! failed for %s during test cleanup"
                              driver)))
            ;; Then drop the input namespace.
            (doseq [sql (drop-input-namespace-sqls driver in-schema src-name)]
              (try (jdbc/execute! admin-spec [sql]) (catch Throwable _ nil)))))))))

;;; +-----------------------------------------------------------------------------------+
;;; |                              BigQuery sibling test                                |
;;; +-----------------------------------------------------------------------------------+
;;;
;;; BigQuery isn't a JDBC driver — its workspace isolation goes through GCP IAM (a
;;; per-workspace service account that the admin SA impersonates) rather than SQL
;;; user/role grants. So the test below mirrors the JDBC test's *shape* but drives
;;; BigQuery through the GCP SDK directly: the admin BigQuery client seeds a per-run
;;; input dataset/table, then `init-workspace-isolation! :bigquery-cloud-sdk` creates
;;; the workspace SA and grants impersonation, after which an `ImpersonatedCredentials`
;;; client runs queries *as* that SA so we can probe the actual perms.
;;;
;;; IAM permissions required on the admin service account
;;; (`MB_BIGQUERY_CLOUD_SDK_TEST_SERVICE_ACCOUNT_JSON`):
;;;
;;;   - `iam.serviceAccounts.create` / `.delete` / `.get` (project-level: Service Account Admin)
;;;   - `iam.serviceAccounts.getIamPolicy` / `.setIamPolicy` on the workspace SAs
;;;     it creates (granted automatically when create succeeds, but the role
;;;     `roles/iam.serviceAccountAdmin` covers it)
;;;   - `iam.serviceAccounts.getAccessToken` on the workspace SA (granted by
;;;     `ws-grant-impersonation-permission!` at init time — needs `setIamPolicy`)
;;;   - `resourcemanager.projects.setIamPolicy` (to grant the workspace SA
;;;     `roles/bigquery.jobUser` at the project level — needs Project IAM Admin
;;;     or a custom role with `resourcemanager.projects.setIamPolicy`)
;;;   - `bigquery.datasets.create` / `.delete` and `bigquery.tables.*` on the
;;;     project (`roles/bigquery.dataEditor` covers everything we need)
;;;
;;; If any are missing, `init-workspace-isolation!` fails fast with a 403 — the test
;;; surfaces that as a setup error and the `finally` block still runs cleanup.

(defn- bq-admin-credentials
  "ServiceAccountCredentials parsed from the admin SA JSON in `(mt/db) :details`.
   Used both to build the admin BigQuery client and as the source credentials for
   `ImpersonatedCredentials` against the workspace SA."
  ^ServiceAccountCredentials [details]
  (ServiceAccountCredentials/fromStream
   (ByteArrayInputStream. (.getBytes ^String (:service-account-json details)))))

(defn- bq-admin-client
  ^BigQuery [details]
  (let [creds (.createScoped (bq-admin-credentials details)
                             (doto (java.util.ArrayList.)
                               (.add "https://www.googleapis.com/auth/bigquery")))]
    (-> (doto (BigQueryOptions/newBuilder)
          (.setCredentials creds)
          (.setProjectId (or (:project-id details)
                             (.getProjectId (bq-admin-credentials details)))))
        .build
        .getService)))

(defn- bq-iam-client
  ^IAMClient [details]
  (let [creds (.createScoped (bq-admin-credentials details)
                             (doto (java.util.ArrayList.)
                               (.add "https://www.googleapis.com/auth/cloud-platform")))]
    (IAMClient/create
     (-> (doto (IAMSettings/newBuilder)
           (.setCredentialsProvider (reify CredentialsProvider
                                      (getCredentials [_] creds))))
         .build))))

(defn- bq-impersonated-client
  "BigQuery client that authenticates as `ws-sa-email` via service-account
   impersonation. Requires the admin creds to hold
   `iam.serviceAccounts.getAccessToken` on `ws-sa-email`, which
   [[init-workspace-isolation!]] grants during provisioning."
  ^BigQuery [^ServiceAccountCredentials admin-creds ws-sa-email project-id]
  (let [imp-creds (ImpersonatedCredentials/create
                   admin-creds
                   ws-sa-email
                   nil
                   (doto (java.util.ArrayList.)
                     (.add "https://www.googleapis.com/auth/bigquery"))
                   3600)]
    (-> (doto (BigQueryOptions/newBuilder)
          (.setCredentials imp-creds)
          (.setProjectId project-id))
        .build
        .getService)))

(defn- find-bq-exception
  "Walk the cause chain until we find a `BigQueryException`, or nil."
  [^Throwable t]
  (loop [t t]
    (cond
      (nil? t)                          nil
      (instance? BigQueryException t)   t
      :else                             (recur (.getCause t)))))

(defn- expect-bq-write-denied!
  [^BigQuery client sql label]
  (testing (format "%s on input dataset is denied" label)
    (try
      (.query client (QueryJobConfiguration/of sql) (into-array BigQuery$JobOption []))
      (is false (format "%s unexpectedly succeeded" label))
      (catch Throwable t
        (let [bq-ex (find-bq-exception t)]
          (is (some? bq-ex)
              (format "expected BigQueryException for %s; got %s" label (class t)))
          (when bq-ex
            (is (= 403 (.getCode ^BigQueryException bq-ex))
                (format "expected 403 for %s; got %d: %s"
                        label (.getCode ^BigQueryException bq-ex) (.getMessage ^BigQueryException bq-ex)))))))))

(defn- bq-create-dataset! [^BigQuery client project-id dataset-name]
  (.create client
           (.build (DatasetInfo/newBuilder (DatasetId/of project-id dataset-name)))
           (u/varargs BigQuery$DatasetOption [])))

(defn- bq-drop-dataset! [^BigQuery client project-id dataset-name]
  (let [ds-id (DatasetId/of project-id dataset-name)]
    (when (.getDataset client ds-id (u/varargs BigQuery$DatasetOption []))
      (.delete client ds-id
               (u/varargs BigQuery$DatasetDeleteOption [(BigQuery$DatasetDeleteOption/deleteContents)])))))

(defn- bq-delete-sa-direct!
  "Belt-and-suspenders SA deletion that bypasses `destroy-workspace-isolation!` —
   used in `finally` so we always attempt to clean up the workspace SA even when
   destroy itself failed mid-run."
  [^IAMClient iam-client project-id workspace]
  (let [sa-id    (#'bigquery/ws-service-account-id workspace)
        sa-email (format "%s@%s.iam.gserviceaccount.com" sa-id project-id)
        sa-name  (format "projects/%s/serviceAccounts/%s" project-id sa-email)]
    (try (.deleteServiceAccount iam-client sa-name)
         (catch Throwable _ nil))))

(deftest ^:synchronized workspace-isolation-perms-bigquery-test
  (mt/test-driver :bigquery-cloud-sdk
    (testing "workspace SA gets read-only access to input dataset, full access to output dataset"
      (let [database     (mt/db)
            details      (:details database)
            ;; The BQ test extension only populates `:project-id` in `details` when
            ;; `MB_BIGQUERY_CLOUD_SDK_TEST_PROJECT_ID` is set (see test/data/
            ;; bigquery_cloud_sdk.clj:69-70). When it isn't, fall back to the
            ;; project embedded in the admin service-account JSON — every
            ;; Google-issued SA key carries the project it was created in.
            project-id   (or (:project-id details)
                             (.getProjectId (bq-admin-credentials details)))
            admin-creds  (bq-admin-credentials details)
            admin-client (bq-admin-client details)
            iam-client   (bq-iam-client details)
            run-id       (random-suffix)
            in-dataset   (str "mb_iso_in_" run-id)
            src-name     (str "ws_iso_src_" run-id)
            sneaky-name  (str "ws_iso_sneaky_" run-id)
            out-name     (str "ws_iso_out_" run-id)
            workspace    {:id   (Long/parseLong run-id 16)
                          :name (str "wsd-permstest-" run-id)}
            ws-state     (atom (merge workspace
                                      {:schema (driver.u/workspace-isolation-namespace-name workspace)}))
            qual         (fn [ds tbl] (format "`%s.%s.%s`" project-id ds tbl))
            run-sql      (fn [^BigQuery c sql]
                           (.query c (QueryJobConfiguration/of sql)
                                   (into-array BigQuery$JobOption [])))]
        (try
          (bq-create-dataset! admin-client project-id in-dataset)
          (run-sql admin-client (format "CREATE TABLE %s (id INT64, v STRING)" (qual in-dataset src-name)))
          (run-sql admin-client (format "INSERT INTO %s (id, v) VALUES (1, 'a')" (qual in-dataset src-name)))
          (let [init-result     (driver/init-workspace-isolation! :bigquery-cloud-sdk database workspace)
                ws-with-details (merge workspace init-result)
                _               (reset! ws-state ws-with-details)
                ws-sa-email     (-> ws-with-details :database_details :impersonate-service-account)
                user-client     (bq-impersonated-client admin-creds ws-sa-email project-id)
                out-dataset     (:schema ws-with-details)]
            (driver/grant-workspace-read-access! :bigquery-cloud-sdk database ws-with-details
                                                 [{:schema in-dataset :name src-name}])
            (testing "workspace SA can SELECT from a granted input table"
              (let [result (run-sql user-client
                                    (format "SELECT id, v FROM %s ORDER BY id" (qual in-dataset src-name)))
                    rows   (mapv (fn [^FieldValueList row]
                                   {:id (.getLongValue (.get row "id"))
                                    :v  (.getStringValue (.get row "v"))})
                                 (.iterateAll ^TableResult result))]
                (is (= [{:id 1 :v "a"}] rows))))
            (testing "workspace SA cannot write to or DDL against the input dataset"
              (doseq [[label sql] [[:insert       (format "INSERT INTO %s (id, v) VALUES (2, 'b')" (qual in-dataset src-name))]
                                   [:update       (format "UPDATE %s SET v = 'x' WHERE id = 1" (qual in-dataset src-name))]
                                   [:delete       (format "DELETE FROM %s WHERE id = 1" (qual in-dataset src-name))]
                                   [:create-table (format "CREATE TABLE %s (id INT64)" (qual in-dataset sneaky-name))]
                                   [:drop-table   (format "DROP TABLE %s" (qual in-dataset src-name))]]]
                (expect-bq-write-denied! user-client sql label)))
            (testing "workspace SA has full read+write access to its own output dataset"
              (run-sql user-client (format "CREATE TABLE %s (id INT64, v STRING)" (qual out-dataset out-name)))
              (run-sql user-client (format "INSERT INTO %s (id, v) VALUES (1, 'a')" (qual out-dataset out-name)))
              (run-sql user-client (format "UPDATE %s SET v = 'b' WHERE id = 1" (qual out-dataset out-name)))
              (run-sql user-client (format "DELETE FROM %s WHERE id = 1" (qual out-dataset out-name)))
              (run-sql user-client (format "DROP TABLE %s" (qual out-dataset out-name)))))
          (finally
            (try (driver/destroy-workspace-isolation! :bigquery-cloud-sdk database @ws-state)
                 (catch Throwable t
                   (log/warn t "destroy-workspace-isolation! failed for :bigquery-cloud-sdk during test cleanup")))
            ;; Belt-and-suspenders: directly delete the input dataset and workspace SA,
            ;; regardless of whether destroy succeeded. Both are idempotent.
            (try (bq-drop-dataset! admin-client project-id in-dataset) (catch Throwable _ nil))
            (try (bq-delete-sa-direct! iam-client project-id workspace) (catch Throwable _ nil))
            (u/ignore-exceptions (.close iam-client))))))))
