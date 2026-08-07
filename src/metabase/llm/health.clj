(ns metabase.llm.health
  "The instance-wide record of which LLM provider connections are currently failing.

  Every path that talks to a provider — listing a connection's models, running the agent loop, a structured call —
  reports what happened here, so a failure discovered by one request is known to the next one. Two things read it:
  the admin provider list, which shows the failure as an error against the connection, and the fallback in
  [[metabase.llm.provider/first-model-ref]], which skips a failing connection when picking what Metabot runs on.

  A failure is *fatal* when the provider answered with a 4xx that says the connection cannot work as configured — a
  rejected key, a model the account cannot reach. Those are recorded until the connection is edited or a later
  request succeeds, because retrying changes nothing. Everything else — a 5xx, a rate limit, a timeout, a refused
  connection — is transient and expires on its own after [[transient-failure-ttl-ms]], so an outage takes the
  connection out of rotation without an admin having to put it back.

  The record lives in memory, so each instance learns from its own traffic. Persisting it would make one node's
  network blip everybody's problem, and the cost of a second node discovering the same failure is one failed
  request."
  (:require
   [metabase.util.log :as log]))

(set! *warn-on-reflection* true)

(def ^:private transient-failure-ttl-ms
  "How long a connection stays recorded as failing after an error that might resolve on its own. Long enough that a
  provider outage does not have every request rediscover it, short enough that recovery needs no intervention."
  (* 5 60 1000))

(def ^:private retryable-statuses
  "4xx statuses that mean \"try again\" rather than \"this connection is misconfigured\"."
  #{408 409 429})

(defonce ^:private failures
  (atom {}))

(defn- now-ms
  []
  (System/currentTimeMillis))

(defn- exception-status
  [e]
  (let [{:keys [status status-code]} (ex-data e)]
    (or status status-code)))

(defn- fatal-status?
  [status]
  (boolean (and (number? status)
                (<= 400 status 499)
                (not (contains? retryable-statuses status)))))

(defn- expired?
  [{:keys [fatal? recorded-at]}]
  (and (not fatal?)
       (< (+ recorded-at transient-failure-ttl-ms) (now-ms))))

(defn failure
  "What `conn-key` last failed with, as `{:message :fatal? :status :recorded-at}`, or nil when it is not currently
  recorded as failing. A transient failure that has outlived [[transient-failure-ttl-ms]] reads as nil."
  [conn-key]
  (when-let [recorded (get @failures conn-key)]
    (when-not (expired? recorded)
      recorded)))

(defn healthy?
  "Whether `conn-key` is free of a recorded failure."
  [conn-key]
  (nil? (failure conn-key)))

(defn record-failure!
  "Record that a request to `conn-key` failed with `message`. `fatal?` says whether the failure is one retrying
  cannot fix; see the namespace docstring."
  [conn-key message fatal?]
  (when conn-key
    (log/warn "LLM provider connection failed"
              {:connection conn-key :fatal? fatal? :error message})
    (swap! failures assoc conn-key {:message     (or message "The provider could not be reached.")
                                    :fatal?      (boolean fatal?)
                                    :recorded-at (now-ms)}))
  nil)

(defn record-exception!
  "Record that a request to `conn-key` failed with `e`, classifying it by the HTTP status the provider answered with."
  [conn-key e]
  (let [status (exception-status e)]
    (when conn-key
      (swap! failures assoc conn-key {:message     (or (ex-message e) "The provider could not be reached.")
                                      :fatal?      (fatal-status? status)
                                      :status      status
                                      :recorded-at (now-ms)})
      (log/warn e "LLM provider connection failed" {:connection conn-key :status status})))
  nil)

(defn record-success!
  "Record that a request to `conn-key` worked, clearing any failure held against it."
  [conn-key]
  (when (and conn-key (contains? @failures conn-key))
    (log/info "LLM provider connection recovered" {:connection conn-key})
    (swap! failures dissoc conn-key))
  nil)

(defn forget!
  "Drop whatever is recorded against `conn-key`, without treating it as a recovery. For a connection that has just
  been edited or removed: what the old credentials did says nothing about the new ones."
  [conn-key]
  (swap! failures dissoc conn-key)
  nil)

(defn forget-all!
  "Drop every recorded failure."
  []
  (reset! failures {})
  nil)
