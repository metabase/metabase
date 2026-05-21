(ns metabase.driver.bigquery-cloud-sdk.workspace-test-util
  "Shared BigQuery test helpers for workspace-isolation tests. Two consumers:

   - `metabase.driver.bigquery-cloud-sdk.workspace-isolation-test` — the BQ-only
     contract test for `init`/`grant`/`destroy`/cross-workspace.
   - `metabase-enterprise.workspaces.e2e-test` — the cross-driver full e2e that
     needs BQ branches in its JDBC-shaped helpers.

   The BQ driver source provides admin-client + project-id helpers as private
   fns; this ns re-exports them via `#'` so both consumers share one path
   instead of each duplicating `BigQueryOptions/newBuilder` plumbing."
  (:require
   [clojure.test :refer [is testing]]
   [metabase.driver.bigquery-cloud-sdk :as bigquery]
   [metabase.driver.bigquery-cloud-sdk.common :as bigquery.common]
   [metabase.driver.bigquery-cloud-sdk.workspaces :as bigquery.ws]
   [metabase.util :as u])
  (:import
   (com.google.api.gax.core CredentialsProvider)
   (com.google.auth.oauth2 ImpersonatedCredentials ServiceAccountCredentials)
   (com.google.cloud.bigquery
    BigQuery
    BigQuery$DatasetDeleteOption
    BigQuery$DatasetOption
    BigQuery$JobOption
    BigQuery$TableListOption
    BigQueryException
    BigQueryOptions
    DatasetId
    DatasetInfo
    FieldValueList
    Table
    TableResult
    QueryJobConfiguration)
   (com.google.cloud.iam.admin.v1 IAMClient IAMSettings)
   (java.io ByteArrayInputStream)))

(set! *warn-on-reflection* true)

;;; -------------------- Credentials + clients --------------------

(defn admin-credentials
  "Parse `ServiceAccountCredentials` from the admin SA JSON in `details`. Used
   both to build the admin BigQuery client and as the source for
   `ImpersonatedCredentials` against the workspace SA."
  ^ServiceAccountCredentials [details]
  (ServiceAccountCredentials/fromStream
   (ByteArrayInputStream. (.getBytes ^String (:service-account-json details)))))

(defn admin-client
  "Build an admin `BigQuery` client for `details`. Thin re-export of the BQ
   driver's private `database-details->client` so workspace tests don't need to
   reach into the driver themselves."
  ^BigQuery [details]
  (#'bigquery/database-details->client details))

(defn iam-client
  "Build an IAM admin client scoped to `cloud-platform` for `details`. Used to
   create / delete / grant impersonation on workspace service accounts."
  ^IAMClient [details]
  (let [creds (.createScoped (admin-credentials details)
                             (doto (java.util.ArrayList.)
                               (.add "https://www.googleapis.com/auth/cloud-platform")))]
    (IAMClient/create
     (-> (doto (IAMSettings/newBuilder)
           (.setCredentialsProvider (reify CredentialsProvider
                                      (getCredentials [_] creds))))
         .build))))

(defn impersonated-client
  "BigQuery client that authenticates as `ws-sa-email` via service-account
   impersonation. Requires the admin creds to hold
   `iam.serviceAccounts.getAccessToken` on `ws-sa-email`, which the driver's
   `init-workspace-isolation!` grants during provisioning."
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

(defn project-id
  "Project ID for `details`: explicit `:project-id` field if set, else parsed
   out of the admin SA JSON. Thin re-export of the BQ driver's
   `bigquery-cloud-sdk.common/get-project-id`."
  [details]
  (bigquery.common/get-project-id details))

;;; -------------------- Dataset CRUD --------------------

(defn create-dataset!
  "Create a BQ dataset. Idempotent: no-op if it already exists."
  [^BigQuery client project-id dataset-name]
  (.create client
           (.build (DatasetInfo/newBuilder (DatasetId/of project-id dataset-name)))
           (u/varargs BigQuery$DatasetOption [])))

(defn drop-dataset!
  "Drop a BQ dataset and its contents. Idempotent: no-op if not present.
   Distinct from `metabase.test.data.bigquery-cloud-sdk/destroy-dataset!`,
   which also writes to the test-tracking table — workspace tests don't want
   that side-effect."
  [^BigQuery client project-id dataset-name]
  (let [ds-id (DatasetId/of project-id dataset-name)]
    (when (.getDataset client ds-id (u/varargs BigQuery$DatasetOption []))
      (.delete client ds-id
               (u/varargs BigQuery$DatasetDeleteOption
                 [(BigQuery$DatasetDeleteOption/deleteContents)])))))

(defn list-tables
  "Return a vector of `{:schema dataset :table table-id}` maps for every table
   in `dataset-name`. Empty vector when the dataset doesn't exist."
  [^BigQuery client project-id dataset-name]
  (let [ds-id (DatasetId/of project-id dataset-name)]
    (if-let [_ds (.getDataset client ds-id (u/varargs BigQuery$DatasetOption []))]
      (vec (for [^Table t (.iterateAll (.listTables client ds-id (u/varargs BigQuery$TableListOption [])))]
             {:schema dataset-name :table (.. t getTableId getTable)}))
      [])))

;;; -------------------- SQL execution --------------------

(defn execute!
  "Run a BigQuery SQL string on `client`, returning nil. Mirrors `jdbc/execute!`
   semantics — for DDL/DML the result is uninteresting. Distinct from
   `metabase.test.data.bigquery-cloud-sdk/execute!` which runs as the test admin
   SA only; this one runs on whatever client you pass (admin or impersonated)."
  [^BigQuery client sql]
  (.query client (QueryJobConfiguration/of sql) (into-array BigQuery$JobOption []))
  nil)

(defn query
  "Run a SELECT and eagerly materialize results to `[{:col val ...}]`. Mirrors
   `jdbc/query` semantics. Column values are coerced via `.getValue` (returns a
   String — BQ's lossy-but-uniform coercion). Callers needing typed values
   should `Long/parseLong` etc. at the use site.

   Materializes synchronously; not suitable for huge result sets."
  [^BigQuery client sql]
  (let [^TableResult result (.query client (QueryJobConfiguration/of sql) (into-array BigQuery$JobOption []))
        col-names           (mapv #(.getName ^com.google.cloud.bigquery.Field %)
                                  (.getFields (.getSchema result)))]
    (vec (for [^FieldValueList row (.iterateAll result)]
           (into {} (for [name col-names]
                      [(keyword name) (.getValue (.get row ^String name))]))))))

;;; -------------------- Assertion helpers --------------------

(defn find-bq-exception
  "Walk the cause chain until we find a `BigQueryException`, or nil."
  [^Throwable t]
  (loop [t t]
    (cond
      (nil? t)                          nil
      (instance? BigQueryException t)   t
      :else                             (recur (.getCause t)))))

(defn expect-write-denied!
  "Assert that running `sql` on `client` is denied with a 403. Use for the
   strict case where only forbidden is acceptable (input-dataset writes)."
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

(defn expect-denied!
  "Like `expect-write-denied!` but accepts any 4xx — cross-workspace reads can
   return 403 (forbidden) or 404 (resource not found from caller's POV), and
   storage/external-table escapes can surface as either. Both mean the
   operation was correctly denied."
  [^BigQuery client sql label]
  (testing (format "%s is denied" label)
    (try
      (.query client (QueryJobConfiguration/of sql) (into-array BigQuery$JobOption []))
      (is false (format "%s unexpectedly succeeded" label))
      (catch Throwable t
        (let [bq-ex (find-bq-exception t)]
          (is (some? bq-ex)
              (format "expected BigQueryException for %s; got %s" label (class t)))
          (when bq-ex
            (let [code (.getCode ^BigQueryException bq-ex)]
              (is (and (>= code 400) (< code 500))
                  (format "expected 4xx for %s; got %d: %s"
                          label code (.getMessage ^BigQueryException bq-ex))))))))))

(defn verify-destroy!
  "Assert post-destroy state for BigQuery workspace isolation: the workspace's
   output dataset is gone. Called right after `destroy-workspace-isolation!`.

   Note: the natural companion check — \"workspace SA can no longer issue access
   tokens\" — is *not* asserted because GCP IAM propagation of
   `deleteServiceAccount` is documented as taking up to 24 hours: deleted
   service accounts can keep issuing tokens during that window. Dataset
   deletion is reliable; SA deletion is not (immediately)."
  [project-id ^BigQuery admin-client out-dataset]
  (testing "workspace output dataset is dropped"
    (let [ds-id (DatasetId/of project-id out-dataset)
          ds   (.getDataset admin-client ds-id (u/varargs BigQuery$DatasetOption []))]
      (is (nil? ds)
          (format "output dataset %s should be removed after destroy" out-dataset)))))

(defn delete-sa-direct!
  "Belt-and-suspenders SA deletion that bypasses `destroy-workspace-isolation!` —
   call from `finally` so we always attempt to clean up the workspace SA even
   when destroy itself failed mid-run."
  [^IAMClient iam-client project-id workspace]
  (let [sa-id    (#'bigquery.ws/ws-service-account-id workspace)
        sa-email (format "%s@%s.iam.gserviceaccount.com" sa-id project-id)
        sa-name  (format "projects/%s/serviceAccounts/%s" project-id sa-email)]
    (try (.deleteServiceAccount iam-client sa-name)
         (catch Throwable _ nil))))
