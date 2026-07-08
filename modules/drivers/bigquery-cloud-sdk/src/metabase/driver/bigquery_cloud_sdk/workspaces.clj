(ns metabase.driver.bigquery-cloud-sdk.workspaces
  "BigQuery workspace isolation: per-workspace service accounts, IAM bindings,
   and dataset ACLs that gate read/write access to isolated datasets. Loaded
   for side-effects by `metabase.driver.bigquery-cloud-sdk` to register the
   `driver/{init,grant,check,destroy}-workspace-isolation*` multimethod
   implementations."
  (:refer-clojure :exclude [some not-empty])
  (:require
   [clojure.string :as str]
   [metabase.driver :as driver]
   [metabase.driver.bigquery-cloud-sdk.common :as bigquery.common]
   [metabase.driver.connection :as driver.conn]
   [metabase.driver.sql.util :as sql.u]
   [metabase.driver.util :as driver.u]
   [metabase.util :as u]
   [metabase.util.i18n :refer [tru]]
   [metabase.util.log :as log]
   [metabase.util.performance :refer [some not-empty]])
  (:import
   (com.google.auth.oauth2 ImpersonatedCredentials ServiceAccountCredentials)
   (com.google.cloud.bigquery
    Acl Acl$Role Acl$User
    BigQuery
    BigQuery$DatasetDeleteOption
    BigQuery$DatasetListOption
    BigQuery$DatasetOption
    BigQueryOptions BigQueryOptions$Builder
    Dataset
    DatasetId DatasetInfo)
   (com.google.cloud.iam.admin.v1 IAMClient IAMSettings)
   (com.google.cloud.resourcemanager.v3 ProjectsClient ProjectsSettings)
   (com.google.iam.admin.v1 CreateServiceAccountRequest DeleteServiceAccountRequest ServiceAccount)
   (com.google.iam.v1 Binding Policy SetIamPolicyRequest GetIamPolicyRequest)
   (java.io ByteArrayInputStream)))

(set! *warn-on-reflection* true)

(defn- quote-schema [s] (sql.u/quote-name :bigquery-cloud-sdk :schema s))

(defn create-dataset!
  "Create `dataset-name` in `project-id` via `client`. Idempotent — no-op when
   the dataset already exists. `:description` (in `opts`) is optional metadata.

   Used by [[init-workspace-isolation!]] to provision the workspace's output
   dataset, and by tests to set up per-run source datasets."
  [^BigQuery client ^String project-id ^String dataset-name & [{:keys [^String description]}]]
  (let [dataset-id (DatasetId/of project-id dataset-name)]
    (when-not (.getDataset client dataset-id
                           ^"[Lcom.google.cloud.bigquery.BigQuery$DatasetOption;"
                           (into-array BigQuery$DatasetOption []))
      (let [builder (DatasetInfo/newBuilder dataset-id)
            _       (when description (.setDescription builder description))
            info    (.build builder)]
        (.create client info
                 ^"[Lcom.google.cloud.bigquery.BigQuery$DatasetOption;"
                 (into-array BigQuery$DatasetOption []))))))

(defn drop-dataset!
  "Delete `dataset-name` in `project-id` via `client`, including all its tables.
   Idempotent — no-op when the dataset doesn't exist.

   Used by [[destroy-workspace-isolation!]] to tear down the workspace's output
   dataset, and by tests to clean up per-run source datasets."
  [^BigQuery client ^String project-id ^String dataset-name]
  (let [dataset-id (DatasetId/of project-id dataset-name)]
    (when (.getDataset client dataset-id
                       ^"[Lcom.google.cloud.bigquery.BigQuery$DatasetOption;"
                       (into-array BigQuery$DatasetOption []))
      (.delete client dataset-id
               ^"[Lcom.google.cloud.bigquery.BigQuery$DatasetDeleteOption;"
               (into-array BigQuery$DatasetDeleteOption
                           [(BigQuery$DatasetDeleteOption/deleteContents)])))))

(def ^:private perm-check-workspace-id "00000000-0000-0000-0000-000000000000")

(defn- sa-propagation-error?
  "True for the GCP race where an API call references a service account that was
   just created but hasn't yet propagated to the API receiving the call. GCP
   surfaces this as `INVALID_ARGUMENT: Service account <email> does not exist.`
   even though `iam.googleapis.com` already created it. Retrying the same call
   eventually succeeds once propagation completes (usually <30s)."
  [^Throwable t]
  (when-let [msg (ex-message t)]
    (and (instance? com.google.api.gax.rpc.InvalidArgumentException t)
         (str/includes? msg "Service account")
         (str/includes? msg "does not exist"))))

(defn- ws-has-acl-entry?
  "Check if an ACL list already has an entry for the given entity and role."
  [acl-list ^Acl$User entity ^Acl$Role role]
  (some (fn [^Acl acl]
          (and (= (.getEntity acl) entity)
               (= (.getRole acl) role)))
        acl-list))

(defn- ws-has-role-binding?
  "Check if a policy already has a binding for the given role and member."
  [^Policy policy ^String role ^String member]
  (some (fn [^Binding binding]
          (and (= (.getRole binding) role)
               (some #(= % member) (.getMembersList binding))))
        (.getBindingsList policy)))

(defn- ws-role-name->acl-role
  "Convert a BigQuery IAM role name to an Acl$Role."
  ^Acl$Role [^String role-name]
  (case role-name
    "roles/bigquery.dataEditor" Acl$Role/WRITER
    "roles/bigquery.dataViewer" Acl$Role/READER
    "roles/bigquery.dataOwner"  Acl$Role/OWNER
    (throw (ex-info (str "Unknown role: " role-name) {:role role-name}))))

(defn ws-sa-description->created-at
  "Parse the `created-at:<iso-instant>` token out of a workspace iso SA
   `description` string. Returns the parsed `java.time.Instant`, or nil
   when the marker is absent / malformed.

   Round-trip contract: `(= i (ws-sa-description->created-at (ws-sa-description i)))`."
  ^java.time.Instant [description]
  (when description
    (when-let [match (re-find #"created-at:(\S+)" description)]
      (try
        (java.time.Instant/parse (second match))
        (catch Throwable _ nil)))))

(def ^:private ws-sa-description-prefix
  "Auto-created by Metabase for workspace isolation; created-at:")

(defn- ws-service-account-credentials
  "Parse ServiceAccountCredentials from database details."
  ^ServiceAccountCredentials [{:keys [service-account-json]}]
  (ServiceAccountCredentials/fromStream
   (ByteArrayInputStream. (.getBytes ^String service-account-json))))

(defn- ws-service-account-exists?
  "Check if a service account exists."
  [^IAMClient iam-client ^String project-id ^String sa-email]
  (try
    (.getServiceAccount iam-client (format "projects/%s/serviceAccounts/%s" project-id sa-email))
    true
    (catch com.google.api.gax.rpc.NotFoundException _
      false)))

(defn- ws-service-account-id
  "Generate the service account ID for a workspace (max 30 chars, lowercase, alphanumeric + hyphens)."
  [workspace]
  ;; Format: mb-ws-{workspace-id} truncated to 30 chars
  (let [ws-id (str (:id workspace))
        sa-id (str "mb-ws-" ws-id)]
    (-> sa-id
        (subs 0 (min 30 (count sa-id)))
        u/lower-case-en)))

(defn- with-sa-propagation-retry!
  "Run `f` (a no-arg fn), retrying when GCP rejects it because a freshly-created
   workspace SA isn't yet visible to the API being called. Used for IAM bindings
   that reference the SA as a member — these can race with SA creation across
   GCP services (IAM ↔ Cloud Resource Manager) even after the create returned."
  [{:keys [max-attempts interval-ms]
    :or   {max-attempts 60
           interval-ms  1000}}
   f]
  (loop [attempt 1]
    (let [result (try
                   [::ok (f)]
                   (catch Throwable t
                     (if (and (sa-propagation-error? t)
                              (< attempt max-attempts))
                       [::retry t]
                       (throw t))))]
      (case (first result)
        ::ok    (second result)
        ::retry (do
                  (log/debugf "SA propagation race on attempt %d/%d, retrying in %dms"
                              attempt max-attempts interval-ms)
                  (Thread/sleep ^long interval-ms)
                  (recur (inc attempt)))))))

(defn- ws-grant-impersonation-permission!
  "Grant the main service account permission to impersonate the workspace service account.

   The pre-check `ws-has-role-binding?` makes the only no-op-of-concern (the binding
   already exists) a non-write. Any exception raised by `getIamPolicy` or `setIamPolicy`
   reflects a real failure -- `PERMISSION_DENIED`, `RESOURCE_EXHAUSTED`, `INVALID_ARGUMENT`,
   network/`UNAVAILABLE`, or an etag race between concurrent provisioners -- and must
   propagate so the caller's `init-workspace-isolation!` flow fails loudly instead of
   timing out 120s downstream in `ws-wait-for-impersonation-ready!` with no signal."
  [^IAMClient iam-client ^String project-id ^String main-sa-email ^String workspace-sa-email]
  (let [resource (format "projects/%s/serviceAccounts/%s" project-id workspace-sa-email)
        role     "roles/iam.serviceAccountTokenCreator"
        member   (format "serviceAccount:%s" main-sa-email)
        ;; Get current policy
        current-policy (.getIamPolicy iam-client resource)]
    ;; Only add if not already granted
    (when-not (ws-has-role-binding? current-policy role member)
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
        (log/infof "Granted impersonation permission on %s to %s" workspace-sa-email main-sa-email)))))

(defn- ws-grant-dataset-acl!
  "Grant an ACL role on a dataset to a service account."
  [^BigQuery client ^DatasetId dataset-id ^String service-account-email ^String role-name]
  (log/debugf "Granting %s on dataset %s to %s" role-name dataset-id service-account-email)
  (let [dataset     ^Dataset (.getDataset client dataset-id
                                          ^"[Lcom.google.cloud.bigquery.BigQuery$DatasetOption;"
                                          (into-array BigQuery$DatasetOption []))
        current-acl (into [] (.getAcl dataset))
        acl-role    (ws-role-name->acl-role role-name)
        acl-user    (Acl$User. service-account-email)]
    ;; Only add if not already granted
    (when-not (ws-has-acl-entry? current-acl acl-user acl-role)
      (let [new-acl-entry   (Acl/of acl-user acl-role)
            updated-acl     (conj current-acl new-acl-entry)
            updated-dataset (-> (.toBuilder dataset)
                                (.setAcl ^"clojure.lang.PersistentVector" updated-acl)
                                (.build))]
        (.update client updated-dataset
                 ^"[Lcom.google.cloud.bigquery.BigQuery$DatasetOption;"
                 (into-array BigQuery$DatasetOption []))))))

(defn ws-sa-description
  "Format an IAM service account `description` field for a workspace iso SA.
   The string carries `created-at:<ISO-8601 instant>` so that CI cleanup can
   age-gate orphan SAs without needing IAM audit-log access.

   This is the single source of truth for the description format. The cleanup
   side ([[ws-sa-description->created-at]]) reads from it -- keep them in
   lockstep by going through these two fns rather than building/parsing
   the string inline anywhere else."
  ^String [^java.time.Instant instant]
  (str ws-sa-description-prefix instant))

(defn- ws-database-details->client
  "Create a BigQuery client from database details for workspace isolation."
  ^BigQuery [details]
  (let [creds (.createScoped (ws-service-account-credentials details)
                             (doto (java.util.ArrayList.)
                               (.add "https://www.googleapis.com/auth/bigquery")))]
    (-> (BigQueryOptions/newBuilder)
        ^BigQueryOptions$Builder (.setCredentials creds)
        ^BigQueryOptions (.build)
        (.getService))))

(defn- ws-database-details->iam-client
  "Create an IAM Admin client from database details."
  ^IAMClient [details]
  (let [creds (.createScoped (ws-service-account-credentials details)
                             (doto (java.util.ArrayList.)
                               (.add "https://www.googleapis.com/auth/cloud-platform")))]
    (IAMClient/create
     (-> (IAMSettings/newBuilder)
         (.setCredentialsProvider (reify com.google.api.gax.core.CredentialsProvider
                                    (getCredentials [_] creds)))
         ^IAMSettings (.build)))))

(defn- ws-wait-for-dataset-visible-via-impersonation!
  "Poll until the impersonated workspace SA can see `target-dataset` from
   BOTH `getDataset` AND `listDatasets`. BigQuery dataset ACL updates are
   eventually consistent and the two endpoints sync independently:
   `getDataset` typically picks up a dataViewer grant within ~1s, but
   `listDatasets` (which `can-connect-with-details?` uses) can lag tens
   of seconds behind. Returning from the wait when only `getDataset` agrees
   leaves the next `can-connect-with-details?` call hitting `listDatasets`
   with the still-stale cache, which throws `Looks like we cannot find any
   matching datasets` and surfaces as `Failed to connect to Database` in
   `init-from-config-file!`.

   Gate on the `listDatasets` outcome so the wait returns only once the
   exact endpoint can-connect uses agrees. Each iteration builds a fresh
   impersonated client to avoid carrying token / negative-cache state."
  [details ^String target-sa-email ^String project-id ^String target-dataset
   & {:keys [max-attempts interval-ms]
      :or   {max-attempts 90
             interval-ms  1000}}]
  (log/infof "Waiting for dataset %s to be visible to %s via listDatasets..."
             target-dataset target-sa-email)
  (loop [attempt 1]
    (let [outcome (try
                    (let [base-creds   (.createScoped (ws-service-account-credentials details)
                                                      (doto (java.util.ArrayList.)
                                                        (.add "https://www.googleapis.com/auth/bigquery")))
                          impersonated (ImpersonatedCredentials/create
                                        base-creds
                                        target-sa-email
                                        nil
                                        (doto (java.util.ArrayList.)
                                          (.add "https://www.googleapis.com/auth/bigquery"))
                                        3600)
                          client       (-> (BigQueryOptions/newBuilder)
                                           ^BigQueryOptions$Builder (.setCredentials impersonated)
                                           ^BigQueryOptions$Builder (.setProjectId project-id)
                                           ^BigQueryOptions (.build)
                                           ^BigQuery (.getService))
                          ;; Fast-path probe: if `getDataset` doesn't even see the dataset,
                          ;; `listDatasets` certainly won't, and we can skip the more expensive
                          ;; pagination this iteration.
                          single-ok?   (some? (try (.getDataset client
                                                                (DatasetId/of project-id target-dataset)
                                                                ^"[Lcom.google.cloud.bigquery.BigQuery$DatasetOption;"
                                                                (into-array BigQuery$DatasetOption []))
                                                   (catch Exception _ nil)))
                          datasets     (when single-ok?
                                         (.listDatasets client project-id
                                                        (into-array BigQuery$DatasetListOption [])))
                          listed-ok?   (boolean
                                        (when datasets
                                          (some (fn [^Dataset d] (= target-dataset (.. d getDatasetId getDataset)))
                                                (.iterateAll datasets))))]
                      (if listed-ok? :ready :not-yet))
                    (catch Exception e
                      (log/debugf "Unexpected error checking dataset visibility: %s" (ex-message e))
                      :not-yet))]
      (cond
        (= outcome :ready)
        (log/infof "Dataset %s is visible to %s via listDatasets after %d attempt(s)"
                   target-dataset target-sa-email attempt)

        (>= attempt max-attempts)
        (throw (ex-info "Timeout waiting for dataset ACL grant to propagate to listDatasets"
                        {:target-sa       target-sa-email
                         :target-dataset  target-dataset
                         :attempts        attempt}))

        :else
        (do
          (Thread/sleep ^long interval-ms)
          (recur (inc attempt)))))))

(defn- ws-wait-for-impersonation-ready!
  "Poll until impersonation is working. GCP IAM changes can take up to 60 seconds to propagate.
   Tests by actually creating impersonated credentials and making a simple API call.

   Each iteration builds a fresh `ServiceAccountCredentials` source (and the
   derived `ImpersonatedCredentials` + `BigQuery` client). Reusing one across
   iterations would let GCP's auth-library token-cache and retry/backoff state
   from an early failure persist for the duration of the loop, so even after
   the underlying IAM grant propagates, every subsequent check inherits the
   negative-cached state and the loop times out. Per-iteration creation
   isolates each attempt.

   On timeout, throws an `ex-info` with a verbose diagnostic so CI logs
   immediately show why we gave up: total wait time, ceiling vs Google's
   documented worst case (7 min for direct IAM policy edits), last GCP error
   message + class, and a histogram of error classes seen across attempts.
   See https://docs.cloud.google.com/iam/docs/access-change-propagation."
  [details ^String target-sa-email & {:keys [max-attempts interval-ms]
                                      :or   {max-attempts 120
                                             interval-ms  1000}}]
  (log/info "Waiting for IAM impersonation to be ready...")
  (let [project-id (bigquery.common/get-project-id details)
        started-ns (System/nanoTime)]
    (loop [attempt        1
           last-error     nil
           error-classes  {}]
      (log/debugf "Checking impersonation readiness (attempt %d/%d)" attempt max-attempts)
      (let [{:keys [status error err-class]}
            (try
              ;; Build fresh credentials each iteration to avoid cached
              ;; negative results from earlier attempts.
              (let [base-creds   (.createScoped (ws-service-account-credentials details)
                                                (doto (java.util.ArrayList.)
                                                  (.add "https://www.googleapis.com/auth/bigquery")))
                    impersonated (ImpersonatedCredentials/create
                                  base-creds
                                  target-sa-email
                                  nil  ;; delegates
                                  (doto (java.util.ArrayList.)
                                    (.add "https://www.googleapis.com/auth/bigquery"))
                                  3600)
                    client       (-> (BigQueryOptions/newBuilder)
                                     ^BigQueryOptions$Builder (.setCredentials impersonated)
                                     ^BigQueryOptions$Builder (.setProjectId project-id)
                                     ^BigQueryOptions (.build)
                                     ^BigQuery (.getService))]
                ;; Try a simple operation - list datasets (limited to 1)
                (.listDatasets client project-id (into-array BigQuery$DatasetListOption []))
                {:status :ready})
              (catch Exception e
                (let [msg (str (ex-message e))
                      cls (cond
                            (or (str/includes? msg "permission")
                                (str/includes? msg "403")
                                (str/includes? msg "Access Denied")) :access-denied
                            (or (str/includes? msg "DEADLINE_EXCEEDED")
                                (str/includes? msg "deadline")
                                (str/includes? msg "timeout"))        :deadline
                            (str/includes? msg "UNAVAILABLE")         :unavailable
                            (or (str/includes? msg "UNAUTHENTICATED")
                                (str/includes? msg "401"))            :unauthenticated
                            :else                                     :other)]
                  (when (= cls :other)
                    (log/debugf "Unexpected error checking impersonation: %s" msg))
                  {:status :not-ready :error e :err-class cls})))]
        (cond
          (= status :ready)
          (log/infof "IAM impersonation ready after %d attempt(s) (%.1fs)"
                     attempt (/ (- (System/nanoTime) started-ns) 1e9))

          (>= attempt max-attempts)
          (let [elapsed-s   (/ (- (System/nanoTime) started-ns) 1e9)
                last-msg    (some-> last-error ex-message)
                last-cls    (some-> last-error class .getName)
                histogram   (->> error-classes
                                 (sort-by (comp - val))
                                 (map (fn [[k v]] (format "%s=%d" (name k) v)))
                                 (str/join ", "))]
            (throw (ex-info
                    (format (str "Timeout waiting for IAM impersonation to propagate "
                                 "after %d attempts / %.1fs (ceiling %ds). "
                                 "Google's documented worst case for direct IAM policy edits is ~7min "
                                 "(see https://docs.cloud.google.com/iam/docs/access-change-propagation). "
                                 "Errors seen: {%s}. Last error (%s): %s")
                            attempt elapsed-s (long (/ (* max-attempts interval-ms) 1000))
                            (or (not-empty histogram) "<none>")
                            (or last-cls "n/a")
                            (or last-msg "n/a"))
                    {:target-sa            target-sa-email
                     :project-id           project-id
                     :attempts             attempt
                     :elapsed-seconds      elapsed-s
                     :ceiling-seconds      (long (/ (* max-attempts interval-ms) 1000))
                     :error-class-counts   error-classes
                     :last-error-message   last-msg
                     :last-error-class     last-cls
                     :iam-propagation-doc  "https://docs.cloud.google.com/iam/docs/access-change-propagation"}
                    last-error)))

          :else
          (do
            (Thread/sleep ^long interval-ms)
            (recur (inc attempt)
                   error
                   (update error-classes err-class (fnil inc 0)))))))))

(defn- ws-wait-for-service-account!
  "Poll IAM until the SA created by `ws-create-service-account!` is visible.

   GCP IAM is eventually consistent: `.createServiceAccount` returns once the
   create request is accepted by the control plane, but the SA record then
   propagates to read endpoints (`getServiceAccount`) and policy enforcement
   (`setIamPolicy`) over the next few seconds. Subsequent grants in
   `init-workspace-isolation!` reference this SA and fail with
   `INVALID_ARGUMENT: ... does not exist` if they fire before the SA is
   visible to those endpoints -- the failure mode that left workspace e2e
   red on BigQuery before this wait existed.

   `ws-service-account-exists?` already swallows `NotFoundException` and
   returns false, so the loop just polls its boolean return."
  [^IAMClient iam-client ^String project-id ^String sa-email
   & {:keys [max-attempts interval-ms]
      :or   {max-attempts 60
             interval-ms  1000}}]
  (log/infof "Waiting for service account %s to be visible to IAM..." sa-email)
  (loop [attempt 1]
    (cond
      (ws-service-account-exists? iam-client project-id sa-email)
      (log/infof "Service account %s is visible to IAM after %d attempt(s)" sa-email attempt)

      (>= attempt max-attempts)
      (throw (ex-info "Timeout waiting for service account to propagate"
                      {:sa-email sa-email
                       :attempts attempt}))

      :else
      (do
        (Thread/sleep ^long interval-ms)
        (recur (inc attempt))))))

(defn- ws-delete-service-account!
  "Delete a service account for a workspace. Idempotent - does nothing if SA doesn't exist."
  [^IAMClient iam-client ^String project-id workspace]
  (let [sa-id    (ws-service-account-id workspace)
        sa-email (format "%s@%s.iam.gserviceaccount.com" sa-id project-id)
        sa-name  (format "projects/%s/serviceAccounts/%s" project-id sa-email)]
    (when (ws-service-account-exists? iam-client project-id sa-email)
      (log/infof "Deleting service account %s" sa-email)
      (let [request (-> (DeleteServiceAccountRequest/newBuilder)
                        (.setName sa-name)
                        (.build))]
        (.deleteServiceAccount iam-client request)
        (log/infof "Deleted service account: %s" sa-email)))))

(defn- ws-grant-project-role!
  "Grant a project-level IAM role to a service account.
   This is needed for roles like bigquery.jobUser that must be granted at project level."
  [details ^String project-id ^String service-account-email ^String role]
  (log/infof "Granting project role %s to %s" role service-account-email)
  (let [creds          (.createScoped (ws-service-account-credentials details)
                                      (doto (java.util.ArrayList.)
                                        (.add "https://www.googleapis.com/auth/cloud-platform")))
        settings       (-> (ProjectsSettings/newBuilder)
                           (.setCredentialsProvider (reify com.google.api.gax.core.CredentialsProvider
                                                      (getCredentials [_] creds)))
                           ^ProjectsSettings (.build))
        projects-client (ProjectsClient/create settings)
        resource       (format "projects/%s" project-id)
        member         (format "serviceAccount:%s" service-account-email)]
    (try
      (with-sa-propagation-retry! {}
        (fn []
          ;; Get current policy
          (let [get-request    (-> (GetIamPolicyRequest/newBuilder)
                                   (.setResource resource)
                                   (.build))
                current-policy (.getIamPolicy projects-client get-request)]
            ;; Only add if not already granted
            (when-not (ws-has-role-binding? current-policy role member)
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
                (log/infof "Granted %s on project %s to %s" role project-id service-account-email))))))
      (finally
        (.close projects-client)))))

(defn- ws-create-service-account!
  "Create a service account for a workspace if it doesn't exist.
   Returns the service account email.

   The SA `description` field is built via [[ws-sa-description]] so CI cleanup
   can age-gate orphan SAs. See [[ws-sa-description->created-at]] for the parse
   side, and `metabase.test.data.bigquery-cloud-sdk` for the cleanup loop."
  [^IAMClient iam-client ^String project-id workspace]
  (let [sa-id        (ws-service-account-id workspace)
        sa-email     (format "%s@%s.iam.gserviceaccount.com" sa-id project-id)
        project-name (format "projects/%s" project-id)
        description  (ws-sa-description (java.time.Instant/now))]
    ;; Check if already exists first
    (if (ws-service-account-exists? iam-client project-id sa-email)
      (log/debugf "Service account already exists: %s" sa-email)
      (do
        (log/infof "Creating service account %s in project %s" sa-id project-id)
        (let [request (-> (CreateServiceAccountRequest/newBuilder)
                          (.setName project-name)
                          (.setAccountId sa-id)
                          (.setServiceAccount
                           (-> (ServiceAccount/newBuilder)
                               (.setDisplayName (format "Metabase Workspace %s" (:id workspace)))
                               (.setDescription description)
                               (.build)))
                          (.build))]
          (.createServiceAccount iam-client request)
          (log/infof "Created service account: %s" sa-email))))
    sa-email))

(defmethod driver/grant-workspace-read-access! :bigquery-cloud-sdk
  [_driver database workspace schemas]
  ;; `schemas` is a vector of BigQuery dataset names. The project comes from the
  ;; connection's effective details — a Metabase `Database` row binds to one
  ;; project. Grant dataViewer at the dataset level so future tables also gain
  ;; access — matches the schema-wide semantics of the SQL drivers.
  (let [ws-sa-email (-> workspace :database_details :impersonate-service-account)
        details     (driver.conn/effective-details database)
        client      (ws-database-details->client details)
        project-id  (bigquery.common/get-project-id details)]
    (log/infof "Granting dataset-level read access on %d dataset(s) %s to %s"
               (count schemas) (pr-str (vec schemas)) ws-sa-email)
    (doseq [dataset schemas
            :let [dataset-id (DatasetId/of project-id dataset)]]
      (log/infof "Granting dataViewer on %s/%s to %s" project-id dataset ws-sa-email)
      (ws-grant-dataset-acl! client dataset-id ws-sa-email "roles/bigquery.dataViewer")
      ;; Wait for the grant to propagate to the impersonated read path. Without
      ;; this, the next `can-connect-with-details?` running under the workspace
      ;; SA filters `listDatasets` by this dataset name, sees an empty list,
      ;; and throws `Looks like we cannot find any matching datasets`.
      (ws-wait-for-dataset-visible-via-impersonation! details ws-sa-email project-id dataset))))

(defmethod driver/destroy-workspace-isolation! :bigquery-cloud-sdk
  [_driver database workspace]
  (let [details      (driver.conn/effective-details database)
        client       (ws-database-details->client details)
        iam-client   (ws-database-details->iam-client details)
        project-id   (bigquery.common/get-project-id details)
        dataset-name (driver.u/workspace-isolation-namespace-name workspace)]
    (try
      (log/infof "Destroying BigQuery workspace isolation: dataset=%s" dataset-name)
      ;; Delete the dataset if it exists (deleteContents=true removes all tables)
      (drop-dataset! client project-id dataset-name)
      ;; Delete the service account (this also removes its IAM bindings)
      (ws-delete-service-account! iam-client project-id workspace)
      {:success true}
      (finally
        (.close iam-client)))))

(defmethod driver/init-workspace-isolation! :bigquery-cloud-sdk
  [_driver database workspace]
  (let [details       (driver.conn/effective-details database)
        client        (ws-database-details->client details)
        iam-client    (ws-database-details->iam-client details)
        project-id    (bigquery.common/get-project-id details)
        main-sa-email (.getClientEmail (ws-service-account-credentials details))
        dataset-name  (driver.u/workspace-isolation-namespace-name workspace)]
    (try
      ;; Create the workspace service account (or get existing)
      (let [ws-sa-email (ws-create-service-account! iam-client project-id workspace)
            dataset-id  (DatasetId/of project-id dataset-name)]
        (log/infof "Initializing BigQuery workspace isolation: dataset=%s, service-account=%s"
                   dataset-name ws-sa-email)
        ;; Wait until the new SA is visible to IAM read + policy endpoints
        ;; before we hand its email to any grant call -- without this the
        ;; immediate `setIamPolicy` calls below race with GCP IAM's
        ;; eventual-consistency propagation and throw
        ;; `INVALID_ARGUMENT: ... does not exist`.
        (ws-wait-for-service-account! iam-client project-id ws-sa-email)
        ;; Grant main SA permission to impersonate workspace SA
        (ws-grant-impersonation-permission! iam-client project-id main-sa-email ws-sa-email)
        ;; Grant the workspace SA permission to run BigQuery jobs (queries) at project level
        ;; Note: We intentionally do NOT grant project-level dataEditor as that would give
        ;; access to all datasets. The workspace SA only gets dataEditor on its isolated dataset.
        (ws-grant-project-role! details project-id ws-sa-email "roles/bigquery.jobUser")
        ;; Wait for IAM permissions to propagate by polling until impersonation works
        (ws-wait-for-impersonation-ready! details ws-sa-email)
        ;; Create the isolated dataset if it doesn't exist (using main SA credentials, not impersonated)
        (create-dataset! client project-id dataset-name
                         {:description (format "Metabase workspace isolation for workspace %s" (:id workspace))})
        ;; Grant the workspace service account dataEditor role on the isolated dataset
        ;; dataEditor allows: create/update/delete tables, insert/update/delete data
        (ws-grant-dataset-acl! client dataset-id ws-sa-email "roles/bigquery.dataEditor")
        ;; Return workspace connection details for impersonation
        ;; :user is used by grant-read-access-to-tables! to know which SA to grant access to
        ;; :impersonate-service-account is used by the connection swap to use impersonated credentials
        {:schema           dataset-name
         :database_details {:user                        ws-sa-email
                            :impersonate-service-account ws-sa-email}})
      (finally
        (.close iam-client)))))

(defmethod driver/check-isolation-permissions :bigquery-cloud-sdk
  [driver database test-table]
  ;; BigQuery uses GCP IAM APIs instead of SQL, so we can't use transaction rollback.
  ;; We run the actual init/grant/destroy operations and clean up immediately.
  (let [test-workspace {:id   perm-check-workspace-id
                        :name "_mb_perm_check_"}]
    (driver.conn/with-admin-connection
      (try
        (let [init-result (try
                            (driver/init-workspace-isolation! driver database test-workspace)
                            (catch Exception e
                              (throw (ex-info (tru "Failed to initialize workspace isolation: {0}" (ex-message e))
                                              {:step :init} e))))
              workspace-with-details (merge test-workspace init-result)]
          (when test-table
            (try
              ;; `grant-workspace-read-access!` takes a vector of schema-name strings.
              ;; Pass the test-table's dataset.
              (driver/grant-workspace-read-access! driver database workspace-with-details
                                                   [(:schema test-table)])
              (catch Exception e
                (throw (ex-info (tru "Failed to grant read access to dataset {0}: {1}"
                                     (quote-schema (:schema test-table)) (ex-message e))
                                {:step :grant :table test-table} e)))))
          (try
            (driver/destroy-workspace-isolation! driver database workspace-with-details)
            (catch Exception e
              (throw (ex-info (tru "Failed to destroy workspace isolation: {0}" (ex-message e))
                              {:step :destroy} e)))))
        nil
        (catch Exception e
          (ex-message e))
        (finally
          (try
            (driver/destroy-workspace-isolation! driver database test-workspace)
            (catch Exception _ nil)))))))
