(ns metabase.analytics.snowplow
  "Functions for sending Snowplow analytics events"
  (:require
   [clojure.string :as str]
   [java-time.api :as t]
   [medley.core :as m]
   [metabase.config :as config]
   [metabase.models.setting :as setting :refer [defsetting Setting]]
   [metabase.models.user :refer [User]]
   [metabase.public-settings :as public-settings]
   [metabase.util.date-2 :as u.date]
   [metabase.util.i18n :refer [deferred-tru]]
   [metabase.util.log :as log]
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

;; Adding or updating a Snowplow schema? Make sure that the two maps below are updated accordingly.

(def ^:private schema->version
  "The most recent version for each event schema. This should be updated whenever a new version of a schema is added
  to SnowcatCloud, at the same time that the data sent to the collector is updated."
  {::account       "1-0-1"
   ::browse_data   "1-0-0"
   ::invite        "1-0-1"
   ::csvupload     "1-0-3"
   ::dashboard     "1-1-4"
   ::database      "1-0-1"
   ::instance      "1-1-2"
   ::metabot       "1-0-1"
   ::search        "1-0-1"
   ::model         "1-0-0"
   ::timeline      "1-0-0"
   ::task          "1-0-0"
   ::upsell        "1-0-0"
   ::action        "1-0-0"
   ::embed_share   "1-0-0"
   ::llm_usage     "1-0-0"
   ::serialization "1-0-1"})

(def ^:private event->schema
  "The schema to use for each analytics event."
  {::new-instance-created           ::account
   ::new-user-created               ::account
   ::browse_data_model_clicked      ::browse_data
   ::browse_data_table_clicked      ::browse_data
   ::invite-sent                    ::invite
   ::index-model-entities-enabled   ::model
   ::dashboard-created              ::dashboard
   ::question-added-to-dashboard    ::dashboard
   ::dashboard-tab-created          ::dashboard
   ::dashboard-tab-deleted          ::dashboard
   ::database-connection-successful ::database
   ::database-connection-failed     ::database
   ::new-event-created              ::timeline
   ::new-task-history               ::task
   ::upsell_viewed                  ::upsell
   ::upsell_clicked                 ::upsell
   ::new-search-query               ::search
   ::search-results-filtered        ::search
   ::action-created                 ::action
   ::action-updated                 ::action
   ::action-deleted                 ::action
   ::action-executed                ::action
   ::csv-upload-successful          ::csvupload
   ::csv-upload-failed              ::csvupload
   ::csv-append-successful          ::csvupload
   ::csv-append-failed              ::csvupload
   ::metabot-feedback-received      ::metabot
   ::embedding-enabled              ::embed_share
   ::embedding-disabled             ::embed_share
   ::llm-usage                      ::llm_usage
   ::serialization                  ::serialization})

(defsetting analytics-uuid
  (deferred-tru
    (str "Unique identifier to be used in Snowplow analytics, to identify this instance of Metabase. "
         "This is a public setting since some analytics events are sent prior to initial setup."))
  :visibility :public
  :base       setting/uuid-nonce-base
  :doc        false)

(defsetting snowplow-available
  (deferred-tru
   (str "Boolean indicating whether a Snowplow collector is available to receive analytics events. "
        "Should be set via environment variable in Cypress tests or during local development."))
  :type       :boolean
  :visibility :public
  :default    config/is-prod?
  :doc        false
  :audit      :never)

(defsetting snowplow-enabled
  (deferred-tru
   (str "Boolean indicating whether analytics events are being sent to Snowplow. "
        "True if anonymous tracking is enabled for this instance, and a Snowplow collector is available."))
  :type       :boolean
  :setter     :none
  :getter     (fn [] (and (snowplow-available)
                          (public-settings/anon-tracking-enabled)))
  :visibility :public
  :doc        false)

(defsetting snowplow-url
  (deferred-tru "The URL of the Snowplow collector to send analytics events to.")
  :default    (if config/is-prod?
                "https://sp.metabase.com"
                ;; See the iglu-schema-registry repo for instructions on how to run Snowplow Micro locally for development
                "http://localhost:9090")
  :visibility :public
  :audit      :never
  :doc        false)

(defn- first-user-creation
  "Returns the earliest user creation timestamp in the database"
  []
  (:min (t2/select-one [User [:%min.date_joined :min]])))

;; We need to declare `track-event!` up front so that we can use it in the custom getter of `instance-creation`.
;; We can't move `instance-creation` below `track-event!` because it has to be defined before `context`, which is called
;; by `track-event!`.
(declare track-event!)

(defsetting instance-creation
  (deferred-tru "The approximate timestamp at which this instance of Metabase was created, for inclusion in analytics.")
  :visibility :public
  :setter     :none
  :getter     (fn []
                (when-not (t2/exists? Setting :key "instance-creation")
                  ;; For instances that were started before this setting was added (in 0.41.3), use the creation
                  ;; timestamp of the first user. For all new instances, use the timestamp at which this setting
                  ;; is first read.
                  (let [value (or (first-user-creation) (t/offset-date-time))]
                    (setting/set-value-of-type! :timestamp :instance-creation value)
                    (track-event! ::new-instance-created)))
                (u.date/format-rfc3339 (setting/get-value-of-type :timestamp :instance-creation)))
  :doc false)

(def ^:private tracker-config
  "Returns instance of a Snowplow tracker config"
  (let [tracker-config* (delay (TrackerConfiguration. "sp" "metabase"))]
    (fn [] @tracker-config*)))

(def ^:private network-config
  "Returns instance of a Snowplow network config"
  (let [network-config* (delay
                         (let [request-config (-> (RequestConfig/custom)
                                                  ;; Set cookie spec to `STANDARD` to avoid warnings about an invalid cookie
                                                  ;; header in request response (PR #24579)
                                                  (.setCookieSpec CookieSpecs/STANDARD)
                                                  (.build))
                               client (-> (HttpClients/custom)
                                          (.setConnectionManager (PoolingHttpClientConnectionManager.))
                                          (.setDefaultRequestConfig request-config)
                                          (.build))
                               http-client-adapter (ApacheHttpClientAdapter. (snowplow-url) client)]
                           (NetworkConfiguration. http-client-adapter)))]
    (fn [] @network-config*)))

(def ^:private emitter-config
  "Returns an instance of a Snowplow emitter config"
  (let [emitter-config* (delay (-> (EmitterConfiguration.)
                                   (.batchSize 1)))]
     (fn [] @emitter-config*)))

(def ^:private tracker
  "Returns instance of a Snowplow tracker"
  (let [tracker* (delay
                  (Snowplow/createTracker
                   ^TrackerConfiguration (tracker-config)
                   ^NetworkConfiguration (network-config)
                   ^EmitterConfiguration (emitter-config)))]
    (fn [] @tracker*)))

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
       (str "iglu:com.metabase/instance/jsonschema/" (schema->version ::instance))
       {"id"                           (analytics-uuid)
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
  [schema version event-kw data]
  (new SelfDescribingJson
       (format "iglu:com.metabase/%s/jsonschema/%s" (normalize-kw schema) version)
       ;; Make sure keywords in payload are converted to strings in snake-case
       (m/map-kv
        (fn [k v] [(normalize-kw k) (if (keyword? v) (normalize-kw v) v)])
        (assoc data :event event-kw))))

(defn- track-event-impl!
  "Wrapper function around the `.track` method on a Snowplow tracker. Can be redefined in tests to instead append
  event data to an in-memory store."
  [tracker event]
  (.track ^Tracker tracker ^SelfDescribing event))

(defn track-event!
  "Send a single analytics event to the Snowplow collector, if tracking is enabled for this MB instance and a collector
  is available."
  [event-kw & [user-id data]]
  (when (snowplow-enabled)
    (try
      (let [schema (event->schema event-kw)
            ^SelfDescribing$Builder2 builder (-> (. SelfDescribing builder)
                                                 (.eventData (payload schema (schema->version schema) event-kw data))
                                                 (.customContext [(context)])
                                                 (cond-> user-id (.subject (subject user-id))))
            ^SelfDescribing event (.build builder)]
        (track-event-impl! (tracker) event))
      (catch Throwable e
        (log/errorf e "Error sending Snowplow analytics event %s" event-kw)))))
