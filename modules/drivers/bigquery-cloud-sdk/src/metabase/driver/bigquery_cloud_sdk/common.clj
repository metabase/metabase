(ns metabase.driver.bigquery-cloud-sdk.common
  "Common utility functions and utilities for the bigquery-cloud-sdk driver and related namespaces."
  (:require
   [clojure.string :as str]
   [metabase.driver.bigquery-cloud-sdk.db :as bigquery.db]
   [metabase.driver.connection :as driver.conn]
   [metabase.util :as u]
   [metabase.util.i18n :refer [tru]]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu])
  (:import
   (com.google.auth.oauth2 GoogleCredentials ServiceAccountCredentials)
   (com.google.cloud ServiceOptions)
   (java.io ByteArrayInputStream)))

(set! *warn-on-reflection* true)

(def ^:dynamic ^String *bigquery-timezone-id*
  "BigQuery stores all of it's timestamps in UTC. That timezone can be changed via a SQL function invocation in a
  native query, but that change in timezone is not conveyed through the BigQuery API. In most situations
  `*bigquery-timezone-id*` will just be UTC. If the user is always changing the timezone via native SQL function
  invocation, they can set their JVM TZ to the correct timezone, mark `use-jvm-timezone` to `true` and that will bind
  this dynamic var to the JVM TZ rather than UTC"
  "UTC")

(mu/defn service-account-json->service-account-credential
  "Returns a `ServiceAccountCredentials` (not scoped) for the given `service-account-json` (String)."
  {:added "0.42.0"}
  ^ServiceAccountCredentials [^String service-account-json :- :string]
  (ServiceAccountCredentials/fromStream (ByteArrayInputStream. (.getBytes service-account-json))))

(def ^:private ConnectionDetails
  [:map [:service-account-json {:optional true} [:maybe :string]]])

(defn use-application-default-credentials?
  "Whether `db-details` name no service account JSON, meaning credentials come from the environment Metabase runs in
  (Application Default Credentials, e.g. the service account attached to a Compute Engine instance)."
  [{:keys [service-account-json] :as _db-details}]
  (str/blank? service-account-json))

(defn application-default-credential
  "Returns the Application Default Credentials (not scoped) for the environment Metabase is running in. Throws an
  `IOException` when the environment provides none. A separate function so tests can redef it."
  ^GoogleCredentials []
  (GoogleCredentials/getApplicationDefault))

(defn application-default-project-id
  "Returns the project-id the Application Default Credentials environment implies (`GOOGLE_CLOUD_PROJECT`, the gcloud
  SDK config, or the Compute Engine metadata server), or nil when none can be determined. A separate function so
  tests can redef it."
  ^String []
  (ServiceOptions/getDefaultProjectId))

(mu/defn database-details->credential
  "Returns a `GoogleCredentials` (not scoped) for the given `db-details`: the uploaded service account JSON when one
  is present, otherwise Application Default Credentials."
  ^GoogleCredentials [{:keys [^String service-account-json] :as db-details} :- ConnectionDetails]
  (if (use-application-default-credentials? db-details)
    (application-default-credential)
    (service-account-json->service-account-credential service-account-json)))

(mu/defn database-details->credential-project-id
  "Uses the given DB `details` credentials to determine the embedded project-id.  This is basically an
  inferred/calculated key (not something the user will ever\n  set directly), since it's simply encoded within the
  `service-account-json` payload (or, for Application Default Credentials, implied by the environment). Can be nil
  when Application Default Credentials imply no project."
  [details :- ConnectionDetails]
  (let [credential (database-details->credential details)]
    (or (when (instance? ServiceAccountCredentials credential)
          (.getProjectId ^ServiceAccountCredentials credential))
        ;; only fall back to the ambient project for ADC; an uploaded service account's JSON is the sole authority
        ;; on its own project
        (when (use-application-default-credentials? details)
          (application-default-project-id)))))

(defn get-project-id
  "Data project-id for `details`. Fallback: `:project-id`, then `:billing-project-id`, then the
  credentials' project. `:billing-project-id` is included because a service account granted
  `bigquery.jobs.create` on a project typically also has data access there — so setting only the
  billing field implies the data lives there too. Users who want billing ≠ data set both keys
  explicitly. Throws when no project-id can be determined."
  [{:keys [project-id billing-project-id] :as details}]
  (or project-id
      billing-project-id
      (database-details->credential-project-id details)
      (throw (ex-info (tru "Could not determine a Google Cloud project ID from the connection''s credentials. Please specify a Project ID in the connection settings.")
                      {:use-application-default-credentials? (use-application-default-credentials? details)}))))

(mu/defn populate-project-id-from-credentials!
  "Update the given `database` details blob to include the credentials' project-id as a separate entry (under a
  `project-id-from-credentials` key). This is basically an inferred/calculated key (not something the user will ever
  set directly), since it's simply encoded within the `service-account-json` payload.

  This would require a lot of extra computation/invocation of the Google SDK methods to recalculate this on every query
  (since it will involve parsing this JSON repeatedly), and even using something like `qp.store/cached` functionality
  would still require recomputing it on every query execution.  Because this will only ever change if/when the DB
  details change (i.e. the service account), just calculate it once per change (when the DB is updated, or upon first
  query for a new Database), and store it back to the app DB.

  Returns the calculated project-id (see [[database-details->credential-project-id]]) String from the credentials,
  or nil when the credentials imply no project (possible with Application Default Credentials)."
  {:added "0.42.0"}
  ^String [database :- [:map [:details ConnectionDetails]]]
  ;; :project-id-from-credentials is a database-level cache managed by this driver. We store and read it from
  ;; `:details` regardless of connection type. This is valid so long as read and write service accounts share a
  ;; project ID. See also: [[metabase.driver.bigquery-cloud-sdk.query-processor/project-id-for-current-query]]
  (let [details       (driver.conn/default-details database)
        creds-proj-id (database-details->credential-project-id details)]
    (when (driver.conn/details-for-exact-type database :write-data)
      (let [write-proj-id (driver.conn/with-write-connection
                            (database-details->credential-project-id
                             (driver.conn/effective-details database)))]
        (when (not= creds-proj-id write-proj-id)
          (log/warnf (str "Database %d: read and write service accounts belong to different GCP projects "
                          "(%s vs %s). The cached project-id-from-credentials uses the read SA's project; "
                          "query qualification may be incorrect for write connections.")
                     (u/the-id database) creds-proj-id write-proj-id))))
    ;; a nil project-id is not worth caching -- storing it would not stop the QP from recomputing it every query
    (when creds-proj-id
      (bigquery.db/update-database-details! (u/the-id database) (assoc details :project-id-from-credentials creds-proj-id)))
    creds-proj-id))
