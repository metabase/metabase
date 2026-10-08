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
   [metabase.util.malli.schema :as ms]
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
  {:snowplow/account          "1-0-1"
   :snowplow/browse_data      "1-0-0"
   :snowplow/invite           "1-0-1"
   :snowplow/instance_stats   "2-0-0"
   :snowplow/csvupload        "1-0-3"
   :snowplow/dashboard        "1-1-4"
   :snowplow/database         "1-0-1"
   :snowplow/instance         "1-1-2"
   :snowplow/metabot          "1-0-1"
   :snowplow/search           "1-0-1"
   :snowplow/model            "1-0-0"
   :snowplow/timeline         "1-0-1"
   :snowplow/task             "1-0-0"
   :snowplow/upsell           "1-0-0"
   :snowplow/action           "1-0-0"
   :snowplow/embed_share      "1-0-2"
   :snowplow/llm_usage        "1-0-0"
   :snowplow/token_usage      "1-0-5"
   :snowplow/serialization    "1-0-1"
   :snowplow/simple_event     "1-0-0"
   :snowplow/cleanup          "1-0-0"
   :snowplow/ai_service_event "1-0-0"
   :snowplow/data_complexity  "1-0-0"})

(def SnowplowSchema
  "Malli enum for valid Snowplow schemas"
  (into [:enum] (keys schema->version)))

(def ^:private no-payload-event-data
  "Shape for `SnowplowSchema` values with no caller in this codebase today."
  [:map {:closed true}
   [:event {:optional true} :keyword]])

(def ^:private account-event-data
  [:map {:closed true}
   [:event {:optional true} :keyword]])

(def ^:private invite-event-data
  [:map {:closed true}
   [:event           {:optional true} :keyword]
   [:invited-user-id {:optional true} ms/PositiveInt]
   [:source          {:optional true} [:or :keyword :string]]])

(def ^:private dashboard-event-data
  [:map {:closed true}
   [:event          {:optional true} :keyword]
   [:dashboard-id   {:optional true} ms/PositiveInt]
   [:question-id    {:optional true} ms/PositiveInt]
   [:num-tabs       {:optional true} :int]
   [:total-num-tabs {:optional true} :int]])

(def ^:private database-event-data
  [:map {:closed true}
   [:event        {:optional true} :keyword]
   [:database     {:optional true} [:or :keyword :string]]
   [:database-id  {:optional true} ms/PositiveInt]
   [:source       {:optional true} [:or :keyword :string]]
   [:dbms-version {:optional true} [:maybe :string]]
   [:dbms_version {:optional true} :string]])

(def ^:private simple-event-data
  [:map {:closed true}
   [:event          {:optional true} [:or :string :keyword]]
   [:event_detail   {:optional true} [:maybe :string]]
   [:event-detail   {:optional true} [:maybe :string]]
   [:target_id      {:optional true} ms/PositiveInt]
   [:duration_ms    {:optional true} [:maybe :int]]
   [:result         {:optional true} :string]
   [:triggered_from {:optional true} :string]])

(def ^:private timeline-event-data
  [:map {:closed true}
   [:event         {:optional true} :keyword]
   [:time_matters  {:optional true} [:maybe :boolean]]
   [:collection_id {:optional true} [:maybe ms/PositiveInt]]
   [:source        {:optional true} :string]
   [:question_id   {:optional true} ms/PositiveInt]])

(def ^:private action-event-data
  [:map {:closed true}
   [:event          {:optional true} :keyword]
   [:source         {:optional true} :keyword]
   [:type           {:optional true} :keyword]
   [:action_id      {:optional true} ms/PositiveInt]
   [:num_parameters {:optional true} :int]])

(def ^:private embed-share-event-data
  [:map {:closed true}
   [:event                      {:optional true} :keyword]
   [:embedding-app-origin-set   {:optional true} :boolean]
   [:number-embedded-questions  {:optional true} :int]
   [:number-embedded-dashboards {:optional true} :int]])

(def ^:private model-event-data
  [:map {:closed true}
   [:event    {:optional true} :keyword]
   [:model-id {:optional true} ms/PositiveInt]])

(def ^:private csvupload-event-data
  [:map {:closed true}
   [:event             {:optional true} :keyword]
   [:num-rows          {:optional true} :int]
   [:num-columns       {:optional true} :int]
   [:generated-columns {:optional true} :int]
   [:size-mb           {:optional true} number?]
   [:upload-seconds    {:optional true} number?]
   [:model-id          {:optional true} ms/PositiveInt]])

(def ^:private token-usage-event-data
  [:map {:closed true}
   [:request-id                    {:optional true} [:maybe :string]]
   [:model-id                      {:optional true} [:maybe :string]]
   [:total-tokens                  {:optional true} [:maybe ms/IntGreaterThanOrEqualToZero]]
   [:prompt-tokens                 {:optional true} [:maybe ms/IntGreaterThanOrEqualToZero]]
   [:completion-tokens             {:optional true} [:maybe ms/IntGreaterThanOrEqualToZero]]
   [:estimated-costs-usd           {:optional true} [:maybe number?]]
   [:cache-creation-tokens         {:optional true} [:maybe ms/IntGreaterThanOrEqualToZero]]
   [:cache-read-tokens             {:optional true} [:maybe ms/IntGreaterThanOrEqualToZero]]
   [:user-id                       {:optional true} [:maybe :int]]
   [:duration-ms                   {:optional true} [:maybe ms/IntGreaterThanOrEqualToZero]]
   [:source                        {:optional true} [:maybe :string]]
   [:tag                           {:optional true} [:maybe :string]]
   [:session-id                    {:optional true} [:maybe :string]]
   [:profile                       {:optional true} [:maybe :string]]
   [:hashed-metabase-license-token {:optional true} [:maybe :string]]])

(def ^:private serialization-event-data
  [:map {:closed true}
   [:event           {:optional true} :keyword]
   [:direction       {:optional true} :string]
   [:source          {:optional true} :string]
   [:duration_ms     {:optional true} :int]
   [:models          {:optional true} :string]
   [:count           {:optional true} :int]
   [:error_count     {:optional true} :int]
   [:success         {:optional true} :boolean]
   [:error_message   {:optional true} [:maybe :string]]
   [:collection      {:optional true} :string]
   [:all_collections {:optional true} :boolean]
   [:data_model      {:optional true} :boolean]
   [:settings        {:optional true} :boolean]
   [:field_values    {:optional true} [:maybe :boolean]]
   [:secrets         {:optional true} :boolean]])

(def ^:private cleanup-event-data
  [:map {:closed true}
   [:event                   {:optional true} :keyword]
   [:collection_id           {:optional true} [:maybe ms/PositiveInt]]
   [:total_stale_items_found {:optional true} :int]
   [:cutoff_date             {:optional true} :string]])

(def ^:private data-complexity-event-data
  [:map {:closed true}
   [:event           {:optional true} :keyword]
   [:batch_id        {:optional true} :string]
   [:formula_version {:optional true} :int]
   [:parameters      {:optional true}
    [:map {:closed true}
     ["synonym_threshold" {:optional true} [:maybe number?]]
     ["weights"           {:optional true} [:maybe ms/OpaqueJSONObject]]
     ["embedding_model"   {:optional true} [:maybe ms/OpaqueJSONObject]]
     ["text_variant"      {:optional true} [:maybe :string]]]]
   [:catalog     {:optional true} :keyword]
   [:key         {:optional true} :string]
   [:score       {:optional true} number?]
   [:measurement {:optional true} number?]
   [:error       {:optional true} :string]])

(def ^:private ai-service-event-data
  [:map {:closed true}
   [:hashed-metabase-license-token {:optional true} [:maybe :string]]
   [:request-id                    {:optional true} [:maybe :string]]
   [:source                        {:optional true} [:maybe :string]]
   [:event                         {:optional true} :string]
   [:user-id                       {:optional true} [:maybe ms/PositiveInt]]
   [:session-id                    {:optional true} [:maybe :string]]
   [:profile                       {:optional true} [:maybe :string]]
   [:duration-ms                   {:optional true} [:maybe :int]]
   [:result                        {:optional true} :string]
   [:event-details                 {:optional true}
    [:map {:closed true}
     ["tool_name" {:optional true} [:maybe :string]]
     ["step"      {:optional true} :int]]]])

(def SnowplowEventData
  "Closed shape of the `data` payload accepted by [[track-event!]], as a union of the shapes each `SnowplowSchema`
  value actually carries at its call sites. `:snowplow/instance_stats` is an opaque, deeply-nested telemetry blob
  assembled from many stats sources and forwarded to Snowplow without being read by key."
  [:or
   account-event-data
   invite-event-data
   dashboard-event-data
   database-event-data
   simple-event-data
   timeline-event-data
   action-event-data
   embed-share-event-data
   model-event-data
   csvupload-event-data
   token-usage-event-data
   serialization-event-data
   cleanup-event-data
   data-complexity-event-data
   ai-service-event-data
   ms/OpaqueJSONObject
   no-payload-event-data])

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

(mu/defn track-event! :- :boolean
  "Send a single analytics event to the Snowplow collector, if tracking is enabled for this MB instance and a collector
  is available. Returns true when the event was actually handed to the tracker; false when tracking is disabled or
  emission threw — callers that need to gate durable side-effects on real delivery can check the return value."
  ([schema :- SnowplowSchema data :- SnowplowEventData]
   (track-event! schema data api/*current-user-id*))

  ([schema :- SnowplowSchema data :- SnowplowEventData user-id :- [:maybe ms/PositiveInt]]
   (boolean
    (when (analytics.settings/snowplow-enabled)
      (try
        (let [^SelfDescribing$Builder2 builder (-> (. SelfDescribing builder)
                                                   (.eventData (payload schema (schema->version schema) data))
                                                   (.customContext [(context)])
                                                   (cond-> user-id (.subject (subject user-id))))
              ^SelfDescribing event (.build builder)]
          (track-event-impl! tracker event)
          true)
        (catch Throwable e
          (log/errorf "Error sending Snowplow analytics event for schema %s: %s" schema (ex-message e))
          false))))))
