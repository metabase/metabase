(ns metabase.util.analytics
  "Functions for sending Snowplow analytics events"
  (:require [clojure.tools.logging :as log]
            [metabase.config :as config]
            [metabase.models.setting :refer [defsetting]]
            [metabase.public-settings :as public-settings]
            [metabase.util.i18n :as i18n :refer [deferred-tru trs]])
  (:import [com.snowplowanalytics.snowplow.tracker Subject$SubjectBuilder Tracker Tracker$TrackerBuilder]
           [com.snowplowanalytics.snowplow.tracker.emitter BatchEmitter BatchEmitter$Builder Emitter]
           [com.snowplowanalytics.snowplow.tracker.events Unstructured Unstructured$Builder]
           [com.snowplowanalytics.snowplow.tracker.http ApacheHttpClientAdapter ApacheHttpClientAdapter$Builder]
           com.snowplowanalytics.snowplow.tracker.payload.SelfDescribingJson
           org.apache.http.client.HttpClient
           [org.apache.http.impl.client CloseableHttpClient HttpClientBuilder HttpClients]
           org.apache.http.impl.conn.PoolingHttpClientConnectionManager))

(defsetting snowplow-url
  (deferred-tru "The URL of the Snowplow collector to send analytics events to")
  :default (if config/is-prod?
             "https://sp.metabase.com"
             ;; See the iglu-schema-registry repo for instructions on how to run Snowplow Micro locally for development
             "http://localhost:9095")
  :visibility :public)

(def ^:private ^Emitter emitter
  "An instance of a Snowplow emitter"
  (delay
    (let [client (-> (HttpClients/custom)
                     (.setConnectionManager (PoolingHttpClientConnectionManager.))
                     (.build))
          builder (-> (ApacheHttpClientAdapter/builder)
                      (.httpClient client)
                      (.url (snowplow-url)))
          adapter (.build ^ApacheHttpClientAdapter$Builder builder)
          batch-emitter-builder (-> (BatchEmitter/builder)
                                    (.bufferSize 1)
                                    (.httpClientAdapter adapter))]
      (.build ^BatchEmitter$Builder batch-emitter-builder))))

(def ^:private ^Tracker tracker
  "An instance of a Snowplow tracker"
  (delay
   (-> (Tracker$TrackerBuilder. ^Emitter @emitter "sp" "metabase")
       (.build))))

(defn- subject
  "Create a Subject object for a given user ID, to be included in analytics events"
  [user-id]
  (-> (Subject$SubjectBuilder.)
      (.userId (str user-id))
      (.build)))

(defn- context
  "Common context included in every analytics event"
  []
  (new SelfDescribingJson
       "iglu:com.metabase/instance/jsonschema/1-0-0"
       {"id"             (public-settings/analytics-uuid),
        "version"        {"tag" (:tag (public-settings/version))},
        "token-features" (into {} (for [[token enabled?] (public-settings/token-features)]
                                    [(name token) enabled?]))}))

(defn- payload
  "A SelfDescribingJson object containing the provided event data, which can be included as the payload for an
  analytics event"
  [schema version event-data]
  (new SelfDescribingJson
       (format "iglu:com.metabase/%s/jsonschema/%s" (name schema) version)
       ;; Make sure keywords are converted to strings
       (into {} (for [[k v] event-data] [(name k) (if (keyword? v) (name v) v)]))))

(defn- track-schema-event
  "Send a single analytics event to the Snowplow collector, if tracking is enabled for this MB instance"
  [schema version user-id event-data]
  (when (public-settings/anon-tracking-enabled)
    (try
      (let [^Unstructured$Builder builder (-> (. Unstructured builder)
                                              (.eventData (payload schema version event-data))
                                              (.customContext [(context)]))
            ^Unstructured$Builder builder' (if user-id
                                             (.subject builder (subject user-id))
                                             builder)
            ^Unstructured event (.build builder')]
        (.track ^Tracker @tracker event))
      (catch Throwable e
        (log/debug e (trs "Error sending Snowplow analytics event {0}" (name (:event event-data))))))))

;; Snowplow analytics interface

(defmulti track-event
  "Send a single analytics event to Snowplow"
  (fn [event & _] event))

(defmethod track-event :new_instance_created
  [event]
  (track-schema-event :account "1-0-0" nil {:event event}))

(defmethod track-event :new_user_created
  [event user-id]
  (track-schema-event :account "1-0-0" user-id {:event event}))

(defmethod track-event :invite_sent
  [event user-id event-data]
  (track-schema-event :invite "1-0-0" user-id (assoc event-data :event event)))

(defmethod track-event :dashboard_created
  [event user-id event-data]
  (track-schema-event :dashboard "1-0-0" user-id (assoc event-data :event event)))

(defmethod track-event :question_added_to_dashboard
  [event user-id event-data]
  (track-schema-event :dashboard "1-0-0" user-id (assoc event-data :event event)))
