(ns metabase.driver.bigquery-cloud-sdk.common
  "Common utility functions and utilities for the bigquery-cloud-sdk driver and related namespaces."
  (:require
   [metabase.driver.connection :as driver.conn]
   [metabase.util :as u]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu]
   ^{:clj-kondo/ignore [:discouraged-namespace]}
   [toucan2.core :as t2])
  (:import
   (com.google.auth.oauth2 GoogleCredentials ServiceAccountCredentials)
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
  "Returns a `GoogleCredentials` (not scoped) for the given `service-account-json` (String).
  Supports both traditional service account key JSON and Workload Identity Federation (WIF)
  credential configuration files (e.g. IdentityPoolCredentials for AWS IRSA / OIDC)."
  {:added "0.42.0"}
  ^GoogleCredentials [^String service-account-json :- :string]
  (GoogleCredentials/fromStream (ByteArrayInputStream. (.getBytes service-account-json))))

(def ^:private RequiredDetails
  [:map [:service-account-json :string]])

(mu/defn database-details->service-account-credential
  "Returns a `GoogleCredentials` (not scoped) for the given `db-details`, which is based upon the value
  associated to its `service-account-json` key (a String).
  Supports both traditional service account key JSON and Workload Identity Federation (WIF)
  credential configuration files."
  {:added "0.42.0"}
  ^GoogleCredentials [{:keys [^String service-account-json] :as db-details} :- RequiredDetails]
  {:pre [(map? db-details) (seq service-account-json)]}
  (service-account-json->service-account-credential service-account-json))

(mu/defn database-details->credential-project-id
  "Uses the given DB `details` credentials to determine the embedded project-id.
  Returns nil for non-ServiceAccountCredentials (e.g. WIF credentials), in which case
  the user-supplied project-id from database details will be used instead."
  [details :- RequiredDetails]
  (let [creds (database-details->service-account-credential details)]
    (when (instance? ServiceAccountCredentials creds)
      (.getProjectId ^ServiceAccountCredentials creds))))

(defn get-project-id
  "Project-id for `details`. Prefers the user-supplied `:project-id`, falls back to the
  one embedded in the service-account credentials."
  [{:keys [project-id] :as details}]
  (or project-id (database-details->credential-project-id details)))

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
  or nil for WIF credentials (where the project-id is supplied explicitly by the user)."
  {:added "0.42.0"}
  ^String [database :- [:map [:details RequiredDetails]]]
  ;; :project-id-from-credentials is a database-level cache managed by this driver. We store and read it from
  ;; `:details` regardless of connection type. This is valid so long as read and write service accounts share a
  ;; project ID. See also: [[metabase.driver.bigquery-cloud-sdk.query-processor/project-id-for-current-query]]
  (let [details       (driver.conn/default-details database)
        creds-proj-id (database-details->credential-project-id details)]
    (when (driver.conn/details-for-exact-type database :write-data)
      (let [write-proj-id (driver.conn/with-write-connection
                            (database-details->credential-project-id
                             (driver.conn/effective-details database)))]
        (when (and creds-proj-id write-proj-id (not= creds-proj-id write-proj-id))
          (log/warnf (str "Database %d: read and write service accounts belong to different GCP projects "
                          "(%s vs %s). The cached project-id-from-credentials uses the read SA's project; "
                          "query qualification may be incorrect for write connections.")
                     (u/the-id database) creds-proj-id write-proj-id))))
    (t2/update! :model/Database
                (u/the-id database)
                {:details (assoc details :project-id-from-credentials creds-proj-id)})
    creds-proj-id))
