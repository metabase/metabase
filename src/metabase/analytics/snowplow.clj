(ns metabase.analytics.snowplow
  "Functions for sending Snowplow analytics events"
  (:require [clojure.tools.logging :as log]
            [java-time :as t]
            [medley.core :as m]
            [metabase.config :as config]
            [metabase.models.setting :as setting :refer [defsetting Setting]]
            [metabase.models.user :refer [User]]
            [metabase.public-settings :as public-settings]
            [metabase.util :as u]
            [metabase.util.date-2 :as u.date]
            [metabase.util.i18n :as i18n :refer [deferred-tru trs]]
            [toucan.db :as db])
  (:import [com.snowplowanalytics.snowplow.tracker Subject$SubjectBuilder Tracker Tracker$TrackerBuilder]
           [com.snowplowanalytics.snowplow.tracker.emitter BatchEmitter BatchEmitter$Builder Emitter]
           [com.snowplowanalytics.snowplow.tracker.events Unstructured Unstructured$Builder]
           [com.snowplowanalytics.snowplow.tracker.http ApacheHttpClientAdapter ApacheHttpClientAdapter$Builder]
           com.snowplowanalytics.snowplow.tracker.payload.SelfDescribingJson
           [org.apache.http.client.config CookieSpecs RequestConfig]
           org.apache.http.impl.client.HttpClients
           org.apache.http.impl.conn.PoolingHttpClientConnectionManager))

(defsetting analytics-uuid
  (deferred-tru
    (str "Unique identifier to be used in Snowplow analytics, to identify this instance of Metabase. "
         "This is a public setting since some analytics events are sent prior to initial setup."))
  :visibility :public
  :setter     :none
  :type       ::public-settings/uuid-nonce)

(defsetting snowplow-available
  (deferred-tru
    (str "Boolean indicating whether a Snowplow collector is available to receive analytics events. "
         "Should be set via environment variable in Cypress tests or during local development."))
  :type       :boolean
  :visibility :public
  :default    config/is-prod?)

(defsetting snowplow-enabled
  (deferred-tru
    (str "Boolean indicating whether analytics events are being sent to Snowplow. "
         "True if anonymous tracking is enabled for this instance, and a Snowplow collector is available."))
  :type   :boolean
  :setter :none
  :getter (fn [] (and (snowplow-available)
                      (public-settings/anon-tracking-enabled)))
  :visibility :public)

(defsetting snowplow-url
  (deferred-tru "The URL of the Snowplow collector to send analytics events to.")
  :default    (if config/is-prod?
                "https://sp.metabase.com"
                ;; See the iglu-schema-registry repo for instructions on how to run Snowplow Micro locally for development
                "http://localhost:9090")
  :visibility :public)

(defn- first-user-creation
  "Returns the earliest user creation timestamp in the database"
  []
  (:min (db/select-one [User [:%min.date_joined :min]])))

;; We need to declare `track-event!` up front so that we can use it in the custom getter of `instance-creation`.
;; We can't move `instance-creation` below `track-event!` because it has to be defined before `context`, which is called
;; by `track-event!`.
(declare track-event!)

(defsetting instance-creation
  (deferred-tru "The approximate timestamp at which this instance of Metabase was created, for inclusion in analytics.")
  :visibility :public
  :setter     :none
  :getter     (fn []
                (when-not (db/exists? Setting :key "instance-creation")
                  ;; For instances that were started before this setting was added (in 0.41.3), use the creation
                  ;; timestamp of the first user. For all new instances, use the timestamp at which this setting
                  ;; is first read.
                  (let [value (or (first-user-creation) (t/offset-date-time))]
                    (setting/set-value-of-type! :timestamp :instance-creation value)
                    (track-event! ::new-instance-created)))
                (u.date/format-rfc3339 (setting/get-value-of-type :timestamp :instance-creation))))

(def ^:private emitter
  "Returns an instance of a Snowplow emitter"
  (let [emitter* (delay
                   (let [request-config (-> (RequestConfig/custom)
                                            ;; Set cookie spec to `STANDARD` to avoid warnings about an invalid cookie
                                            ;; header in request response (PR #24579)
                                            (.setCookieSpec CookieSpecs/STANDARD)
                                            (.build))
                         client (-> (HttpClients/custom)
                                    (.setConnectionManager (PoolingHttpClientConnectionManager.))
                                    (.setDefaultRequestConfig request-config)
                                    (.build))
                         builder (-> (ApacheHttpClientAdapter/builder)
                                     (.httpClient client)
                                     (.url (snowplow-url)))
                         adapter (.build ^ApacheHttpClientAdapter$Builder builder)
                         batch-emitter-builder (-> (BatchEmitter/builder)
                                                   (.batchSize 1)
                                                   (.httpClientAdapter adapter))]
                     (.build ^BatchEmitter$Builder batch-emitter-builder)))]
     (fn [] @emitter*)))

(def ^:private tracker
  "Returns instance of a Snowplow tracker"
  (let [tracker* (delay
                  (-> (Tracker$TrackerBuilder. ^Emitter (emitter) "sp" "metabase")
                      .build))]
    (fn [] @tracker*)))

(defn- subject
  "Create a Subject object for a given user ID, to be included in analytics events"
  [user-id]
  (-> (Subject$SubjectBuilder.)
      (.userId (str user-id))
      ;; Override with localhost IP to avoid logging actual user IP addresses
      (.ipAddress "127.0.0.1")
      .build))

(def ^:private schema->version
  "The most recent version for each event schema. This should be updated whenever a new version of a schema is added
  to SnowcatCloud, at the same time that the data sent to the collector is updated."
  {::account   "1-0-0"
   ::invite    "1-0-1"
   ::dashboard "1-0-0"
   ::database  "1-0-0"
   ::instance  "1-1-0"
   ::timeline  "1-0-0"
   ::task      "1-0-0"})

(defn- context
  "Common context included in every analytics event"
  []
  (new SelfDescribingJson
       (str "iglu:com.metabase/instance/jsonschema/" (schema->version ::instance))
       {"id"             (analytics-uuid)
        "version"        {"tag" (:tag (public-settings/version))}
        "token_features" (m/map-keys name (public-settings/token-features))
        "created_at"     (instance-creation)}))

(defn- normalize-kw
  [kw]
  (-> kw u/snake-key name))

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
  (.track ^Tracker tracker ^Unstructured event))

(def ^:private event->schema
  "The schema to use for each analytics event."
  {::new-instance-created           ::account
   ::new-user-created               ::account
   ::invite-sent                    ::invite
   ::dashboard-created              ::dashboard
   ::question-added-to-dashboard    ::dashboard
   ::database-connection-successful ::database
   ::database-connection-failed     ::database
   ::new-event-created              ::timeline
   ::new-task-history               ::task})

(defn track-event!
  "Send a single analytics event to the Snowplow collector, if tracking is enabled for this MB instance and a collector
  is available."
  [event-kw & [user-id data]]
  (when (snowplow-enabled)
    (try
      (let [schema (event->schema event-kw)
            ^Unstructured$Builder builder (-> (. Unstructured builder)
                                              (.eventData (payload schema (schema->version schema) event-kw data))
                                              (.customContext [(context)])
                                              (cond-> user-id (.subject (subject user-id))))
            ^Unstructured event (.build builder)]
        (track-event-impl! (tracker) event))
      (catch Throwable e
        (log/debug e (trs "Error sending Snowplow analytics event {0}" event-kw))))))
