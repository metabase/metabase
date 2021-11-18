(ns metabase.analytics.snowplow
  "Functions for sending Snowplow analytics events"
  (:require [clojure.tools.logging :as log]
            [medley.core :as m]
            [metabase.config :as config]
            [metabase.models.setting :as setting :refer [defsetting]]
            [metabase.models.user :refer [User]]
            [metabase.public-settings :as public-settings]
            [metabase.util.i18n :as i18n :refer [deferred-tru trs]]
            [toucan.db :as db])
  (:import [com.snowplowanalytics.snowplow.tracker Subject$SubjectBuilder Tracker Tracker$TrackerBuilder]
           [com.snowplowanalytics.snowplow.tracker.emitter BatchEmitter BatchEmitter$Builder Emitter]
           [com.snowplowanalytics.snowplow.tracker.events Unstructured Unstructured$Builder]
           [com.snowplowanalytics.snowplow.tracker.http ApacheHttpClientAdapter ApacheHttpClientAdapter$Builder]
           com.snowplowanalytics.snowplow.tracker.payload.SelfDescribingJson
           org.apache.http.impl.client.HttpClients
           org.apache.http.impl.conn.PoolingHttpClientConnectionManager))

(defsetting analytics-uuid
  (str (deferred-tru "Unique identifier to be used in Snowplow analytics, to identify this instance of Metabase.")
       " "
       (deferred-tru "This is a public setting since some analytics events are sent prior to initial setup."))
  :visibility :public
  :setter     :none
  :getter     #(public-settings/uuid-nonce :analytics-uuid))

(defsetting snowplow-url
  (deferred-tru "The URL of the Snowplow collector to send analytics events to")
  :default (if config/is-prod?
             "https://sp.metabase.com"
             ;; See the iglu-schema-registry repo for instructions on how to run Snowplow Micro locally for development
             "http://localhost:9095")
  :visibility :public)

(def ^:private ^{:arglists `(^Emitter [])} emitter
  "Returns an instance of a Snowplow emitter"
  (let [emitter* (delay
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
                     (.build ^BatchEmitter$Builder batch-emitter-builder)))]
     (fn [] @emitter*)))

(def ^:private ^{:arglists `(^Tracker [])} tracker
  "Returns instance of a Snowplow tracker"
  (let [tracker* (delay
                  (-> (Tracker$TrackerBuilder. ^Emitter (emitter) "sp" "metabase")
                      .build))]
    (fn [] @tracker*)))

(defn- set-subject
  "Create a Subject object for a given user ID, to be included in analytics events"
  [builder user-id]
  (if user-id
    (let [subject (-> (Subject$SubjectBuilder.)
                      (.userId (str user-id))
                      .build)]
      (.subject ^Unstructured$Builder builder ^Subject subject))
    builder))

(defn- context
  "Common context included in every analytics event"
  []
  (new SelfDescribingJson
       "iglu:com.metabase/instance/jsonschema/1-0-0"
       {"id"             (analytics-uuid),
        "version"        {"tag" (:tag (public-settings/version))},
        "token-features" (m/map-keys name (public-settings/token-features))}))

(defn- payload
  "A SelfDescribingJson object containing the provided event data, which can be included as the payload for an
  analytics event"
  [schema version event-data]
  (new SelfDescribingJson
       (format "iglu:com.metabase/%s/jsonschema/%s" (name schema) version)
       ;; Make sure keywords are converted to strings
       (into {} (for [[k v] event-data] [(name k) (if (keyword? v) (name v) v)]))))

(defn- track-event-impl!
  "Wrapper function around the `.track` method on a Snowplow tracker. Can be redefined in tests to instead append
  event data to an in-memory store."
  [tracker event]
  (.track ^Tracker tracker ^Unstructured event))

(defn- track-schema-event!
  "Send a single analytics event to the Snowplow collector, if tracking is enabled for this MB instance"
  [schema version user-id event-data]
  (when (public-settings/anon-tracking-enabled)
    (try
      (let [^Unstructured$Builder builder (-> (. Unstructured builder)
                                              (.eventData (payload schema version event-data))
                                              (.customContext [(context)]))
            ^Unstructured$Builder builder' (set-subject builder user-id)
            ^Unstructured event (.build builder')]
        (track-event-impl! (tracker) event))
      (catch Throwable e
        (log/debug e (trs "Error sending Snowplow analytics event {0}" (name (:event event-data))))))))

;; Snowplow analytics interface

(derive ::new-instance-created           ::account)
(derive ::new-user-created               ::account)
(derive ::invite-sent                    ::invite)
(derive ::dashboard-created              ::dashboard)
(derive ::question-added-to-dashboard    ::dashboard)
(derive ::database-connection-successful ::database)
(derive ::database-connection-failed     ::database)

(defmulti track-event!
  "Send a single analytics event to Snowplow"
  (fn [event & _] (keyword event)))

(defmethod track-event! :new_instance_created
  [event]
  (track-schema-event! :account "1-0-0" nil {:event event}))

(defmethod track-event! :new_user_created
  [event user-id]
  (track-schema-event! :account "1-0-0" user-id {:event event}))

(defmethod track-event! :invite_sent
  [event user-id event-data]
  (track-schema-event! :invite "1-0-0" user-id (assoc event-data :event event)))

(defmethod track-event! :dashboard_created
  [event user-id event-data]
  (track-schema-event! :dashboard "1-0-0" user-id (assoc event-data :event event)))

(defmethod track-event! :question_added_to_dashboard
  [event user-id event-data]
  (track-schema-event! :dashboard "1-0-0" user-id (assoc event-data :event event)))

(defmethod track-event! :database_connection_successful
  [event user-id event-data]
  (track-schema-event! :database "1-0-0" user-id (assoc event-data :event event)))

(defmethod track-event! :database_connection_failed
  [event user-id event-data]
  (track-schema-event! :database "1-0-0" user-id (assoc event-data :event event)))

(defn- first-user-creation
  "Returns the earliest user creation timestamp in the database"
  []
  (:min (db/select-one [User [:%min.date_joined :min]])))

(defsetting instance-creation
  (deferred-tru "The approximate timestamp at which this instance of Metabase was created, for inclusion in analytics.")
  :visibility :public
  :type       :timestamp
  :setter     :none
  :getter     (fn []
                (if-let [value (setting/get-timestamp :instance-creation)]
                  value
                  ;; For instances that were started before this setting was added (in 0.41.3), use the creation
                  ;; timestamp of the first user. For all new instances, use the timestamp at which this setting
                  ;; is first read.
                  (do (setting/set-timestamp! :instance-creation (or (first-user-creation)
                                                                     (java-time/offset-date-time)))
                      (track-event! :new_instance_created)
                      (setting/get-timestamp :instance-creation)))))
