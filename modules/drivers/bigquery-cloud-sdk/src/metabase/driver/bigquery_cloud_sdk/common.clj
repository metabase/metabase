(ns metabase.driver.bigquery-cloud-sdk.common
  "Common utility functions and utilities for the bigquery-cloud-sdk driver and related namespaces."
  (:require
   [metabase.util :as u]
   [metabase.util.i18n :refer [tru]]
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
  "Returns a `ServiceAccountCredentials` (not scoped) for the given `service-account-json` (String)."
  {:added "0.42.0"}
  ^ServiceAccountCredentials [^String service-account-json :- :string]
  (ServiceAccountCredentials/fromStream (ByteArrayInputStream. (.getBytes service-account-json "UTF-8")))))

(def ^:private RequiredDetails
  [:map [:service-account-json :string]])

(mu/defn database-details->service-account-credential
  "Returns a `ServiceAccountCredentials` (not scoped) for the given `db-details`, which is based upon the value
  associated to its `service-account-json` key (a String)."
  {:added "0.42.0"}
  ^ServiceAccountCredentials [{:keys [^String service-account-json] :as db-details} :- RequiredDetails]
  {:pre [(map? db-details) (seq service-account-json)]}
  (service-account-json->service-account-credential service-account-json))

(defn use-application-default-credentials?
  "Returns true if Application Default Credentials (ADC) should be used instead of explicit credentials.
   ADC is used when neither `service-account-json` nor `credential-config-json` is provided."
  [{:keys [service-account-json credential-config-json]}]
  (and (empty? service-account-json)
       (empty? credential-config-json)))

(defn- credential-config-json->credentials
  "Returns credentials from a credential configuration JSON string.
   This supports Workload Identity Federation and external account configurations."
  ^GoogleCredentials [^String credential-config-json]
  (try
    (GoogleCredentials/fromStream (ByteArrayInputStream. (.getBytes credential-config-json "UTF-8")))
    (catch Exception e
      (throw (ex-info (tru "Invalid credential configuration JSON. Please check the format matches Google Cloud external account configuration.")
                      {:type :invalid-credential-config}
                      e)))))

(defn get-credentials
  "Returns credentials for BigQuery authentication.
   Priority:
   1. If `service-account-json` is provided, use `ServiceAccountCredentials`
   2. If `credential-config-json` is provided, use it (supports Workload Identity Federation)
   3. Otherwise, use Application Default Credentials (ADC) from GOOGLE_APPLICATION_CREDENTIALS
      environment variable, which supports:
      - GKE Workload Identity
      - Workload Identity Federation
      - GCE metadata service
      - Local development credentials (gcloud auth application-default login)"
  ^GoogleCredentials [{:keys [service-account-json credential-config-json] :as db-details}]
  (log/debugf "get-credentials called. service-account-json? %s, credential-config-json? %s"
              (boolean (seq service-account-json))
              (boolean (seq credential-config-json)))
  (cond
    (seq service-account-json)
    (service-account-json->service-account-credential service-account-json)

    (seq credential-config-json)
    (credential-config-json->credentials credential-config-json)

    :else
    (try
      (GoogleCredentials/getApplicationDefault)
      (catch Exception e
        (throw (ex-info (tru "Could not load Application Default Credentials. Please set GOOGLE_APPLICATION_CREDENTIALS environment variable, or configure GKE Workload Identity, or provide service account JSON.")
                        {:type :adc-not-configured}
                        e))))))

(mu/defn database-details->credential-project-id
  "Uses the given DB `details` credentials to determine the embedded project-id.  This is basically an
  inferred/calculated key (not something the user will ever set directly), since it's simply encoded within the
  `service-account-json` payload.

  When using Application Default Credentials (ADC) or Workload Identity Federation (credential-config-json),
  returns nil since these credentials do not have an embedded project ID. In these cases, the `project-id`
  field must be explicitly provided."
  [details :- :map]
  (when (seq (:service-account-json details))
    (-> (database-details->service-account-credential details)
        .getProjectId)))

(mu/defn populate-project-id-from-credentials!
  "Update the given `database` details blob to include the credentials' project-id as a separate entry (under a
  `project-id-from-credentials` key). This is basically an inferred/calculated key (not something the user will ever
  set directly), since it's simply encoded within the `service-account-json` payload.

  This would require a lot of extra computation/invocation of the Google SDK methods to recalculate this on every query
  (since it will involve parsing this JSON repeatedly), and even using something like `qp.store/cached` functionality
  would still require recomputing it on every query execution.  Because this will only ever change if/when the DB
  details change (i.e. the service account), just calculate it once per change (when the DB is updated, or upon first
  query for a new Database), and store it back to the app DB.

  When using Application Default Credentials (ADC), this function is a no-op and returns nil, since ADC credentials
  may not have an embedded project ID. In this case, the `project-id` field must be explicitly provided.

  Returns the calculated project-id (see [[database-details->credential-project-id]]) String from the credentials,
  or nil when using ADC."
  {:added "0.42.0"}
  [{:keys [details] :as database} :- [:map [:details :map]]]
  (when-let [creds-proj-id (database-details->credential-project-id details)]
    (t2/update! :model/Database
                (u/the-id database)
                {:details (assoc details :project-id-from-credentials creds-proj-id)})
    creds-proj-id))
