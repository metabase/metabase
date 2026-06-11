(ns metabase.metabot.self.debug
  "Opt-in helper for dumping the fully composed LLM request payload and the raw
  provider response (SSE events) to disk. Each LLM call produces one file at
  `logs/ai/requests/agent_<ts>.json`.

  Enabled by setting `MB_METABOT_DEBUG_LLM_REQUESTS=true`. Disabled (zero overhead)
  otherwise, including in dev.

  Wired into the provider adapters (`claude-raw`, `openai-raw`, `openrouter-raw`)
  via [[capture-stream]], which tees every raw SSE event into a vector and flushes
  the file on reduction completion."
  (:require
   [clojure.java.io :as io]
   [metabase.config.core :as config]
   [metabase.util.json :as json]
   [metabase.util.log :as log])
  (:import
   (java.io File)
   (java.time LocalDateTime)
   (java.time.format DateTimeFormatter)))

(set! *warn-on-reflection* true)

(defn- enabled? []
  (boolean (config/config-bool :mb-metabot-debug-llm-requests)))

(def ^:private log-dir "logs/ai/requests")

(def ^:private ^DateTimeFormatter ts-fmt
  (DateTimeFormatter/ofPattern "yyyyMMdd_HHmmss_SSS"))

(defn- now-ts []
  (.format (LocalDateTime/now) ts-fmt))

(defn- log-file ^File []
  (io/file log-dir (str "agent_" (now-ts) ".json")))

(defn write-request-log!
  "Write a composed LLM request + response payload to `logs/ai/requests/agent_<ts>.json`.
  Silently no-ops unless `MB_METABOT_DEBUG_LLM_REQUESTS` is truthy. The `entry`
  map should minimally contain `:provider :model :request :response`; additional
  keys (e.g. `:url`, `:error`) pass through unchanged."
  [entry]
  (when (enabled?)
    (try
      (.mkdirs (io/file log-dir))
      (let [f (log-file)]
        (with-open [w (io/writer f)]
          (.write w ^String (json/encode entry {:pretty true})))
        (log/debugf "Wrote AI request log to %s" (.getPath f)))
      (catch Exception e
        (log/warn e "Failed to write AI request log")))))

(defn capture-stream
  "Wrap an SSE reducible so every raw provider event is teed into a vector while
  still flowing through to the downstream consumer. When the reduction completes
  (or throws), the composed request (`log-context`, typically
  `{:provider ... :model ... :url ... :request ...}`) plus the captured
  `:response` vector is written via [[write-request-log!]].

  When `MB_METABOT_DEBUG_LLM_REQUESTS` is unset or false, returns `reducible`
  unchanged so there's zero overhead."
  [reducible log-context]
  (if-not (enabled?)
    reducible
    (reify clojure.lang.IReduceInit
      (reduce [_ rf init]
        (let [events (atom [])
              tee-rf (fn [acc event]
                       (swap! events conj event)
                       (rf acc event))]
          (try
            (let [result (reduce tee-rf init reducible)]
              (write-request-log! (assoc log-context :response @events))
              result)
            (catch Exception e
              (write-request-log! (assoc log-context
                                         :response @events
                                         :error    (ex-message e)))
              (throw e))))))))
