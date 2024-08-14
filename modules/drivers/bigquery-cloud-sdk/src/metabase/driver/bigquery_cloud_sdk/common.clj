(ns metabase.driver.bigquery-cloud-sdk.common
  "Common utility functions and utilities for the bigquery-cloud-sdk driver and related namespaces."
  (:require
   [metabase.models :refer [Database]]
   [metabase.util :as u]
   [metabase.util.malli :as mu]
   #_{:clj-kondo/ignore [:discouraged-namespace]}
   [toucan2.core :as t2])
  (:import
   (com.google.auth.oauth2 ServiceAccountCredentials)
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

(def ^:private RequiredDetails
  [:map [:service-account-json :string]])

(mu/defn database-details->service-account-credential
  "Returns a `ServiceAccountCredentials` (not scoped) for the given `db-details`, which is based upon the value
  associated to its `service-account-json` key (a String)."
  {:added "0.42.0"}
  ^ServiceAccountCredentials [{:keys [^String service-account-json] :as db-details} :- RequiredDetails]
  {:pre [(map? db-details) (seq service-account-json)]}
  (service-account-json->service-account-credential service-account-json))

(mu/defn database-details->credential-project-id
  "Uses the given DB `details` credentials to determine the embedded project-id.  This is basically an
  inferred/calculated key (not something the user will ever\n  set directly), since it's simply encoded within the
  `service-account-json` payload."
  [details :- RequiredDetails]
  (-> (database-details->service-account-credential details)
      .getProjectId))

(mu/defn populate-project-id-from-credentials!
  "Update the given `database` details blob to include the credentials' project-id as a separate entry (under a
  `project-id-from-credentials` key). This is basically an inferred/calculated key (not something the user will ever
  set directly), since it's simply encoded within the `service-account-json` payload.

  This would require a lot of extra computation/invocation of the Google SDK methods to recalculate this on every query
  (since it will involve parsing this JSON repeatedly), and even using something like `qp.store/cached` functionality
  would still require recomputing it on every query execution.  Because this will only ever change if/when the DB
  details change (i.e. the service account), just calculate it once per change (when the DB is updated, or upon first
  query for a new Database), and store it back to the app DB.

  Returns the calculated project-id (see [[database-details->credential-project-id]]) String from the credentials."
  {:added "0.42.0"}
  ^String [{:keys [details] :as database} :- [:map [:details RequiredDetails]]]
  (let [creds-proj-id (database-details->credential-project-id details)]
    (t2/update! Database
                (u/the-id database)
                {:details (assoc details :project-id-from-credentials creds-proj-id)})
    creds-proj-id))
