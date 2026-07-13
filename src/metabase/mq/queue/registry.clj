(ns metabase.mq.queue.registry
  "Queue registry. Holds [[*queues*]] (declared queues and their broker-side properties) and
  the [[def-queue!]] macro for populating it.

  Queues exist independently of any listener so publishers can route to them from anywhere
  in the cluster. Backends use this registry at startup to pre-arrange broker-side resources
  (e.g. RabbitMQ queue declarations) for the full set of known queues."
  (:require
   [metabase.util.malli.humanize :as mu.humanize]
   [metabase.util.malli.registry :as mr]))

(set! *warn-on-reflection* true)

(def default-max-batch-messages
  "Default `:max-batch-messages` for a queue that doesn't declare one. This is a *soft* target for how
  many messages are coalesced into one stored batch (and handed to the handler per invocation), not a
  hard cap: the async coalescing buffer will happily exceed it under load, since we'd rather send one
  fuller over-the-wire batch than several small ones. Listeners must therefore not assume a batch is
  no larger than this."
  100)

(def transactional-modes
  "Valid values for a queue's required `:transactional` setting.

    `:require` — publishes must happen inside a DB transaction (throws otherwise). Messages are
                 written to the `queue_message_outbox` table as part of that transaction and only
                 handed to the backend after it commits — so a message is published iff the
                 business write that produced it commits.
    `:try`     — same outbox behavior when a transaction is active; publishes immediately when not.
    `:never`   — never use the outbox table; publish immediately (deferred to after-commit when in
                 a transaction, but kept only in memory)."
  #{:require :try :never})

(mr/def :metabase.mq.queue/queue-name
  [:and :qualified-keyword
   [:fn {:error/message "queue name must be namespaced to 'queue' (e.g. :queue/my-task)"}
    #(= "queue" (namespace %))]])

(mr/def :metabase.mq.queue/queue-config
  [:map {:closed true}
   [:transactional      (into [:enum {:error/message (str "must be one of " transactional-modes)}]
                              transactional-modes)]
   [:exclusive          {:optional true} :boolean]
   [:max-batch-messages {:optional true} pos-int?]
   [:dedup-fn           {:optional true} fn?]])

(def ^:dynamic *queues*
  "queue-name (keyword) → config map for every declared queue.

  Test fixtures rebind this to a fresh atom so test-defined queues don't leak across
  scenarios. Production code uses the root binding."
  (atom {}))

(defn get-queue
  "Returns the config map for `queue-name`, or nil if no such queue has been declared."
  [queue-name]
  (get @*queues* queue-name))

(defn queue-names
  "Returns the seq of currently-declared queue names."
  []
  (keys @*queues*))

(defn- validate-config!
  [queue-name config]
  (when-let [error (mr/explain :metabase.mq.queue/queue-config config)]
    (throw (ex-info (str "Invalid config for queue " queue-name ": " (mu.humanize/humanize error))
                    {:queue queue-name :config config :errors (mu.humanize/humanize error)}))))

(defn register-queue!
  "Atomically registers `config` for `queue-name`. Re-registering with identical config is
  a no-op (handy for repeated `register-queues!` calls in tests); mismatched config throws.

  `config` must satisfy [[:metabase.mq.queue/queue-config]]. Invalid config throws."
  [queue-name config]
  (let [config (or config {})]
    (validate-config! queue-name config)
    (let [[old _] (swap-vals! *queues*
                              (fn [m] (if (contains? m queue-name)
                                        m
                                        (assoc m queue-name config))))]
      (when-let [existing (get old queue-name)]
        (when (not= existing config)
          (throw (ex-info (str "Queue " queue-name " is already registered with different config.")
                          {:queue    queue-name
                           :existing existing
                           :new      config})))))))

(defn exclusive?
  "Returns true if `queue-name` is declared with `:exclusive true`."
  [queue-name]
  (boolean (:exclusive (get @*queues* queue-name))))

(defn max-batch-messages
  "Returns the `:max-batch-messages` declared for `queue-name`, or [[default-max-batch-messages]]."
  [queue-name]
  (or (:max-batch-messages (get @*queues* queue-name)) default-max-batch-messages))

(defn dedup-fn
  "Returns the `:dedup-fn` declared for `queue-name`, or nil if none."
  [queue-name]
  (:dedup-fn (get @*queues* queue-name)))

(defn transactional
  "Returns the `:transactional` mode (`:require`/`:try`/`:never`) declared for `queue-name`, or nil
  if no such queue has been declared."
  [queue-name]
  (:transactional (get @*queues* queue-name)))

(defn exclusive-queue-names
  "Returns the set of queue names (as strings) declared with `:exclusive true`."
  []
  (into #{}
        (comp (filter (fn [[_k v]] (:exclusive v)))
              (map (fn [[k _v]] (name k))))
        @*queues*))

(defmulti def-queue*
  "Multimethod backing [[def-queue!]]. Each `(def-queue! :queue/foo …)` adds a method here;
  [[register-queues!]] iterates them at startup to populate `*queues*`."
  {:arglists '([queue-name])}
  identity)

(defmacro def-queue!
  "Declares a queue with its broker-side configuration. Queues exist independently of any
  listener — a publisher can route to a queue declared anywhere in the codebase, and a
  listener for that queue can live on a different node.

  Config is required and must include `:transactional`.

  Required config key:
    `:transactional`      — `:require` / `:try` / `:never`; see [[transactional-modes]]. Controls
                            whether publishes are routed through the transactional
                            `queue_message_outbox` so a message is published iff the business
                            transaction that produced it commits.
                            SEE PERFORMANCE NOTE BELOW

  Optional config keys:
    `:exclusive`          — when true, at most one batch for this queue is in-flight cluster-wide.
    `:max-batch-messages` — soft target batch size for this queue (defaults to
                            [[default-max-batch-messages]]). Used at publish time (coalescing) and
                            consume time (slicing).
    `:dedup-fn`           — `messages -> messages` applied at publish time to drop duplicates
                            from a batch before it is buffered.

  These are all properties of the queue itself — they take effect at publish time, on every
  node, regardless of whether a listener is registered locally.

  PERFORMANCE NOTE ON `:transactional`:
  When messages are sent transactionally (required or try with an active transaction), the batched messages are
  IMMEDIATELY sent as part of the transaction boundary. It does not use the sliding-time-window publish buffer
  that non-transactional delivery can use to batch messages across transactions under high load.
  If you are sending messages which have a risk of generating a storm of messages, consider using `:never` to
  improve performance but at the expense of potentially losing messages.

  Examples:

      (mq/def-queue! :queue/simple-task {:transactional :try})

      (mq/def-queue! :queue/search-reindex {:transactional :require :exclusive true :max-batch-messages 50})"
  {:arglists '([queue-name config])}
  [queue-name & [config]]
  `(defmethod def-queue* ~queue-name [~'_]
     (register-queue! ~queue-name ~config)))

(defn register-queues!
  "Realizes every [[def-queue!]] declaration into [[*queues*]]. Called at startup before
  the backend is started and before listeners are registered, so backends can pre-arrange
  broker-side resources for the full set of known queues."
  []
  (doseq [[k f] (methods def-queue*)]
    (try
      (f k)
      (catch Throwable e
        (throw (ex-info (str "Failed to register queue " k) {:queue k} e))))))
