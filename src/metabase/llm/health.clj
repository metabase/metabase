(ns metabase.llm.health
  "The instance-wide record of which LLM provider connections are currently failing.

  Every path that talks to a provider — listing a connection's models, running the agent loop, a structured call —
  reports what happened here, so a failure discovered by one request is known to the next one. Two things read it:
  the admin provider list, which shows the failure as an error against the connection, and the fallback in
  [[metabase.llm.provider/first-model-ref]], which skips a failing connection when picking what Metabot runs on.

  A failure is *fatal* when the provider answered with a status that says the connection cannot work as configured —
  a rejected key, an account that cannot pay, a model the account cannot reach — or when an adapter refused the
  connection's own configuration before asking the provider anything. Those are recorded until the
  connection is edited or a later inference succeeds, because retrying changes nothing. A 5xx, a rate limit, a
  timeout or a refused connection is transient and expires on its own after [[transient-failure-ttl-ms]], so an
  outage takes the connection out of rotation without an admin having to put it back.

  Any other 4xx is about the request rather than the connection — providers answer a prompt longer than the model's
  context window with a 400 — and is not recorded at all: the next request may well fit, and recording it would let
  one long conversation take the connection away from everybody else.

  Only inference clears a failure. Listing a provider's models can record one — a rejected key rejects the listing
  too — but a listing that works proves nothing about inference: a provider can serve its catalog to an account it
  will not run a request for.

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

(def ^:private fatal-statuses
  "Statuses that say the connection cannot work as configured: a rejected key, an account that cannot pay, a model
  or endpoint the account cannot reach."
  #{401 402 403 404})

(def ^:private retryable-statuses
  "4xx statuses that mean \"try again\" rather than anything about the request or the connection."
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

(defn fatal-status?
  "Whether an HTTP `status` from a provider says the connection cannot work as configured, rather than that this
  one request happened to fail; see the namespace docstring."
  [status]
  (contains? fatal-statuses status))

(defn- request-rejected-status?
  "Whether an HTTP `status` from a provider rejects the one request rather than saying anything about the connection;
  see the namespace docstring."
  [status]
  (and (number? status)
       (<= 400 status 499)
       (not (fatal-status? status))
       (not (contains? retryable-statuses status))))

(def ^:private unreachable-exceptions
  [java.net.ConnectException java.net.NoRouteToHostException java.net.UnknownHostException
   java.net.SocketTimeoutException java.net.http.HttpTimeoutException])

(defn- unreachable?
  [e]
  (some (fn [^Throwable t] (some #(instance? % t) unreachable-exceptions))
        (take 10 (take-while some? (iterate #(.getCause ^Throwable %) e)))))

(defn misconfigured?
  "Whether `e` is an adapter refusing its own configuration, such as a disabled service account or an unknown region,
  rather than a provider's answer. Adapters tag those `:status-code`; only a provider's answer carries `:status`."
  [e]
  (let [{:keys [status status-code]} (ex-data e)]
    (boolean (and (nil? status)
                  (number? status-code)
                  (<= 400 status-code 499)
                  (not (contains? retryable-statuses status-code))
                  (not (unreachable? e))))))

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
  "Record that a request to `conn-key` failed with `e`, classifying it by the HTTP status the provider answered with.
  A status that rejects the request itself records nothing; an adapter refusing the connection's own configuration
  (see [[misconfigured?]]) is fatal."
  [conn-key e]
  (let [status         (exception-status e)
        misconfigured? (misconfigured? e)]
    (when (and conn-key (not (request-rejected-status? (:status (ex-data e)))))
      (swap! failures assoc conn-key {:message     (or (ex-message e) "The provider could not be reached.")
                                      :fatal?      (or misconfigured? (fatal-status? status))
                                      :status      status
                                      :recorded-at (now-ms)})
      ;; the message, not the throwable: its ex-data deliberately carries the raw response body — kept out of
      ;; 401/403 messages precisely because it can echo the credential — and rendering `e` would log it anyway
      (log/warn "LLM provider connection failed"
                {:connection conn-key :status status :error (ex-message e)})))
  nil)

(defn record-success!
  "Record that an inference request to `conn-key` worked, clearing any failure held against it. The only thing
  besides the transient timeout that clears one; see the namespace docstring."
  [conn-key]
  (when (and conn-key (contains? @failures conn-key))
    (log/info "LLM provider connection recovered" {:connection conn-key})
    (swap! failures dissoc conn-key))
  nil)

(defn forget-superseded!
  "Drop what is recorded for every key whose value in `old` the `new` map does not repeat, treating neither as a
  recovery. `old` and `new` describe how connections were configured before and after a write: a connection that
  was edited or removed is one nothing is known about any more, while one that only moved in the list is still the
  same connection and keeps whatever it was doing."
  [old new]
  (doseq [[conn-key configuration] old
          :when (not= configuration (get new conn-key))]
    (swap! failures dissoc conn-key))
  nil)
