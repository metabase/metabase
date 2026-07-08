(ns metabase.analytics.metaplow
  "Sends analytics events to a Metaplow (Umami-compatible) collector.

  `track-event!` builds a payload, offers it onto an async send queue, and returns. A `pipeline-blocking` worker pool
  drains the queue and POSTs each event to the collector's `/api/send` endpoint, retrying transient failures via
  [[metabase.util.retry/with-retry]]. The HTTP connection pool is sized to match the worker count so workers never
  contend for slots.

  Emission is gated by [[metabase.analytics.settings/metaplow-tracking-enabled]]. The public entry point used by the
  rest of the codebase is [[metabase.analytics.event/track-event!]], which fans out to both Snowplow and Metaplow."
  (:require
   [clj-http.client :as http]
   [clj-http.conn-mgr :as conn-mgr]
   [clojure.core.async :as a]
   [clojure.walk :as walk]
   [metabase.analytics-interface.core :as analytics]
   [metabase.analytics.settings :as analytics.settings]
   [metabase.premium-features.core :as premium-features]
   [metabase.util :as u]
   [metabase.util.json :as json]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu]
   [metabase.util.retry :as retry]
   [metabase.version.core :as version]))

(set! *warn-on-reflection* true)

(def ^:private website-id
  "Same constant the frontend tracker uses; see frontend/src/metabase/utils/metaplow.ts."
  "23eefa30-4c4f-490e-aa4f-084cd23b1561")

(def ^:private anonymized-hostname
  "Hostname sent on every event. Matches the FE constant in frontend/src/metabase/utils/metaplow.ts."
  "anonymous.metabase.com")

(def ^:private payload-tag
  "Tag identifying the event source. Matches the FE constant in frontend/src/metabase/utils/metaplow.ts."
  "metabase-instance")

(def ^:private queue-size 10000)
(def ^:private no-retry-status-codes #{400 401 403 410 422})

;; `worker-count` drives both the number of worker threads draining the queue AND the size of the HTTP connection
;; pool. Keep them coupled: if the pool is smaller than the worker count, workers contend for connection slots and
;; the parallelism is silently capped at the pool size.
(def ^:private worker-count 50)

(defn- normalize-kw
  [kw]
  (name (u/->snake_case_en kw)))

(defn- snake-case-payload
  "Convert any keyword in a payload (keys or values, at any depth) to a snake_case string."
  [m]
  (walk/postwalk #(if (keyword? %) (normalize-kw %) %) m))

(defn- event-name+data
  "Returns `[event-name event-data]` for a given Snowplow-style schema kw and payload. Schemas with an `:event`
  discriminator become `\"<schema>.<event>\"`; schemas without one become `\"<schema>\"`."
  [schema data]
  (let [schema-name (normalize-kw schema)
        data*       (snake-case-payload data)]
    (if-let [event (get data* "event")]
      [(str schema-name "." event) (dissoc data* "event")]
      [schema-name data*])))

(defn- build-payload
  [schema data]
  (let [[event-name event-data] (event-name+data schema data)
        enriched-data           (assoc event-data
                                       "version_tag" (:tag (version/version))
                                       "plan"        (or (premium-features/plan-alias) "oss"))]
    {:type    "event"
     :payload {:website  website-id
               :id       (analytics.settings/analytics-uuid)
               :hostname anonymized-hostname
               :tag      payload-tag
               :name     event-name
               :data     enriched-data}}))

(defonce ^:private
  ^{:doc "Reuses TCP/TLS connections across requests to the metaplow collector. Same idea as Snowplow's
         `PoolingHttpClientConnectionManager` setup in `metabase.analytics.snowplow`, just via clj-http's wrapper.
         Sized to `worker-count`: every request goes to one host, so `:default-per-route` is the actual parallelism
         cap. Wrapped in `delay` so the pool isn't created until the first event is sent."}
  connection-manager
  (delay (conn-mgr/make-reusable-conn-manager {:threads           worker-count
                                               :default-per-route worker-count})))

(defn- send-event!
  "POST a single payload to the Metaplow `/api/send` endpoint. Returns a map with `:status` (HTTP status code, or -1
  on connection failure)."
  [payload]
  (try
    (http/post (analytics.settings/metaplow-url)
               {:body               (json/encode payload)
                :content-type       :json
                :socket-timeout     5000
                :connection-timeout 5000
                :throw-exceptions   false
                :connection-manager @connection-manager})
    (catch Throwable e
      (analytics/inc! :metabase-metaplow/errors {:stage :send-event!})
      (log/warn e "Connection failure sending Metaplow event")
      {:status -1})))

(defn- retryable-response?
  "Truthy when a `send-event!` response should trigger another attempt: non-2xx and not one of the no-retry
  status codes that Snowplow also gives up on (400/401/403/410/422)."
  [{:keys [status]}]
  (and (some? status)
       (not (<= 200 status 299))
       (not (contains? no-retry-status-codes status))))

(defn- send-event-with-retries!
  "Send an event, retrying with exponential backoff on connection failures or retryable HTTP statuses (via
  [[metabase.util.retry/with-retry]]). Returns `:sent` on success and `:error` on failure (never nil), so callers can
  reliably distinguish outcomes."
  [payload]
  (try
    (retry/with-retry {:retry-if (fn [response _ex] (retryable-response? response))}
      (send-event! payload))
    :sent
    (catch Throwable e
      (analytics/inc! :metabase-metaplow/errors {:stage :send-event-with-retries!})
      (log/warn e "Error sending Metaplow event")
      :error)))

(defonce ^:private
  ^{:doc "Individual payloads queued by `track-event!` land here. Bounded chan of size `queue-size`; new events are
         rejected when full."}
  source-chan
  (a/chan queue-size))

(defonce ^:private
  ^{:doc "Black-hole sink for `pipeline-blocking` worker output. Sliding-buffer with no consumer, so workers' puts
         never block."}
  sink-chan
  (a/chan (a/sliding-buffer 1)))

(defonce ^:private
  ^{:doc "Spawns `worker-count` worker threads that drain `source-chan` and apply `send-event-with-retries!` to each
         event. Wrapped in `delay` so workers aren't spawned until the first event is enqueued — instances that don't
         use Metaplow pay nothing at boot."}
  pipeline
  (delay
    (a/pipeline-blocking
     worker-count
     sink-chan
     ;; The var (not the fn) is passed so the indirection survives `with-redefs` in tests.
     (map #'send-event-with-retries!)
     source-chan)))

(defn- enqueue!
  "Push a payload onto the async send queue. Returns true on success, false when the queue is full."
  [payload]
  @pipeline ;; start the pipeline on first call
  (or (a/offer! source-chan payload)
      (do (analytics/inc! :metabase-metaplow/errors {:stage :enqueue!})
          false)))

(mu/defn track-event! :- :boolean
  "Send a single analytics event to the Metaplow collector. Returns true when the event was enqueued, false when
  Metaplow tracking is disabled or the queue is full."
  ([schema data]
   (track-event! schema data nil))
  ([schema :- :keyword data _user-id]
   (boolean
    (when (analytics.settings/metaplow-tracking-enabled)
      (try
        (enqueue! (build-payload schema data))
        (catch Throwable e
          (analytics/inc! :metabase-metaplow/errors {:stage :track-event!})
          (log/warn e "Error queueing Metaplow event")
          false))))))

(comment
  ;; Manual testing against a real Umami/Metaplow collector. Eval forms in the REPL one at a time.

  ;; 1. Point at the collector.
  (analytics.settings/metaplow-url! "https://product-analytics-ingestion.staging.metabase.com/api/send")
  (analytics.settings/anon-tracking-enabled! true)

  ;; 2. Sanity check.
  (analytics.settings/metaplow-tracking-enabled)   ; => true

  ;; 3. Fire one event: queued, drained by a worker, POSTed to `metaplow-url`.
  (track-event! :snowplow/dashboard {:event :dashboard-created :dashboard-id 1})

  ;; 4. Fire a burst: workers POST in parallel up to `worker-count`.
  (dotimes [i 75]
    (track-event! :snowplow/dashboard {:event :dashboard-created :dashboard-id i}))

  ;; 5. Inspect what gets built without sending anything.
  (build-payload :snowplow/dashboard {:event :dashboard-created :dashboard-id 42})

  ;; 6. POST a hand-crafted event directly. Bypasses the queue; useful for testing URL, auth, and payload shape.
  (send-event! (build-payload :snowplow/dashboard {:event :test-event :dashboard-id 1}))

  ;; 7. Turn it off.
  (analytics.settings/metaplow-url! nil))
