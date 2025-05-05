(ns metabase.analytics.snowplow
  "Functions for sending Snowplow analytics events"
  (:require
   [clojure.string :as str]
   [java-time.api :as t]
   [medley.core :as m]
   [metabase.analytics.settings :as analytics.settings]
   [metabase.api.common :as api]
   [metabase.settings.core :as setting :refer [defsetting]]
   [metabase.settings.deprecated-grab-bag :as public-settings]
   [metabase.util.date-2 :as u.date]
   [metabase.util.i18n :refer [deferred-tru]]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu]
   [toucan2.core :as t2])
  (:import
   (com.snowplowanalytics.snowplow.tracker Snowplow Subject Tracker)
   (com.snowplowanalytics.snowplow.tracker.configuration
    EmitterConfiguration
    NetworkConfiguration
    SubjectConfiguration
    TrackerConfiguration)
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
   :snowplow/embed_share    "1-0-0"
   :snowplow/llm_usage      "1-0-0"
   :snowplow/serialization  "1-0-1"
   :snowplow/simple_event   "1-0-0"
   :snowplow/cleanup        "1-0-0"})

(def ^:private SnowplowSchema
  "Malli enum for valid Snowplow schemas"
  (into [:enum] (keys schema->version)))

;; We need to declare `track-event!` up front so that we can use it in the custom getter of `instance-creation`.
;; We can't move `instance-creation` below `track-event!` because it has to be defined before `context`, which is called
;; by `track-event!`.
(declare track-event!)

(defn- first-user-creation
  "Returns the earliest user creation timestamp in the database"
  []
  (:min (t2/select-one [:model/User [:%min.date_joined :min]])))

;; [[instance-creation]] should live in analytics.settings, but it would cause a circular dep with [[track-event!]]
(defsetting instance-creation
  (deferred-tru "The approximate timestamp at which this instance of Metabase was created, for inclusion in analytics.")
  :visibility :public
  :setter     :none
  :getter     (fn []
                (when-not (t2/exists? :model/Setting :key "instance-creation")
                  ;; For instances that were started before this setting was added (in 0.41.3), use the creation
                  ;; timestamp of the first user. For all new instances, use the timestamp at which this setting
                  ;; is first read.
                  (let [value (or (first-user-creation) (t/offset-date-time))]
                    (setting/set-value-of-type! :timestamp :instance-creation value)
                    (track-event! :snowplow/account {:event :new_instance_created} nil)))
                (u.date/format-rfc3339 (setting/get-value-of-type :timestamp :instance-creation)))
  :doc false)

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
        "version"                      {"tag" (:tag (public-settings/version))}
        "token_features"               (m/map-keys name (public-settings/token-features))
        "created_at"                   (instance-creation)
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
