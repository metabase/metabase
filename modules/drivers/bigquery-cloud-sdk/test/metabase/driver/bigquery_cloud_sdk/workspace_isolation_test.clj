(ns ^:mb/driver-tests metabase.driver.bigquery-cloud-sdk.workspace-isolation-test
  "BigQuery-specific tests for workspace database isolation. BigQuery isn't a JDBC
   driver — its workspace isolation goes through GCP IAM (a per-workspace service
   account that the admin SA impersonates) rather than SQL user/role grants. So
   this test mirrors the JDBC sibling's *shape* (see
   `metabase-enterprise.workspaces.driver-isolation-test`) but drives BigQuery
   through the GCP SDK directly: the admin BigQuery client seeds a per-run input
   dataset/table, then `init-workspace-isolation! :bigquery-cloud-sdk` creates the
   workspace SA and grants impersonation, after which an `ImpersonatedCredentials`
   client runs queries *as* that SA so we can probe the actual perms.

   IAM permissions required on the admin service account
   (`MB_BIGQUERY_CLOUD_SDK_TEST_SERVICE_ACCOUNT_JSON`):

   - `iam.serviceAccounts.create` / `.delete` / `.get` (project-level: Service Account Admin)
   - `iam.serviceAccounts.getIamPolicy` / `.setIamPolicy` on the workspace SAs
     it creates (granted automatically when create succeeds, but the role
     `roles/iam.serviceAccountAdmin` covers it)
   - `iam.serviceAccounts.getAccessToken` on the workspace SA (granted by
     `ws-grant-impersonation-permission!` at init time — needs `setIamPolicy`)
   - `resourcemanager.projects.setIamPolicy` (to grant the workspace SA
     `roles/bigquery.jobUser` at the project level — needs Project IAM Admin
     or a custom role with `resourcemanager.projects.setIamPolicy`)
   - `bigquery.datasets.create` / `.delete` and `bigquery.tables.*` on the
     project (`roles/bigquery.dataEditor` covers everything we need)

   If any are missing, `init-workspace-isolation!` fails fast with a 403 — the
   test surfaces that as a setup error and the `finally` block still runs cleanup."
  (:require
   [clojure.test :refer :all]
   [metabase.driver :as driver]
   [metabase.driver.bigquery-cloud-sdk :as bigquery]
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

(defn- random-suffix []
  (subs (str (random-uuid)) 0 8))

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
        ;; TEMP DIAGNOSTIC: identify which admin SA the CI is authenticating as.
        ;; Remove once we've confirmed the principal that needs IAM roles granted.
        ;; Using println rather than log/infof because the CI test runner only
        ;; surfaces test-runner notices to its log capture, not application
        ;; logs from log/infof — println goes to stdout where it's visible.
        (println "BigQuery test admin SA:"
                 (.getClientEmail ^ServiceAccountCredentials admin-creds))
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
