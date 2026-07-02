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
   [metabase.driver.bigquery-cloud-sdk.workspace-test-util :as bq.util]
   [metabase.driver.bigquery-cloud-sdk.workspaces :as bigquery.ws]
   [metabase.driver.util :as driver.u]
   [metabase.test :as mt]
   [metabase.util :as u]
   [metabase.util.log :as log])
  (:import
   (com.google.auth.oauth2 ServiceAccountCredentials)
   (com.google.cloud.bigquery
    BigQuery
    BigQuery$DatasetListOption
    BigQuery$JobOption
    Dataset
    FieldValueList
    QueryJobConfiguration
    TableResult)
   (com.google.cloud.iam.admin.v1 IAMClient)))

(set! *warn-on-reflection* true)

(defn- random-suffix []
  (subs (str (random-uuid)) 0 8))

;; BQ helpers (admin client, IAM client, impersonated client, dataset CRUD,
;; assertion helpers) live in `metabase.driver.bigquery-cloud-sdk.workspace-test-util`
;; and are aliased as `bq.util` so the workspaces full-e2e test
;; (`metabase-enterprise.workspaces.e2e-test`) can share them.

(comment
  ;; "the "1500 account limit" message is because of the workspace bug - when
  ;; deprovisioning, we don't properly tear down the workspace for bigquery"
  ;; need to fix the underlying deprovisioning problem for this

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
                               (.getProjectId (bq.util/admin-credentials details)))
              admin-creds  (bq.util/admin-credentials details)
              admin-client (bq.util/admin-client details)
              iam-client   (bq.util/iam-client details)
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
            (bq.util/create-dataset! admin-client project-id in-dataset)
            (run-sql admin-client (format "CREATE TABLE %s (id INT64, v STRING)" (qual in-dataset src-name)))
            (run-sql admin-client (format "INSERT INTO %s (id, v) VALUES (1, 'a')" (qual in-dataset src-name)))
            (let [init-result     (driver/init-workspace-isolation! :bigquery-cloud-sdk database workspace)
                  ws-with-details (merge workspace init-result)
                  _               (reset! ws-state ws-with-details)
                  ws-sa-email     (-> ws-with-details :database_details :impersonate-service-account)
                  user-client     (bq.util/impersonated-client admin-creds ws-sa-email project-id)
                  out-dataset     (:schema ws-with-details)]
              (driver/grant-workspace-read-access! :bigquery-cloud-sdk database ws-with-details
                                                   [in-dataset])
              (testing "workspace SA can SELECT from a granted input table"
                (let [result (run-sql user-client
                                      (format "SELECT id, v FROM %s ORDER BY id" (qual in-dataset src-name)))
                      rows   (mapv (fn [^FieldValueList row]
                                     {:id (.getLongValue (.get row "id"))
                                      :v  (.getStringValue (.get row "v"))})
                                   (.iterateAll ^TableResult result))]
                  (is (= [{:id 1 :v "a"}] rows))))
              (testing "workspace SA cannot write to or DDL against the input dataset"
                ;; Beyond INSERT/UPDATE/DELETE we exercise ALTER TABLE and TRUNCATE
                ;; — BigQuery routes these through different IAM-permission checks
                ;; than DML, so a missed permission would slip through INSERT-only
                ;; coverage. Every assertion expects a 403 from the workspace SA.
                (doseq [[label sql] [[:insert        (format "INSERT INTO %s (id, v) VALUES (2, 'b')" (qual in-dataset src-name))]
                                     [:update        (format "UPDATE %s SET v = 'x' WHERE id = 1" (qual in-dataset src-name))]
                                     [:delete        (format "DELETE FROM %s WHERE id = 1" (qual in-dataset src-name))]
                                     [:create-table  (format "CREATE TABLE %s (id INT64)" (qual in-dataset sneaky-name))]
                                     [:drop-table    (format "DROP TABLE %s" (qual in-dataset src-name))]
                                     [:alter-add-col (format "ALTER TABLE %s ADD COLUMN extra INT64" (qual in-dataset src-name))]
                                     [:truncate      (format "TRUNCATE TABLE %s" (qual in-dataset src-name))]]]
                  (bq.util/expect-write-denied! user-client sql label)))
              (testing "workspace SA has full read+write access to its own output dataset"
                (run-sql user-client (format "CREATE TABLE %s (id INT64, v STRING)" (qual out-dataset out-name)))
                (run-sql user-client (format "INSERT INTO %s (id, v) VALUES (1, 'a')" (qual out-dataset out-name)))
                (run-sql user-client (format "UPDATE %s SET v = 'b' WHERE id = 1" (qual out-dataset out-name)))
                (run-sql user-client (format "DELETE FROM %s WHERE id = 1" (qual out-dataset out-name)))
                (run-sql user-client (format "DROP TABLE %s" (qual out-dataset out-name))))
              (testing "re-granting the same input table is idempotent"
                ;; Second grant call with an identical table list must not throw and
                ;; must not change the workspace SA's perms — still SELECT, still no
                ;; INSERT. Catches both noisy re-grant failures and silent IAM-binding
                ;; escalation.
                (driver/grant-workspace-read-access! :bigquery-cloud-sdk database ws-with-details
                                                     [in-dataset])
                (let [result (run-sql user-client (format "SELECT id FROM %s" (qual in-dataset src-name)))
                      rows   (mapv (fn [^FieldValueList row] {:id (.getLongValue (.get row "id"))})
                                   (.iterateAll ^TableResult result))]
                  (is (= [{:id 1}] rows)))
                (bq.util/expect-write-denied! user-client
                                              (format "INSERT INTO %s (id, v) VALUES (3, 'c')" (qual in-dataset src-name))
                                              :insert-after-regrant))
              (testing "workspace SA cannot create a new dataset outside its own workspace"
                ;; The workspace SA holds `roles/bigquery.jobUser` at project level
                ;; plus `dataEditor` on its own output dataset. Creating a *new*
                ;; dataset needs project-level `bigquery.datasets.create`, which
                ;; only project-IAM admins / BigQuery admins have. If this
                ;; succeeds, the workspace SA can grow its footprint indefinitely
                ;; — an escalation hole. We clean up only if the assertion
                ;; spuriously fails so a real bug doesn't leave a stray dataset.
                (let [hacker-ds (str "ws_iso_hacker_" run-id)
                      succeeded (atom false)]
                  (try
                    (bigquery.ws/create-dataset! user-client project-id hacker-ds)
                    (reset! succeeded true)
                    (is false (format "workspace SA unexpectedly created dataset %s" hacker-ds))
                    (catch Throwable t
                      (is (some? t)
                          (format "workspace SA correctly denied dataset creation: %s" (ex-message t)))))
                  (when @succeeded
                    (try (bigquery.ws/drop-dataset! admin-client project-id hacker-ds)
                         (catch Throwable _ nil)))))
              (testing "workspace SA cannot exfiltrate data via storage/external escapes"
                ;; The two BigQuery primitives that bridge to GCS (and thus would
                ;; let a workspace SA exfiltrate or inject data outside the BQ
                ;; sandbox) are CREATE EXTERNAL TABLE (read GCS object as a
                ;; queryable table) and EXPORT DATA (write query result to GCS).
                ;; Both require GCS-side `storage.objects.get` / `.create` on the
                ;; bucket, which the workspace SA has on no bucket — its IAM
                ;; bindings are scoped to BigQuery resources only. We point at a
                ;; freshly-named bucket so the response can be either 403
                ;; (perm-denied) or 404 (bucket-not-found); both confirm the SA
                ;; cannot reach GCS. Accept any 4xx via expect-bq-denied!.
                (let [hacker-uri  (format "gs://nonexistent-mb-iso-%s/data.csv" run-id)
                      ext-tbl     (qual out-dataset (str "ws_iso_ext_" run-id))]
                  (bq.util/expect-denied! user-client
                                          (format "CREATE EXTERNAL TABLE %s OPTIONS (uris = ['%s'], format = 'CSV')"
                                                  ext-tbl hacker-uri)
                                          :create-external-table)
                  (bq.util/expect-denied! user-client
                                          (format "EXPORT DATA OPTIONS (uri = '%s', format = 'CSV') AS SELECT 1 AS x"
                                                  hacker-uri)
                                          :export-data)))
              (testing "after destroy-workspace-isolation!, the workspace's footprint is gone"
                ;; Explicit destroy here (instead of relying on the `finally`) lets us
                ;; assert the cleanup actually happened. destroy is idempotent so
                ;; finally re-calling it is a no-op.
                (driver/destroy-workspace-isolation! :bigquery-cloud-sdk database ws-with-details)
                (bq.util/verify-destroy! project-id admin-client out-dataset)))
            (finally
              (try (driver/destroy-workspace-isolation! :bigquery-cloud-sdk database @ws-state)
                   (catch Throwable t
                     (log/warn t "destroy-workspace-isolation! failed for :bigquery-cloud-sdk during test cleanup")))
              ;; Belt-and-suspenders: directly delete the input dataset and workspace SA,
              ;; regardless of whether destroy succeeded. Both are idempotent.
              (try (bq.util/drop-dataset! admin-client project-id in-dataset) (catch Throwable _ nil))
              (try (bq.util/delete-sa-direct! iam-client project-id workspace) (catch Throwable _ nil))
              (u/ignore-exceptions (.close iam-client))))))))

  (deftest ^:synchronized cross-workspace-isolation-perms-bigquery-test
    ;; BigQuery sibling of `cross-workspace-isolation-perms-test`. Provisions two
    ;; workspaces, each with its own service account and dataset, and asserts that
    ;; A's impersonated SA cannot reach B's dataset, B's grants, or B's dataset
    ;; through `listDatasets` enumeration.
    (mt/test-driver :bigquery-cloud-sdk
      (testing "two workspaces on the same project are mutually isolated"
        (let [database     (mt/db)
              details      (:details database)
              admin-creds  (#'bigquery.ws/ws-service-account-credentials details)
              project-id   (or (:project-id details)
                               (.getProjectId ^ServiceAccountCredentials admin-creds))
              admin-client (#'bigquery.ws/ws-database-details->client details)
              iam-client   (#'bigquery.ws/ws-database-details->iam-client details)
              test-id      (random-suffix)
              ws-a-id      (random-suffix)
              ws-b-id      (random-suffix)
              ;; Each workspace gets its own input dataset. The BQ grant impl
              ;; grants `dataViewer` at the *dataset* level (matching the
              ;; schema-wide semantics of the SQL drivers), so co-locating
              ;; A's and B's source tables in a single dataset would let
              ;; either workspace SELECT both tables as a correctly-scoped
              ;; grant rather than a leak. Splitting per workspace makes the
              ;; `:select-other-grant` assertion meaningful.
              in-dataset-a (str "mb_iso_in_a_" test-id)
              in-dataset-b (str "mb_iso_in_b_" test-id)
              src-a-name   (str "ws_iso_src_a_" test-id)
              src-b-name   (str "ws_iso_src_b_" test-id)
              sneaky-name  (str "ws_iso_sneaky_" test-id)
              b-secret     (str "ws_iso_secret_" ws-b-id)
              ws-a         {:id   (Long/parseLong ws-a-id 16)
                            :name (str "wsd-A-" ws-a-id)}
              ws-b         {:id   (Long/parseLong ws-b-id 16)
                            :name (str "wsd-B-" ws-b-id)}
              ws-a-state   (atom (merge ws-a
                                        {:schema (driver.u/workspace-isolation-namespace-name ws-a)}))
              ws-b-state   (atom (merge ws-b
                                        {:schema (driver.u/workspace-isolation-namespace-name ws-b)}))
              qual         (fn [ds tbl] (format "`%s.%s.%s`" project-id ds tbl))
              run-sql      (fn [^BigQuery c sql]
                             (.query c (QueryJobConfiguration/of sql)
                                     (into-array BigQuery$JobOption [])))]
          (try
            (bigquery.ws/create-dataset! admin-client project-id in-dataset-a)
            (bigquery.ws/create-dataset! admin-client project-id in-dataset-b)
            (run-sql admin-client (format "CREATE TABLE %s (id INT64, v STRING)" (qual in-dataset-a src-a-name)))
            (run-sql admin-client (format "INSERT INTO %s (id, v) VALUES (1, 'a')" (qual in-dataset-a src-a-name)))
            (run-sql admin-client (format "CREATE TABLE %s (id INT64, v STRING)" (qual in-dataset-b src-b-name)))
            (run-sql admin-client (format "INSERT INTO %s (id, v) VALUES (1, 'b')" (qual in-dataset-b src-b-name)))
            (let [init-a       (driver/init-workspace-isolation! :bigquery-cloud-sdk database ws-a)
                  init-b       (driver/init-workspace-isolation! :bigquery-cloud-sdk database ws-b)
                  ws-a-full    (merge ws-a init-a)
                  ws-b-full    (merge ws-b init-b)
                  _            (reset! ws-a-state ws-a-full)
                  _            (reset! ws-b-state ws-b-full)
                  a-sa-email   (-> ws-a-full :database_details :impersonate-service-account)
                  b-sa-email   (-> ws-b-full :database_details :impersonate-service-account)
                  a-client     (bq.util/impersonated-client admin-creds a-sa-email project-id)
                  b-client     (bq.util/impersonated-client admin-creds b-sa-email project-id)
                  out-b-ds     (:schema ws-b-full)]
              ;; Each workspace is granted access only to its own input dataset —
              ;; A's grant must not let A read src-b in B's dataset, and vice-versa.
              (driver/grant-workspace-read-access! :bigquery-cloud-sdk database ws-a-full
                                                   [in-dataset-a])
              (driver/grant-workspace-read-access! :bigquery-cloud-sdk database ws-b-full
                                                   [in-dataset-b])
              ;; B populates its own output dataset with a table A should never reach.
              (run-sql b-client (format "CREATE TABLE %s (id INT64, v STRING)" (qual out-b-ds b-secret)))
              (run-sql b-client (format "INSERT INTO %s (id, v) VALUES (1, 'b-only')" (qual out-b-ds b-secret)))
              (testing "workspace A's SA cannot SELECT from workspace B's output table"
                (bq.util/expect-denied! a-client
                                        (format "SELECT id, v FROM %s" (qual out-b-ds b-secret))
                                        :select-other-output))
              (testing "workspace A's SA cannot write to or DDL against workspace B's output dataset"
                (doseq [[label sql] [[:insert        (format "INSERT INTO %s (id, v) VALUES (2, 'x')" (qual out-b-ds b-secret))]
                                     [:update        (format "UPDATE %s SET v = 'x' WHERE id = 1" (qual out-b-ds b-secret))]
                                     [:delete        (format "DELETE FROM %s WHERE id = 1" (qual out-b-ds b-secret))]
                                     [:create-table  (format "CREATE TABLE %s (id INT64)" (qual out-b-ds sneaky-name))]
                                     [:drop-table    (format "DROP TABLE %s" (qual out-b-ds b-secret))]
                                     [:alter-add-col (format "ALTER TABLE %s ADD COLUMN extra INT64" (qual out-b-ds b-secret))]
                                     [:truncate      (format "TRUNCATE TABLE %s" (qual out-b-ds b-secret))]]]
                  (bq.util/expect-denied! a-client sql label)))
              (testing "workspace A's SA cannot SELECT a source table that was only granted to workspace B"
                (bq.util/expect-denied! a-client
                                        (format "SELECT id, v FROM %s" (qual in-dataset-b src-b-name))
                                        :select-other-grant))
              (testing "workspace A's listDatasets does not enumerate workspace B's output dataset"
                ;; A's SA has only `roles/bigquery.jobUser` at the project plus `dataEditor`
                ;; on its own dataset, so listDatasets either returns A's own dataset
                ;; (filtered by visibility) or throws permission-denied. Either is fine —
                ;; what matters is that B's dataset never appears.
                (let [^com.google.api.gax.paging.Page
                      page  (try (.listDatasets a-client (into-array BigQuery$DatasetListOption []))
                                 (catch Throwable t
                                   (log/infof "listDatasets denied for ws-A SA (acceptable): %s" (ex-message t))
                                   nil))
                      names (when page
                              (->> (.iterateAll page)
                                   (map (fn [^Dataset d] (.getDataset (.getDatasetId d))))
                                   set))]
                  (is (not (contains? (or names #{}) out-b-ds))
                      (format "A unexpectedly enumerates B's dataset %s. visible=%s"
                              out-b-ds (or names #{}))))))
            (finally
              (doseq [w [@ws-a-state @ws-b-state]]
                (try (driver/destroy-workspace-isolation! :bigquery-cloud-sdk database w)
                     (catch Throwable t
                       (log/warn t "destroy-workspace-isolation! failed for :bigquery-cloud-sdk during cross-workspace test cleanup"))))
              ;; Belt-and-suspenders: drop input datasets + delete each workspace SA directly.
              (doseq [ds [in-dataset-a in-dataset-b]]
                (try (bigquery.ws/drop-dataset! admin-client project-id ds) (catch Throwable _ nil)))
              (doseq [w [ws-a ws-b]]
                (try (bq.util/delete-sa-direct! iam-client project-id w) (catch Throwable _ nil)))
              (u/ignore-exceptions (.close ^IAMClient iam-client))))))))

  (deftest ^:synchronized grant-accumulation-bigquery-test
    ;; BigQuery sibling of `grant-accumulation-test`. Pins the *additive* contract
    ;; of `grant-workspace-read-access!` for BigQuery: each call adds tables to
    ;; the workspace SA's read-set without revoking previously-granted ones.
    ;; BQ's grant impl adds a `dataViewer` IAM binding per table on each call,
    ;; which is naturally additive — this test prevents a future flip to
    ;; revoke-then-grant from passing unnoticed.
    (mt/test-driver :bigquery-cloud-sdk
      (testing "grant-workspace-read-access! is additive across multiple calls"
        (let [database     (mt/db)
              details      (:details database)
              project-id   (or (:project-id details)
                               (.getProjectId (bq.util/admin-credentials details)))
              admin-creds  (bq.util/admin-credentials details)
              admin-client (bq.util/admin-client details)
              iam-client   (bq.util/iam-client details)
              run-id       (random-suffix)
              ;; Two SEPARATE input datasets: BQ's `dataViewer` is dataset-scoped,
              ;; so a per-table read-denied assertion requires the tables live in
              ;; different datasets.
              in-a-dataset (str "mb_iso_in_a_" run-id)
              in-b-dataset (str "mb_iso_in_b_" run-id)
              src-a-name   (str "ws_iso_src_a_" run-id)
              src-b-name   (str "ws_iso_src_b_" run-id)
              workspace    {:id   (Long/parseLong run-id 16)
                            :name (str "wsd-grantaccum-" run-id)}
              ws-state     (atom (merge workspace {:schema (driver.u/workspace-isolation-namespace-name workspace)}))
              qual         (fn [ds tbl] (format "`%s.%s.%s`" project-id ds tbl))
              run-sql      (fn [^BigQuery c sql]
                             (.query c (QueryJobConfiguration/of sql)
                                     (into-array BigQuery$JobOption [])))
              select-id    (fn [^BigQuery c sql]
                             (mapv (fn [^FieldValueList row] {:id (.getLongValue (.get row "id"))})
                                   (.iterateAll ^TableResult (run-sql c sql))))]
          (try
            (bigquery.ws/create-dataset! admin-client project-id in-a-dataset)
            (bigquery.ws/create-dataset! admin-client project-id in-b-dataset)
            (run-sql admin-client (format "CREATE TABLE %s (id INT64, v STRING)" (qual in-a-dataset src-a-name)))
            (run-sql admin-client (format "INSERT INTO %s (id, v) VALUES (1, 'a')" (qual in-a-dataset src-a-name)))
            (run-sql admin-client (format "CREATE TABLE %s (id INT64, v STRING)" (qual in-b-dataset src-b-name)))
            (run-sql admin-client (format "INSERT INTO %s (id, v) VALUES (1, 'b')" (qual in-b-dataset src-b-name)))
            (let [init-result     (driver/init-workspace-isolation! :bigquery-cloud-sdk database workspace)
                  ws-with-details (merge workspace init-result)
                  _               (reset! ws-state ws-with-details)
                  ws-sa-email     (-> ws-with-details :database_details :impersonate-service-account)
                  user-client     (bq.util/impersonated-client admin-creds ws-sa-email project-id)]
              ;; First grant: only dataset A.
              (driver/grant-workspace-read-access! :bigquery-cloud-sdk database ws-with-details
                                                   [in-a-dataset])
              (testing "after first grant, A is readable and B is not"
                (is (= [{:id 1}] (select-id user-client (format "SELECT id FROM %s" (qual in-a-dataset src-a-name)))))
                (bq.util/expect-denied! user-client
                                        (format "SELECT id FROM %s" (qual in-b-dataset src-b-name))
                                        :select-b-before-grant))
              ;; Second grant: only dataset B. The additive contract means A's
              ;; grant must still be in effect afterward.
              (driver/grant-workspace-read-access! :bigquery-cloud-sdk database ws-with-details
                                                   [in-b-dataset])
              (testing "after second grant, both A and B are readable (A's binding accumulated)"
                (is (= [{:id 1}] (select-id user-client (format "SELECT id FROM %s" (qual in-a-dataset src-a-name)))))
                (is (= [{:id 1}] (select-id user-client (format "SELECT id FROM %s" (qual in-b-dataset src-b-name)))))))
            (finally
              (try (driver/destroy-workspace-isolation! :bigquery-cloud-sdk database @ws-state)
                   (catch Throwable t
                     (log/warn t "destroy-workspace-isolation! failed for :bigquery-cloud-sdk during grant-accumulation test cleanup")))
              (try (bigquery.ws/drop-dataset! admin-client project-id in-a-dataset) (catch Throwable _ nil))
              (try (bigquery.ws/drop-dataset! admin-client project-id in-b-dataset) (catch Throwable _ nil))
              (try (bq.util/delete-sa-direct! iam-client project-id workspace) (catch Throwable _ nil))
              (u/ignore-exceptions (.close ^IAMClient iam-client))))))))

  (deftest ^:synchronized init-handles-pre-existing-dataset-bigquery-test
    ;; BigQuery sibling of `init-handles-pre-existing-namespace-test`. The
    ;; output-dataset name is deterministic from `workspace.id` (see
    ;; `driver.u/workspace-isolation-namespace-name`), so init can land on an
    ;; existing dataset (partial prior init, another process, etc.). The driver's
    ;; `bigquery.ws/create-dataset!` is documented as idempotent ("no-op when the
    ;; dataset already exists"), so init silently succeeds. This test pins that
    ;; behavior — init must not crash on collision and the standard contract must
    ;; still hold afterward. Same KNOWN-LIMITATION caveat about pre-existing data
    ;; in the colliding dataset as the JDBC counterpart.
    (mt/test-driver :bigquery-cloud-sdk
      (testing "init-workspace-isolation! is robust when its target output dataset already exists"
        (let [database     (mt/db)
              details      (:details database)
              project-id   (or (:project-id details)
                               (.getProjectId (bq.util/admin-credentials details)))
              admin-creds  (bq.util/admin-credentials details)
              admin-client (bq.util/admin-client details)
              iam-client   (bq.util/iam-client details)
              run-id       (random-suffix)
              in-dataset   (str "mb_iso_in_" run-id)
              src-name     (str "ws_iso_src_" run-id)
              out-name     (str "ws_iso_out_" run-id)
              workspace    {:id   (Long/parseLong run-id 16)
                            :name (str "wsd-collision-" run-id)}
              out-dataset  (driver.u/workspace-isolation-namespace-name workspace)
              ws-state     (atom (merge workspace {:schema out-dataset}))
              qual         (fn [ds tbl] (format "`%s.%s.%s`" project-id ds tbl))
              run-sql      (fn [^BigQuery c sql]
                             (.query c (QueryJobConfiguration/of sql)
                                     (into-array BigQuery$JobOption [])))]
          (try
            (bigquery.ws/create-dataset! admin-client project-id in-dataset)
            (run-sql admin-client (format "CREATE TABLE %s (id INT64, v STRING)" (qual in-dataset src-name)))
            (run-sql admin-client (format "INSERT INTO %s (id, v) VALUES (1, 'a')" (qual in-dataset src-name)))
            ;; Pre-create the output dataset at exactly the name init will target,
            ;; before init runs.
            (bigquery.ws/create-dataset! admin-client project-id out-dataset)
            (let [init-result     (driver/init-workspace-isolation! :bigquery-cloud-sdk database workspace)
                  ws-with-details (merge workspace init-result)
                  _               (reset! ws-state ws-with-details)
                  ws-sa-email     (-> ws-with-details :database_details :impersonate-service-account)
                  user-client     (bq.util/impersonated-client admin-creds ws-sa-email project-id)]
              (driver/grant-workspace-read-access! :bigquery-cloud-sdk database ws-with-details
                                                   [in-dataset])
              (testing "init succeeded against the pre-existing dataset"
                (is (some? init-result)))
              (testing "workspace SA has full read+write access to its output dataset post-collision"
                (run-sql user-client (format "CREATE TABLE %s (id INT64, v STRING)" (qual out-dataset out-name)))
                (run-sql user-client (format "INSERT INTO %s (id, v) VALUES (1, 'a')" (qual out-dataset out-name)))
                (let [result (run-sql user-client (format "SELECT id, v FROM %s" (qual out-dataset out-name)))
                      rows   (mapv (fn [^FieldValueList row]
                                     {:id (.getLongValue (.get row "id"))
                                      :v  (.getStringValue (.get row "v"))})
                                   (.iterateAll ^TableResult result))]
                  (is (= [{:id 1 :v "a"}] rows)))
                (run-sql user-client (format "DROP TABLE %s" (qual out-dataset out-name))))
              (testing "workspace SA retains read-only access to input dataset post-collision"
                (let [result (run-sql user-client (format "SELECT id FROM %s" (qual in-dataset src-name)))
                      rows   (mapv (fn [^FieldValueList row] {:id (.getLongValue (.get row "id"))})
                                   (.iterateAll ^TableResult result))]
                  (is (= [{:id 1}] rows)))
                (bq.util/expect-write-denied! user-client
                                              (format "INSERT INTO %s (id, v) VALUES (2, 'b')" (qual in-dataset src-name))
                                              :insert-input-after-collision)))
            (finally
              (try (driver/destroy-workspace-isolation! :bigquery-cloud-sdk database @ws-state)
                   (catch Throwable t
                     (log/warn t "destroy-workspace-isolation! failed for :bigquery-cloud-sdk during collision test cleanup")))
              (try (bigquery.ws/drop-dataset! admin-client project-id in-dataset) (catch Throwable _ nil))
              ;; Belt-and-suspenders for the colliding output dataset: destroy
              ;; should have dropped it, but if init never reached the
              ;; create-dataset step (e.g., earlier failure) destroy might
              ;; not know to drop it. Idempotent.
              (try (bigquery.ws/drop-dataset! admin-client project-id out-dataset) (catch Throwable _ nil))
              (try (bq.util/delete-sa-direct! iam-client project-id workspace) (catch Throwable _ nil))
              (u/ignore-exceptions (.close ^IAMClient iam-client)))))))))
