(ns metabase-enterprise.workspaces.driver.bigquery
  "BigQuery workspace isolation using service account impersonation.

  Uses GCP IAM instead of SQL GRANT statements. Each workspace gets its own
  service account (created automatically) with table-level read permissions.

  Required GCP setup for the main service account:
  - Roles: `roles/bigquery.admin`, `roles/iam.serviceAccountAdmin`, `roles/resourcemanager.projectIamAdmin`
  - APIs: `bigquery.googleapis.com`, `iam.googleapis.com`, `cloudresourcemanager.googleapis.com`"
  (:require
   [clojure.string :as str]
   [metabase-enterprise.workspaces.isolation :as isolation]
   [metabase-enterprise.workspaces.util :as ws.util]
   [metabase.util :as u]
   [metabase.util.log :as log])
  (:import
   (com.google.auth.oauth2 ImpersonatedCredentials ServiceAccountCredentials)
   (com.google.cloud Identity Role)
   (com.google.cloud.bigquery Acl Acl$Role Acl$User
                              BigQuery BigQuery$DatasetListOption BigQuery$DatasetOption BigQuery$IAMOption BigQueryOptions
                              DatasetId DatasetInfo TableId)
   (com.google.cloud.iam.admin.v1 IAMClient IAMSettings)
   (com.google.cloud.resourcemanager.v3 ProjectsClient ProjectsSettings)
   (com.google.iam.admin.v1 CreateServiceAccountRequest ServiceAccount)
   (com.google.iam.v1 Binding Policy SetIamPolicyRequest GetIamPolicyRequest)
   (java.io ByteArrayInputStream)))

(set! *warn-on-reflection* true)

(defn- service-account-credentials
  "Parse ServiceAccountCredentials from database details."
  ^ServiceAccountCredentials [{:keys [service-account-json]}]
  (ServiceAccountCredentials/fromStream
   (ByteArrayInputStream. (.getBytes ^String service-account-json))))

(defn- get-project-id
  "Extract project ID from database details."
  [{:keys [project-id] :as details}]
  (or project-id (.getProjectId (service-account-credentials details))))

(defn- database-details->client
  "Create a BigQuery client from database details."
  ^BigQuery [details]
  (let [creds (.createScoped (service-account-credentials details)
                             ["https://www.googleapis.com/auth/bigquery"])]
    (-> (BigQueryOptions/newBuilder)
        (.setCredentials creds)
        (.build)
        (.getService))))

(defn- database-details->iam-client
  "Create an IAM Admin client from database details."
  ^IAMClient [details]
  (let [creds (.createScoped (service-account-credentials details)
                             ["https://www.googleapis.com/auth/cloud-platform"])]
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

(defn- service-account-exists?
  "Check if a service account exists."
  [^IAMClient iam-client ^String project-id ^String sa-email]
  (try
    (.getServiceAccount iam-client (format "projects/%s/serviceAccounts/%s" project-id sa-email))
    true
    (catch com.google.api.gax.rpc.NotFoundException _
      false)))

(defn- create-workspace-service-account!
  "Create a service account for a workspace if it doesn't exist.
   Returns the service account email."
  [^IAMClient iam-client ^String project-id workspace]
  (let [sa-id        (workspace-service-account-id workspace)
        sa-email     (format "%s@%s.iam.gserviceaccount.com" sa-id project-id)
        project-name (format "projects/%s" project-id)]
    ;; Check if already exists first
    (if (service-account-exists? iam-client project-id sa-email)
      (log/debugf "Service account already exists: %s" sa-email)
      (do
        (log/infof "Creating service account %s in project %s" sa-id project-id)
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
          (log/infof "Created service account: %s" sa-email))))
    sa-email))

(defn- has-role-binding?
  "Check if a policy already has a binding for the given role and member."
  [^Policy policy ^String role ^String member]
  (some (fn [^Binding binding]
          (and (= (.getRole binding) role)
               (some #(= % member) (.getMembersList binding))))
        (.getBindingsList policy)))

(defn- grant-impersonation-permission!
  "Grant the main service account permission to impersonate the workspace service account."
  [^IAMClient iam-client ^String project-id ^String main-sa-email ^String workspace-sa-email]
  (let [resource (format "projects/%s/serviceAccounts/%s" project-id workspace-sa-email)
        role     "roles/iam.serviceAccountTokenCreator"
        member   (format "serviceAccount:%s" main-sa-email)]
    (try
      ;; Get current policy
      (let [current-policy (.getIamPolicy iam-client resource)]
        ;; Only add if not already granted
        (when-not (has-role-binding? current-policy role member)
          (let [new-binding    (-> (Binding/newBuilder)
                                   (.setRole role)
                                   (.addMembers member)
                                   (.build))
                updated-policy (-> (Policy/newBuilder current-policy)
                                   (.addBindings new-binding)
                                   (.build))
                request        (-> (SetIamPolicyRequest/newBuilder)
                                   (.setResource resource)
                                   (.setPolicy updated-policy)
                                   (.build))]
            (.setIamPolicy iam-client request)
            (log/infof "Granted impersonation permission on %s to %s" workspace-sa-email main-sa-email))))
      (catch Exception e
        (log/warn e "Failed to grant impersonation permission (may already exist)")))))

(defn- grant-project-role!
  "Grant a project-level IAM role to a service account.
   This is needed for roles like bigquery.jobUser that must be granted at project level."
  [details ^String project-id ^String service-account-email ^String role]
  (log/infof "Granting project role %s to %s" role service-account-email)
  (let [creds          (.createScoped (service-account-credentials details)
                                      ["https://www.googleapis.com/auth/cloud-platform"])
        settings       (-> (ProjectsSettings/newBuilder)
                           (.setCredentialsProvider (reify com.google.api.gax.core.CredentialsProvider
                                                      (getCredentials [_] creds)))
                           (.build))
        projects-client (ProjectsClient/create settings)
        resource       (format "projects/%s" project-id)
        member         (format "serviceAccount:%s" service-account-email)]
    (try
      ;; Get current policy
      (let [get-request    (-> (GetIamPolicyRequest/newBuilder)
                               (.setResource resource)
                               (.build))
            current-policy (.getIamPolicy projects-client get-request)]
        ;; Only add if not already granted
        (when-not (has-role-binding? current-policy role member)
          (let [new-binding    (-> (Binding/newBuilder)
                                   (.setRole role)
                                   (.addMembers member)
                                   (.build))
                updated-policy (-> (Policy/newBuilder current-policy)
                                   (.addBindings new-binding)
                                   (.build))
                set-request    (-> (SetIamPolicyRequest/newBuilder)
                                   (.setResource resource)
                                   (.setPolicy updated-policy)
                                   (.build))]
            (.setIamPolicy projects-client set-request)
            (log/infof "Granted %s on project %s to %s" role project-id service-account-email))))
      (finally
        (.close projects-client)))))

(defn- wait-for-impersonation-ready!
  "Poll until impersonation is working. GCP IAM changes can take up to 60 seconds to propagate.
   Tests by actually creating impersonated credentials and making a simple API call."
  [details ^String target-sa-email & {:keys [max-attempts interval-ms]
                                      :or   {max-attempts 120
                                             interval-ms  1000}}]
  (log/info "Waiting for IAM impersonation to be ready...")
  (let [base-creds  (.createScoped (service-account-credentials details)
                                   ["https://www.googleapis.com/auth/bigquery"])
        project-id  (get-project-id details)]
    (loop [attempt 1]
      (log/debugf "Checking impersonation readiness (attempt %d/%d)" attempt max-attempts)
      (let [result (try
                     ;; Try to create impersonated credentials and use them
                     (let [impersonated (ImpersonatedCredentials/create
                                         base-creds
                                         target-sa-email
                                         nil  ;; delegates
                                         (java.util.ArrayList. ["https://www.googleapis.com/auth/bigquery"])
                                         3600)
                           client       (-> (BigQueryOptions/newBuilder)
                                            (.setCredentials impersonated)
                                            (.build)
                                            (.getService))]
                       ;; Try a simple operation - list datasets (limited to 1)
                       (.listDatasets client project-id (into-array BigQuery$DatasetListOption []))
                       :ready)
                     (catch Exception e
                       (if (or (str/includes? (str (ex-message e)) "permission")
                               (str/includes? (str (ex-message e)) "403")
                               (str/includes? (str (ex-message e)) "Access Denied"))
                         :not-ready
                         (do
                           (log/debugf "Unexpected error checking impersonation: %s" (ex-message e))
                           :not-ready))))]
        (cond
          (= result :ready)
          (log/info "IAM impersonation is ready")

          (>= attempt max-attempts)
          (throw (ex-info "Timeout waiting for IAM impersonation to propagate"
                          {:target-sa target-sa-email
                           :attempts  attempt}))

          :else
          (do
            (Thread/sleep interval-ms)
            (recur (inc attempt))))))))

(defn- role-name->acl-role
  "Convert a BigQuery IAM role name to an Acl$Role."
  ^Acl$Role [^String role-name]
  (case role-name
    "roles/bigquery.dataEditor" Acl$Role/WRITER
    "roles/bigquery.dataViewer" Acl$Role/READER
    "roles/bigquery.dataOwner"  Acl$Role/OWNER
    (throw (ex-info (str "Unknown role: " role-name) {:role role-name}))))

(defn- has-acl-entry?
  "Check if an ACL list already has an entry for the given entity and role."
  [acl-list ^Acl$User entity ^Acl$Role role]
  (some (fn [^Acl acl]
          (and (= (.getEntity acl) entity)
               (= (.getRole acl) role)))
        acl-list))

(defn- grant-dataset-acl!
  "Grant an ACL role on a dataset to a service account."
  [^BigQuery client ^DatasetId dataset-id ^String service-account-email ^String role-name]
  (log/debugf "Granting %s on dataset %s to %s" role-name dataset-id service-account-email)
  (let [dataset     (.getDataset client dataset-id (into-array BigQuery$DatasetOption []))
        current-acl (into [] (.getAcl dataset))
        acl-role    (role-name->acl-role role-name)
        acl-user    (Acl$User. service-account-email)]
    ;; Only add if not already granted
    (when-not (has-acl-entry? current-acl acl-user acl-role)
      (let [new-acl-entry   (Acl/of acl-user acl-role)
            updated-acl     (conj current-acl new-acl-entry)
            updated-dataset (-> (.toBuilder dataset)
                                (.setAcl updated-acl)
                                (.build))]
        (.update client updated-dataset (into-array BigQuery$DatasetOption []))))))

(defmethod isolation/init-workspace-database-isolation! :bigquery-cloud-sdk
  [database workspace]
  (let [details      (:details database)
        client       (database-details->client details)
        iam-client   (database-details->iam-client details)
        project-id   (get-project-id details)
        main-sa-email (.getClientEmail (service-account-credentials details))
        dataset-name (ws.util/isolation-namespace-name workspace)]

    (try
      ;; Create the workspace service account (or get existing)
      (let [ws-sa-email (create-workspace-service-account! iam-client project-id workspace)
            dataset-id  (DatasetId/of project-id dataset-name)]

        (log/infof "Initializing BigQuery workspace isolation: dataset=%s, service-account=%s"
                   dataset-name ws-sa-email)

        ;; Grant main SA permission to impersonate workspace SA
        (grant-impersonation-permission! iam-client project-id main-sa-email ws-sa-email)

        ;; Grant the workspace SA permission to run BigQuery jobs (queries) at project level
        ;; Note: We intentionally do NOT grant project-level dataEditor as that would give
        ;; access to all datasets. The workspace SA only gets dataEditor on its isolated dataset.
        (grant-project-role! details project-id ws-sa-email "roles/bigquery.jobUser")

        ;; Wait for IAM permissions to propagate by polling until impersonation works
        (wait-for-impersonation-ready! details ws-sa-email)

        ;; Create the isolated dataset if it doesn't exist (using main SA credentials, not impersonated)
        (when-not (.getDataset client dataset-id (into-array BigQuery$DatasetOption []))
          (let [dataset-info (-> (DatasetInfo/newBuilder dataset-id)
                                 (.setDescription (format "Metabase workspace isolation for workspace %s" (:id workspace)))
                                 (.build))]
            (.create client dataset-info (into-array BigQuery$DatasetOption []))))

        ;; Grant the workspace service account dataEditor role on the isolated dataset
        ;; dataEditor allows: create/update/delete tables, insert/update/delete data
        (grant-dataset-acl! client dataset-id ws-sa-email "roles/bigquery.dataEditor")

        ;; Return workspace connection details for impersonation
        ;; :user is used by grant-read-access-to-tables! to know which SA to grant access to
        ;; :impersonate-service-account is used by the connection swap to use impersonated credentials
        {:schema           dataset-name
         :database_details {:user                        ws-sa-email
                            :impersonate-service-account ws-sa-email}})
      (finally
        (.close iam-client)))))

(defn- has-table-iam-binding?
  "Check if a table IAM policy already has a binding for the given role and identity."
  [^com.google.cloud.Policy policy ^Role role ^Identity identity]
  (let [bindings (.getBindings policy)
        identity-set (get bindings role)]
    (and identity-set (.contains identity-set identity))))

(defn- grant-table-read-access!
  "Grant read access on a specific table to a service account using table-level IAM."
  [^BigQuery client ^TableId table-id ^String service-account-email]
  (log/debugf "Granting read access on table %s to %s" table-id service-account-email)
  (let [current-policy (.getIamPolicy client table-id (into-array BigQuery$IAMOption []))
        role           (Role/of "roles/bigquery.dataViewer")
        sa-identity    (Identity/serviceAccount service-account-email)]
    ;; Only add if not already granted
    (when-not (has-table-iam-binding? current-policy role sa-identity)
      (let [updated-policy (-> current-policy
                               (.toBuilder)
                               (.addIdentity role sa-identity (into-array Identity []))
                               (.build))]
        (.setIamPolicy client table-id updated-policy (into-array BigQuery$IAMOption []))))))

(defmethod isolation/grant-read-access-to-tables! :bigquery-cloud-sdk
  [database ws-sa-email tables]
  ;; For BigQuery, the 'username' argument is actually the workspace service account email
  ;; (from :impersonate-service-account in database_details)
  (let [details    (:details database)
        client     (database-details->client details)
        project-id (get-project-id details)]

    (log/debugf "Granting read access to %d tables for %s" (count tables) ws-sa-email)

    ;; Grant dataViewer at table level for each table - proper isolation
    (doseq [{:keys [schema name]} tables]
      (let [table-id (TableId/of project-id schema name)]
        (grant-table-read-access! client table-id ws-sa-email)))))

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
