(ns metabase-enterprise.workspaces.driver.bigquery
  "BigQuery-specific implementations for workspace isolation.

  BigQuery differences from SQL-based drivers:
  - Uses IAM policies instead of SQL GRANT statements
  - Uses service account impersonation instead of user/password authentication
  - Datasets are equivalent to schemas in other databases
  - Permissions are managed via Google Cloud IAM, not database-level grants"
  (:require
   [metabase-enterprise.workspaces.driver.common :as driver.common]
   [metabase-enterprise.workspaces.isolation :as isolation]
   [metabase-enterprise.workspaces.sync :as ws.sync]
   [metabase.util :as u]
   [metabase.util.log :as log])
  (:import
   (com.google.auth.oauth2 ServiceAccountCredentials)
   (com.google.cloud.bigquery Acl Acl$Role Acl$User
                              BigQuery BigQuery$DatasetOption BigQuery$TableOption BigQueryOptions
                              DatasetId DatasetInfo StandardTableDefinition TableId TableInfo)
   (com.google.cloud.iam.admin.v1 IAMClient IAMSettings)
   (com.google.iam.admin.v1 CreateServiceAccountRequest ServiceAccount)
   (com.google.iam.v1 Binding Policy SetIamPolicyRequest)
   (java.io ByteArrayInputStream)))

(set! *warn-on-reflection* true)

(defn- get-project-id
  "Extract project ID from database details."
  [{:keys [project-id service-account-json] :as _details}]
  (or project-id
      (when service-account-json
        (.getProjectId (ServiceAccountCredentials/fromStream
                        (ByteArrayInputStream. (.getBytes ^String service-account-json)))))))

(defn- database-details->credentials
  "Get ServiceAccountCredentials from database details."
  ^ServiceAccountCredentials [details]
  (ServiceAccountCredentials/fromStream
   (ByteArrayInputStream. (.getBytes ^String (:service-account-json details)))))

(defn- database-details->client
  "Create a BigQuery client from database details."
  ^BigQuery [details]
  (let [creds (-> (database-details->credentials details)
                  (.createScoped ["https://www.googleapis.com/auth/bigquery"]))]
    (-> (BigQueryOptions/newBuilder)
        (.setCredentials creds)
        (.build)
        (.getService))))

(defn- database-details->iam-client
  "Create an IAM Admin client from database details."
  ^IAMClient [details]
  (let [creds (-> (database-details->credentials details)
                  (.createScoped ["https://www.googleapis.com/auth/cloud-platform"]))]
    (IAMClient/create
     (-> (IAMSettings/newBuilder)
         (.setCredentialsProvider (reify com.google.api.gax.core.CredentialsProvider
                                    (getCredentials [_] creds)))
         (.build)))))

(defn- workspace-service-account-id
  "Generate the service account ID for a workspace (max 30 chars, lowercase, alphanumeric + hyphens)."
  [workspace]
  ;; Format: mb-ws-{workspace-id} truncated to 30 chars
  (let [ws-id (str (:id workspace))
        sa-id (str "mb-ws-" ws-id)]
    (-> sa-id
        (subs 0 (min 30 (count sa-id)))
        u/lower-case-en)))

(defn- create-workspace-service-account!
  "Create a service account for a workspace if it doesn't exist.
   Returns the service account email."
  [^IAMClient iam-client ^String project-id workspace]
  (let [sa-id       (workspace-service-account-id workspace)
        sa-email    (format "%s@%s.iam.gserviceaccount.com" sa-id project-id)
        project-name (format "projects/%s" project-id)]
    (try
      ;; Try to create the service account
      (let [request (-> (CreateServiceAccountRequest/newBuilder)
                        (.setName project-name)
                        (.setAccountId sa-id)
                        (.setServiceAccount
                         (-> (ServiceAccount/newBuilder)
                             (.setDisplayName (format "Metabase Workspace %s" (:id workspace)))
                             (.setDescription "Auto-created by Metabase for workspace isolation")
                             (.build)))
                        (.build))]
        (.createServiceAccount iam-client request)
        (log/infof "Created service account: %s" sa-email))
      (catch com.google.api.gax.rpc.AlreadyExistsException _
        (log/debugf "Service account already exists: %s" sa-email)))
    sa-email))

(defn- grant-impersonation-permission!
  "Grant the main service account permission to impersonate the workspace service account."
  [^IAMClient iam-client ^String project-id ^String main-sa-email ^String workspace-sa-email]
  (let [resource (format "projects/%s/serviceAccounts/%s" project-id workspace-sa-email)]
    (try
      ;; Get current policy
      (let [current-policy (.getIamPolicy iam-client resource)
            ;; Add binding for serviceAccountTokenCreator role
            new-binding (-> (Binding/newBuilder)
                            (.setRole "roles/iam.serviceAccountTokenCreator")
                            (.addMembers (format "serviceAccount:%s" main-sa-email))
                            (.build))
            updated-policy (-> (Policy/newBuilder current-policy)
                               (.addBindings new-binding)
                               (.build))
            request (-> (SetIamPolicyRequest/newBuilder)
                        (.setResource resource)
                        (.setPolicy updated-policy)
                        (.build))]
        (.setIamPolicy iam-client request)
        (log/infof "Granted impersonation permission on %s to %s" workspace-sa-email main-sa-email))
      (catch Exception e
        (log/warn e "Failed to grant impersonation permission (may already exist)")))))

(defn- role-name->acl-role
  "Convert a BigQuery IAM role name to an Acl$Role."
  ^Acl$Role [^String role-name]
  (case role-name
    "roles/bigquery.dataEditor" Acl$Role/WRITER
    "roles/bigquery.dataViewer" Acl$Role/READER
    "roles/bigquery.dataOwner"  Acl$Role/OWNER
    (throw (ex-info (str "Unknown role: " role-name) {:role role-name}))))

(defn- grant-dataset-acl!
  "Grant an ACL role on a dataset to a service account."
  [^BigQuery client ^DatasetId dataset-id ^String service-account-email ^String role-name]
  (log/debugf "Granting %s on dataset %s to %s" role-name dataset-id service-account-email)
  (let [dataset     (.getDataset client dataset-id (into-array BigQuery$DatasetOption []))
        current-acl (into [] (.getAcl dataset))
        acl-role    (role-name->acl-role role-name)
        new-acl-entry (Acl/of (Acl$User. service-account-email) acl-role)
        updated-acl (conj current-acl new-acl-entry)
        updated-dataset (-> (.toBuilder dataset)
                            (.setAcl updated-acl)
                            (.build))]
    (.update client updated-dataset (into-array BigQuery$DatasetOption []))))

(defmethod isolation/init-workspace-database-isolation! :bigquery-cloud-sdk
  [database workspace]
  (let [details      (:details database)
        client       (database-details->client details)
        iam-client   (database-details->iam-client details)
        project-id   (get-project-id details)
        main-sa-email (.getClientEmail (database-details->credentials details))
        dataset-name (driver.common/isolation-namespace-name workspace)]

    (try
      ;; Create the workspace service account (or get existing)
      (let [ws-sa-email (create-workspace-service-account! iam-client project-id workspace)
            dataset-id  (DatasetId/of project-id dataset-name)]

        (log/infof "Initializing BigQuery workspace isolation: dataset=%s, service-account=%s"
                   dataset-name ws-sa-email)

        ;; Grant main SA permission to impersonate workspace SA
        (grant-impersonation-permission! iam-client project-id main-sa-email ws-sa-email)

        ;; Create the isolated dataset
        (let [dataset-info (-> (DatasetInfo/newBuilder dataset-id)
                               (.setDescription (format "Metabase workspace isolation for workspace %s" (:id workspace)))
                               (.build))]
          (.create client dataset-info (into-array BigQuery$DatasetOption [])))

        ;; Grant the workspace service account dataEditor role on the isolated dataset
        ;; dataEditor allows: create/update/delete tables, insert/update/delete data
        (grant-dataset-acl! client dataset-id ws-sa-email "roles/bigquery.dataEditor")

        ;; Return workspace connection details for impersonation
        {:schema           dataset-name
         :database_details {:impersonate-service-account ws-sa-email}})
      (finally
        (.close iam-client)))))

(defn- grant-table-read-access!
  "Grant read access on a specific table to a service account using table-level IAM."
  [^BigQuery client ^TableId table-id ^String service-account-email]
  (log/debugf "Granting read access on table %s to %s" table-id service-account-email)
  (let [current-policy (.getIamPolicy client table-id (into-array BigQuery$TableOption []))
        new-binding    (-> (Binding/newBuilder)
                           (.setRole "roles/bigquery.dataViewer")
                           (.addMembers (format "serviceAccount:%s" service-account-email))
                           (.build))
        updated-policy (-> (Policy/newBuilder current-policy)
                           (.addBindings new-binding)
                           (.build))]
    (.setIamPolicy client table-id updated-policy)))

(defmethod isolation/grant-read-access-to-tables! :bigquery-cloud-sdk
  [database workspace tables]
  (let [details     (:details database)
        client      (database-details->client details)
        project-id  (get-project-id details)
        ws-sa-email (-> workspace :database_details :impersonate-service-account)]

    (log/debugf "Granting read access to %d tables for %s" (count tables) ws-sa-email)

    ;; Grant dataViewer at table level for each table - proper isolation
    (doseq [{:keys [schema name]} tables]
      (let [table-id (TableId/of project-id schema name)]
        (grant-table-read-access! client table-id ws-sa-email)))))

(defmethod isolation/duplicate-output-table! :bigquery-cloud-sdk
  [database workspace output]
  (let [details         (:details database)
        client          (database-details->client details)
        project-id      (get-project-id details)
        source-schema   (:schema output)
        source-table    (:name output)
        isolated-schema (:schema workspace)
        isolated-table  (driver.common/isolated-table-name output)

        source-table-id   (TableId/of project-id source-schema source-table)
        isolated-table-id (TableId/of project-id isolated-schema isolated-table)]

    (assert (every? some? [source-schema source-table isolated-schema isolated-table])
            "All table identifiers must be present")

    (log/debugf "Duplicating table structure: %s.%s -> %s.%s"
                source-schema source-table isolated-schema isolated-table)

    ;; Get source table schema
    (let [source-table-obj (.getTable client source-table-id (into-array BigQuery$TableOption []))
          _                (when-not source-table-obj
                             (throw (ex-info "Source table not found"
                                             {:source-schema source-schema
                                              :source-table source-table})))
          schema           (.. source-table-obj getDefinition getSchema)

          ;; Create structure-only copy in isolated dataset
          table-info       (-> (TableInfo/newBuilder isolated-table-id
                                                     (StandardTableDefinition/of schema))
                               (.build))]
      (.create client table-info (into-array BigQuery$TableOption [])))

    ;; Sync the new table metadata into Metabase
    (let [table-metadata (ws.sync/sync-transform-mirror! database isolated-schema isolated-table)]
      (select-keys table-metadata [:id :schema :name]))))

(defmethod isolation/drop-isolated-tables! :bigquery-cloud-sdk
  [database s+t-tuples]
  (when (seq s+t-tuples)
    (let [details    (:details database)
          client     (database-details->client details)
          project-id (get-project-id details)]
      (doseq [[dataset-name table-name] s+t-tuples]
        (let [table-id (TableId/of project-id dataset-name table-name)]
          (log/debugf "Dropping isolated table: %s.%s" dataset-name table-name)
          (try
            (.delete client table-id)
            (catch Exception e
              (log/warnf e "Failed to delete table %s.%s (may not exist)" dataset-name table-name))))))))
