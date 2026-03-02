(ns metabase.analytics.snowplow
  "Functions for sending Snowplow analytics events"
  (:require
   [clojure.string :as str]
   [medley.core :as m]
   [metabase.analytics.settings :as analytics.settings]
   [metabase.api.common :as api]
   [metabase.premium-features.core :as premium-features]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu]
   [metabase.version.core :as version]
   [toucan2.core :as t2])
  (:import
   (com.snowplowanalytics.snowplow.tracker Snowplow Subject Tracker)
   (com.snowplowanalytics.snowplow.tracker.configuration EmitterConfiguration NetworkConfiguration SubjectConfiguration TrackerConfiguration)
   (com.snowplowanalytics.snowplow.tracker.events SelfDescribing SelfDescribing$Builder2)
   (com.snowplowanalytics.snowplow.tracker.http ApacheHttpClientAdapter)
   (com.snowplowanalytics.snowplow.tracker.payload SelfDescribingJson)
   (org.apache.http.client.config CookieSpecs RequestConfig)
   (org.apache.http.impl.client HttpClients)
   (org.apache.http.impl.conn PoolingHttpClientConnectionManager)))

(set! *warn-on-reflection* true)

;; Adding or updating a Snowplow schema? Here are some things to keep in mind:
;; - Snowplow schemata are versioned and immutable, so if you need to make changes to a schema, you should create a new
;;   version of it. The version number should be updated in the `schema->version` map below.
;; - Schemas live inside the `/snowplow/iglu-client-embedded/schemas` directory.
;; - The new schema should be added to the Metabase repo via the normal pull request workflow before it is uploaded to
;;   SnowcatCloud in the last step. Make sure to sanity check your schema with SnowcatCloud in the
;;   #external-snowcat-cloud channel since there might be some back and forth on the format.

(def ^:private schema->version
  "The most recent version for each event schema. This should be updated whenever a new version of a schema is added
  to SnowcatCloud, at the same time that the data sent to the collector is updated."
  {:snowplow/account        "1-0-1"
   :snowplow/browse_data    "1-0-0"
   :snowplow/invite         "1-0-1"
   :snowplow/instance_stats "2-0-0"
   :snowplow/csvupload      "1-0-3"
   :snowplow/dashboard      "1-1-4"
   :snowplow/database       "1-0-1"
   :snowplow/instance       "1-1-2"
   :snowplow/metabot        "1-0-1"
   :snowplow/search         "1-0-1"
   :snowplow/model          "1-0-0"
   :snowplow/timeline       "1-0-0"
   :snowplow/task           "1-0-0"
   :snowplow/upsell         "1-0-0"
   :snowplow/action         "1-0-0"
   :snowplow/embed_share    "1-0-2"
   :snowplow/llm_usage      "1-0-0"
   :snowplow/token_usage    "1-0-4"
   :snowplow/serialization  "1-0-1"
   :snowplow/simple_event   "1-0-0"
   :snowplow/cleanup        "1-0-0"})

(def ^:private SnowplowSchema
  "Malli enum for valid Snowplow schemas"
  (into [:enum] (keys schema->version)))

(defn- tracker-config
  []
  (TrackerConfiguration. "sp" "metabase"))

(defn- network-config
  []
  (let [request-config (-> (RequestConfig/custom)
                           ;; Set cookie spec to `STANDARD` to avoid warnings about an invalid cookie
                           ;; header in request response (PR #24579)
                           (.setCookieSpec CookieSpecs/STANDARD)
                           (.build))
        client (-> (HttpClients/custom)
                   (.setConnectionManager (PoolingHttpClientConnectionManager.))
                   (.setDefaultRequestConfig request-config)
                   (.build))
        http-client-adapter (ApacheHttpClientAdapter. (analytics.settings/snowplow-url) client)]
    (NetworkConfiguration. http-client-adapter)))

(defn- emitter-config
  []
  (-> (EmitterConfiguration.)
      (.batchSize 1)))

(defonce ^:private tracker
  (Snowplow/createTracker
   ^TrackerConfiguration (tracker-config)
   ^NetworkConfiguration (network-config)
   ^EmitterConfiguration (emitter-config)))

(defn- subject
  "Create a Subject object for a given user ID, to be included in analytics events"
  [user-id]
  (Subject.
   (-> (SubjectConfiguration.)
       (.userId (str user-id))
       ;; Override with localhost IP to avoid logging actual user IP addresses
       (.ipAddress "127.0.0.1"))))

(defn- app-db-type
  "Returns the type of the Metabase application database as a string (e.g. PostgreSQL, MySQL)"
  []
  (t2/with-connection [^java.sql.Connection conn]
    (.. conn getMetaData getDatabaseProductName)))

(defn- app-db-version
  "Returns the version of the Metabase application database as a string"
  []
  (t2/with-connection [^java.sql.Connection conn]
    (let [metadata (.getMetaData conn)]
      (format "%d.%d" (.getDatabaseMajorVersion metadata) (.getDatabaseMinorVersion metadata)))))

(defn- context
  "Common context included in every analytics event"
  []
  (new SelfDescribingJson
       (str "iglu:com.metabase/instance/jsonschema/" (schema->version :snowplow/instance))
       {"id"                           (analytics.settings/analytics-uuid)
        "version"                      {"tag" (:tag (version/version))}
        "token_features"               (m/map-keys name (premium-features/token-features))
        "created_at"                   (analytics.settings/instance-creation)
        "application_database"         (app-db-type)
        "application_database_version" (app-db-version)}))

(defn- normalize-kw
  [kw]
  (-> kw name (str/replace #"-" "_")))

(defn- payload
  "A SelfDescribingJson object containing the provided event data, which can be included as the payload for an
  analytics event"
  [schema version data]
  (new SelfDescribingJson
       (format "iglu:com.metabase/%s/jsonschema/%s" (normalize-kw schema) version)
       ;; Make sure keywords in payload are converted to strings in snake-case
       (m/map-kv
        (fn [k v] [(normalize-kw k) (if (keyword? v) (normalize-kw v) v)])
        data)))

(defn- track-event-impl!
  "Wrapper function around the `.track` method on a Snowplow tracker. Can be redefined in tests to instead append
  event data to an in-memory store."
  [tracker event]
  (.track ^Tracker tracker ^SelfDescribing event))

(mu/defn track-event!
  "Send a single analytics event to the Snowplow collector, if tracking is enabled for this MB instance and a collector
  is available."
  ([schema :- SnowplowSchema data]
   (track-event! schema data api/*current-user-id*))

  ([schema :- SnowplowSchema data user-id]
   (when (analytics.settings/snowplow-enabled)
     (try
       (let [^SelfDescribing$Builder2 builder (-> (. SelfDescribing builder)
                                                  (.eventData (payload schema (schema->version schema) data))
                                                  (.customContext [(context)])
                                                  (cond-> user-id (.subject (subject user-id))))
             ^SelfDescribing event (.build builder)]
         (track-event-impl! tracker event))
       (catch Throwable e
         (log/errorf e "Error sending Snowplow analytics event for schema %s" schema))))))
