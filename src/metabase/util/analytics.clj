(ns metabase.util.analytics
  "Functions for sending Snowplow analytics events"
  (:require [metabase.models.setting :refer [defsetting]]
            [metabase.util.i18n :as i18n :refer [available-locales-with-names deferred-tru trs tru]]
            [metabase.public-settings :as public-settings]
            [metabase.api.common :as api])
  (:import [com.snowplowanalytics.snowplow.tracker Subject$SubjectBuilder Tracker Tracker$TrackerBuilder]
           [com.snowplowanalytics.snowplow.tracker.emitter BatchEmitter Emitter]
           com.snowplowanalytics.snowplow.tracker.http.ApacheHttpClientAdapter
           org.apache.http.impl.client.HttpClients
           org.apache.http.impl.conn.PoolingHttpClientConnectionManager
           com.snowplowanalytics.snowplow.tracker.payload.SelfDescribingJson
           com.snowplowanalytics.snowplow.tracker.events.Unstructured))

(defsetting snowplow-url
  (deferred-tru "The URL of the Snowplow collector to send analytics events to")
  :default "http://localhost:9095";"https://sp.metabase.com"
  :visibility :public)

(def ^:private ^Emitter emitter
  "An instance of a Snowplow emitter"
  (delay
   (let [manager (new PoolingHttpClientConnectionManager)
         client  (-> (. HttpClients custom)
                     (.setConnectionManager manager)
                     (.build))
         adapter (-> (. ApacheHttpClientAdapter builder)
                     (.url (snowplow-url))
                     (.httpClient client)
                     (.build))]
     (-> (. BatchEmitter builder)
         (.httpClientAdapter adapter)
         (.bufferSize 1) ;; TODO bump buffer size back to 5?
         (.build)))))

(def ^:private ^Tracker tracker
  "An instance of a Snowplow tracker"
  (delay
   (-> (Tracker$TrackerBuilder. @emitter "sp" "metabase")
       (.build))))

(defn- subject
  "Create a Subject object for a given user ID, to be included in analytics events"
  [user-id]
  (-> (Subject$SubjectBuilder.)
      (.userId (str user-id))
      (.build)))

(defn- payload
  [event-data]
  ; (let [event-data {"event" "tracking_permission_enabled",
  ;                   "source" "setup"}]
  (new SelfDescribingJson
       "iglu:com.metabase/settings/jsonschema/1-0-0"
       ;; Make sure keys are strings
       (into {} (for [[k v] event-data] [(name k) v]))))

(defn- context
  "Common context included in every analytics event"
  []
  (new SelfDescribingJson
       "iglu:com.metabase/instance/jsonschema/1-0-0"
       {"id"             (public-settings/analytics-uuid),
        "version"        {"tag" (:tag (public-settings/version))},
        "token-features" (into {} (for [[token enabled?] (public-settings/token-features)]
                                    [(name token) enabled?]))}))

(comment (.track @tracker (-> (. Unstructured builder)
                              (.subject (subject 1))
                              (.eventData (payload))
                              (.customContext [(context)])
                              (.build))))
