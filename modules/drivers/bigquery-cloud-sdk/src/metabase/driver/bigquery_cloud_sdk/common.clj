(ns metabase.driver.bigquery-cloud-sdk.common
  "Common utility functions and utilities for the bigquery-cloud-sdk driver and related namespaces."
  (:require
   [clojure.string :as str]
   [malli.core :as mc]
   [metabase.driver.bigquery-cloud-sdk.db :as bigquery.db]
   [metabase.driver.connection :as driver.conn]
   [metabase.util :as u]
   [metabase.util.i18n :refer [tru]]
   [metabase.util.json :as json]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu]
   [metabase.util.performance :as perf])
  (:import
   (com.google.auth.oauth2 GoogleCredentials ServiceAccountCredentials)
   (com.google.cloud ServiceOptions)
   (java.io ByteArrayInputStream IOException)
   (java.nio.charset StandardCharsets)))

(set! *warn-on-reflection* true)

#_{:clj-kondo/ignore [:metabase/discourage-dynamic-vars]}
(def ^:dynamic ^String *bigquery-timezone-id*
  "BigQuery stores all of it's timestamps in UTC. That timezone can be changed via a SQL function invocation in a
  native query, but that change in timezone is not conveyed through the BigQuery API. In most situations
  `*bigquery-timezone-id*` will just be UTC. If the user is always changing the timezone via native SQL function
  invocation, they can set their JVM TZ to the correct timezone, mark `use-jvm-timezone` to `true` and that will bind
  this dynamic var to the JVM TZ rather than UTC"
  "UTC")

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                                  Credentials                                                   |
;;; +----------------------------------------------------------------------------------------------------------------+

(defn credentials-source
  "How `details` authenticate to Google Cloud:

  * `:service-account` -- `:service-account-json` holds a service account key
  * `:credential-config` -- `:credential-config-json` holds a credential configuration file, such as the one
    `gcloud iam workload-identity-pools create-cred-config` writes for Workload Identity Federation
  * `:application-default` -- neither is set, so the Application Default Credentials of the Metabase server's
    environment are used (`GOOGLE_APPLICATION_CREDENTIALS`, the metadata server on GCE/GKE, a local gcloud login)

  A service account key takes precedence when both files are given."
  [{:keys [service-account-json credential-config-json]}]
  (cond
    (not (str/blank? service-account-json))   :service-account
    (not (str/blank? credential-config-json)) :credential-config
    :else                                     :application-default))

(mu/defn service-account-json->service-account-credential
  "Returns a `ServiceAccountCredentials` (not scoped) for the given `service-account-json` (String)."
  {:added "0.42.0"}
  ^ServiceAccountCredentials [^String service-account-json :- :string]
  (ServiceAccountCredentials/fromStream (ByteArrayInputStream. (.getBytes service-account-json))))

(def ^:private RequiredDetails
  [:map [:service-account-json :string] [::mc/default :metabase.lib.schema.common/database-details]])

(mu/defn database-details->service-account-credential
  "Returns a `ServiceAccountCredentials` (not scoped) for the given `db-details`, which is based upon the value
  associated to its `service-account-json` key (a String)."
  {:added "0.42.0"}
  ^ServiceAccountCredentials [{:keys [^String service-account-json] :as db-details} :- RequiredDetails]
  {:pre [(map? db-details) (seq service-account-json)]}
  (service-account-json->service-account-credential service-account-json))

(defn credential-config-json->credentials
  "Returns `GoogleCredentials` (not scoped) for a credential configuration file: the JSON that
  `GOOGLE_APPLICATION_CREDENTIALS` could point at, most usefully an `external_account` one for Workload Identity
  Federation. Throws when the file can't be read or names an executable credential source."
  ^GoogleCredentials [^String credential-config-json]
  (let [config (try
                 (json/decode credential-config-json)
                 (catch Exception e
                   (throw (ex-info (tru "The credential configuration file is not valid JSON.")
                                   {:type :invalid-credential-config}
                                   e))))]
    ;; Pluggable auth fetches the subject token by running a command on the Metabase server. The Google library only
    ;; allows that with `GOOGLE_EXTERNAL_ACCOUNT_ALLOW_EXECUTABLES=1` in the environment; refuse it here outright so
    ;; connection details can never opt in.
    (when (perf/some #(and (map? %) (contains? % "executable")) (tree-seq coll? seq config))
      (throw (ex-info (tru "Credential configuration files with an executable credential source are not supported.")
                      {:type :invalid-credential-config})))
    (try
      (GoogleCredentials/fromStream (ByteArrayInputStream. (.getBytes credential-config-json StandardCharsets/UTF_8)))
      (catch IOException e
        (throw (ex-info (tru "Could not read the credential configuration file: {0}" (ex-message e))
                        {:type :invalid-credential-config}
                        e))))))

(defn- application-default-credentials
  ^GoogleCredentials []
  (try
    (GoogleCredentials/getApplicationDefault)
    (catch IOException e
      (throw (ex-info (tru (str "Application Default Credentials were not found on the Metabase server. Upload a "
                                "service account key or a credential configuration file, or make credentials "
                                "available to the server, for example through the GOOGLE_APPLICATION_CREDENTIALS "
                                "environment variable."))
                      {:type :application-default-credentials-not-found}
                      e)))))

(mu/defn database-details->credentials
  "Returns `GoogleCredentials` (not scoped) for `details`, from whichever source [[credentials-source]] names."
  ^GoogleCredentials [{:keys [service-account-json credential-config-json] :as details}
                      :- :metabase.lib.schema.common/database-details]
  (case (credentials-source details)
    :service-account     (service-account-json->service-account-credential service-account-json)
    :credential-config   (credential-config-json->credentials credential-config-json)
    :application-default (application-default-credentials)))

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                                   Project IDs                                                  |
;;; +----------------------------------------------------------------------------------------------------------------+

(mu/defn database-details->credential-project-id :- [:maybe :string]
  "The Google Cloud project the credentials in `details` belong to, or nil when they don't name one.

  A service account key carries its project. A credential configuration file and the server's environment don't, so
  for those this is the server's default project (`GOOGLE_CLOUD_PROJECT`, the gcloud configuration, or the metadata
  server on GCE/GKE), if it has one."
  [details :- :metabase.lib.schema.common/database-details]
  (if (= :service-account (credentials-source details))
    (.getProjectId (database-details->service-account-credential details))
    (ServiceOptions/getDefaultProjectId)))

(defn- missing-project-id-exception []
  (ex-info (tru (str "Could not determine the Google Cloud project. Set the Data project ID (and the Billing project "
                     "ID, if query jobs should run in a different project) in the connection details."))
           {:type :missing-project-id}))

(defn get-project-id
  "Data project for `details`, the one its datasets live in: `:project-id`, then `:billing-project-id`, then the
  credentials' project ([[database-details->credential-project-id]]). Throws when none of them is set.

  `:billing-project-id` is included because a service account granted `bigquery.jobs.create` on a project typically
  also has data access there — so setting only the billing field implies the data lives there too. Users who want
  billing ≠ data set both keys explicitly."
  [{:keys [project-id billing-project-id] :as details}]
  (or (perf/not-empty project-id)
      (perf/not-empty billing-project-id)
      (database-details->credential-project-id details)
      (throw (missing-project-id-exception))))

(defn get-billing-project-id
  "Project query jobs run in and are billed to, which is also the project unqualified `dataset.table` names in a
  query resolve against: `:billing-project-id`, then the credentials' project
  ([[database-details->credential-project-id]]), then the data project. Throws when none of them is set."
  [{:keys [billing-project-id project-id] :as details}]
  (or (perf/not-empty billing-project-id)
      (database-details->credential-project-id details)
      (perf/not-empty project-id)
      (throw (missing-project-id-exception))))

(defmulti base-type->bigquery-type
  "Return the BigQuery SQL type name for a Metabase `:type/*` base-type as a plain string. Throws
  `IllegalArgumentException` when the type has no BigQuery analogue."
  {:arglists '([base-type])
   :changelog-test/ignore true}
  identity)

;; We can't recover the parameterized types for ARRAY / DICTIONARY — flatten to JSON.
(defmethod base-type->bigquery-type :type/Array          [_] "JSON")
(defmethod base-type->bigquery-type :type/Dictionary     [_] "JSON")

(defmethod base-type->bigquery-type :type/Boolean        [_] "BOOL")
(defmethod base-type->bigquery-type :type/Integer        [_] "INT")
(defmethod base-type->bigquery-type :type/Number         [_] "INT")
(defmethod base-type->bigquery-type :type/Float          [_] "FLOAT64")
(defmethod base-type->bigquery-type :type/Decimal        [_] "BIGDECIMAL")
(defmethod base-type->bigquery-type :type/Text           [_] "STRING")
(defmethod base-type->bigquery-type :type/TextLike       [_] "STRING")
(defmethod base-type->bigquery-type :type/Date           [_] "DATE")
(defmethod base-type->bigquery-type :type/DateTime       [_] "DATETIME")
(defmethod base-type->bigquery-type :type/DateTimeWithTZ [_] "TIMESTAMP")
(defmethod base-type->bigquery-type :type/Time           [_] "TIME")
(defmethod base-type->bigquery-type :type/JSON           [_] "JSON")
(defmethod base-type->bigquery-type :type/SerializedJSON [_] "JSON")

(mu/defn populate-project-id-from-credentials!
  "Update the given `database` details blob to include the project its query jobs run in as a separate entry (under a
  `project-id-from-credentials` key). This is [[get-billing-project-id]], which with a service account key and no
  billing project override is simply the project encoded within the `service-account-json` payload; either way it is
  an inferred/calculated key (not something the user will ever set directly).

  This would require a lot of extra computation/invocation of the Google SDK methods to recalculate this on every query
  (since it will involve parsing this JSON repeatedly), and even using something like `qp.store/cached` functionality
  would still require recomputing it on every query execution.  Because this will only ever change if/when the DB
  details change (i.e. the service account), just calculate it once per change (when the DB is updated, or upon first
  query for a new Database), and store it back to the app DB.

  Returns the calculated project-id String."
  {:added "0.42.0"}
  ^String [database :- :metabase.warehouses.schema/database-or-metadata]
  ;; :project-id-from-credentials is a database-level cache managed by this driver. We store and read it from
  ;; `:details` regardless of connection type. This is valid so long as read and write connections run their jobs in
  ;; the same project. See also: [[metabase.driver.bigquery-cloud-sdk.query-processor/project-id-for-current-query]]
  (let [details       (driver.conn/default-details database)
        creds-proj-id (get-billing-project-id details)]
    (when (driver.conn/details-for-exact-type database :write-data)
      (let [write-proj-id (driver.conn/with-write-connection
                            (get-billing-project-id (driver.conn/effective-details database)))]
        (when (not= creds-proj-id write-proj-id)
          (log/warnf (str "Database %d: read and write connections run query jobs in different GCP projects "
                          "(%s vs %s). The cached project-id-from-credentials uses the read connection's project; "
                          "query qualification may be incorrect for write connections.")
                     (u/the-id database) creds-proj-id write-proj-id))))
    (bigquery.db/update-database-details! (u/the-id database) (assoc details :project-id-from-credentials creds-proj-id))
    creds-proj-id))
