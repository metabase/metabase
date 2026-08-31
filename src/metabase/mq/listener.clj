(ns metabase.mq.listener
  "Listener registry: registration, lookup, and the `def-listener!` macro.

  A listener is the consumer-side wiring for a queue — just the handler fn. Everything else
  about a queue (its broker-side properties, batch size, dedup) is declared on the queue via
  [[metabase.mq.queue.registry/def-queue!]], which takes effect on every node regardless of
  whether a listener is registered locally. A listener for a queue requires that queue to be
  declared first."
  (:require
   [metabase.mq.queue.registry :as q.registry]
   [metabase.util.log :as log]
   [metabase.util.malli.registry :as mr]))

(set! *warn-on-reflection* true)

(def ^:dynamic *listeners*
  "channel → {:listener fn} for all channels."
  (atom {}))

(defn queue-names
  "Returns the seq of queue channel names currently registered in `*listeners*`."
  []
  (filter #(= "queue" (namespace %)) (keys @*listeners*)))

(defn get-listener
  "Returns the listener config map for `channel`, or nil if not registered."
  [channel]
  (get @*listeners* channel))

(defn- assert-queue-declared!
  "Throws if `channel` is a queue channel whose queue has not been declared via
  [[q.registry/def-queue!]] — catching missing-queue typos at startup rather than at first publish."
  [channel]
  (when (and (= "queue" (namespace channel))
             (nil? (q.registry/get-queue channel)))
    (throw (ex-info (str "No queue declared for " channel
                         " — declare it with `def-queue!` before registering a listener.")
                    {:channel channel
                     :known-queues (set (keys @q.registry/*queues*))}))))

(defn- register-listener!
  "Atomically registers a listener for the given channel. Throws if a listener is already
  registered for the channel."
  [channel listener-map]
  (assert-queue-declared! channel)
  (let [[old _] (swap-vals! *listeners*
                            (fn [m]
                              (if (contains? m channel)
                                m
                                (assoc m channel listener-map))))]
    (when (contains? old channel)
      (throw (ex-info (str "Listener already registered for " (namespace channel) " " (name channel))
                      {:channel channel})))))

(defn register-declared-listener!
  "Registers `listener-map` for `channel`, replacing any existing registration. An implementation
  detail of [[def-listener!]] — public only so the macro expansion can call it."
  [channel listener-map]
  (assert-queue-declared! channel)
  (swap! *listeners* assoc channel listener-map)
  nil)

(defn batch-listen!
  "Low-level listener registration. Prefer [[def-listener!]] for production code — the macro
   is the supported way to wire a handler so it gets activated through `register-listeners!`
   at the correct point in startup.

   Use this directly only when you need a runtime-dynamic registration (e.g. plugins, ad-hoc
   tests). The listener is invoked with a vec of messages, sized up to the queue's
   `:max-batch-messages`."
  [channel listener]
  (register-listener! channel {:listener listener}))

(defn unlisten!
  "Removes the listener for a channel."
  [channel]
  (swap! *listeners* dissoc channel))

(mr/def ::channel
  [:and :keyword [:fn {:error/message "Channel must be namespaced to 'queue'"}
                  #(= "queue" (namespace %))]])

(defmulti def-listener*
  "Multimethod backing [[def-listener!]]."
  {:arglists '([channel])}
  identity)

(defonce ^{:doc "channel → symbol of the namespace whose `def-listener!` declaration owns it.
  The load-time ownership ledger behind [[claim-listener-declaration!]]. `defonce` so reloading
  this namespace doesn't orphan existing claims. Deliberately not test-rebound like [[*listeners*]]:
  a claim is a fact about the source code, not about a running mq instance."}
  listener-declaration-sites
  (atom {}))

(defn claim-listener-declaration!
  "Records `ns-symb` as the declaration site that owns the listener for `channel`. An implementation
  detail of [[def-listener!]] — like [[register-declared-listener!]], public only so the macro
  expansion can call it.

  Re-claiming from the same namespace is a no-op, so reloading a declaring namespace is always
  legal. A *different* namespace claiming an already-claimed channel throws, at load time: each
  declaration installs a [[def-listener*]] method for its channel, so duplicates would silently
  clobber each other and which handler won would depend on load order.

  If a declaration has genuinely moved between namespaces, evict the stale claim from the REPL
  with `(swap! metabase.mq.listener/listener-declaration-sites dissoc <channel>)`, or restart."
  [channel ns-symb]
  (let [[old _] (swap-vals! listener-declaration-sites
                            (fn [m] (if (contains? m channel)
                                      m
                                      (assoc m channel ns-symb))))]
    (when-let [existing (get old channel)]
      (when (not= existing ns-symb)
        ;; not i18n'ed because this is developer-facing only.
        (throw (ex-info (format (str "A listener for %s is already declared in %s. A listener has exactly one "
                                     "declaration site; if you've moved it, remove the old claim with "
                                     "(swap! metabase.mq.listener/listener-declaration-sites dissoc %s) or restart.")
                                channel existing channel)
                        {:channel channel :existing-site existing :new-site ns-symb}))))))

(defmacro def-listener!
  "Declares a listener for a queue.

   The queue itself must already be declared via `def-queue!` — that's where batch size,
   exclusivity, and dedup live. The listener body receives a vec of messages; for per-message
   handling write `(doseq [m messages] ...)` inside the body. Queue channels are namespaced
   `:queue/*`.

   Examples:

       (mq/def-queue! :queue/simple-task {:transactional :try})
       (mq/def-listener! :queue/simple-task [messages]
         (doseq [msg messages] (process msg)))

       (mq/def-queue! :queue/search-reindex {:transactional :require :exclusive true :max-batch-messages 50})
       (mq/def-listener! :queue/search-reindex [messages]
         (process-batch messages))

   A listener has exactly one declaration site: reloading the declaring namespace is fine (and
   its latest handler wins on the next `register-listeners!`), but a second namespace declaring
   a listener for the same channel throws at load time — see [[claim-listener-declaration!]]."
  {:arglists '([channel bindings & body])}
  [channel bindings & body]
  `(do
     (claim-listener-declaration! ~channel '~(ns-name *ns*))
     (defmethod def-listener* ~channel [~'_]
       (register-declared-listener! ~channel {:listener (fn [~@bindings] ~@body)}))))

(defn register-listeners!
  "Call all [[def-listener!]] implementations to register their listeners.
   Called at startup and in test setup (from `with-test-mq`).
   Idempotent: each run replaces any listeners already registered for the declared channels, so
   a second `mq.init/start!` against the same root [[*listeners*]] atom (a REPL where a dev
   server is already up, or a namespace refresh that re-runs test initialization) succeeds and
   installs the latest declared handlers.
   Throws on the first registration failure so broken listeners are caught early."
  []
  (doseq [[k f] (methods def-listener*)]
    (try
      (f k)
      (catch Throwable e
        (log/errorf "Failed to register listener %s: %s" k (ex-message e))
        (throw (ex-info (str "Failed to register listener " k)
                        {:channel k}
                        e))))))
