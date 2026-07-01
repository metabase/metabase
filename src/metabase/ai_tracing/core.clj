(ns metabase.ai-tracing.core
  "Eval-time tracing for the AI / Metabot agentic system.

  This layer is **separate from production observability** (`metabase.tracing`). It exists
  to capture rich, complete agent traces *during benchmark/eval runs* so a scorer can read
  the data back — full prompts/completions, tool I/O, and ad-hoc debug spans.

  ## The separate gate (production safety)

  All ops here are gated on [[*capture*]], a per-run dynamic binding established ONLY by the
  eval entrypoints ([[with-eval-session]] / [[capturing]]). It is orthogonal to
  `metabase.tracing`'s `MB_TRACING_ENABLED` + group gates:

    - In production — even with `metabase.tracing` fully enabled — ai-tracing does no work:
      each span's body runs behind a nil-check on [[*capture*]] (the span macros still build
      their `span-name`/`attrs` args, which just reference already-computed values). Eval spans,
      which carry full prompts and verbose internals, can NEVER fire on organic traffic.
      `MB_AI_EVAL_CAPTURE` is off by default.
    - In an eval run, an entrypoint binds [[*capture*]] and the spans fire.

  ## What it captures

  An in-memory span tree (`agent.turn → llm.call → tool.*`, or `mcp.<method> → …`) with full
  attributes, durations, and events. Nesting + the session id are tracked through dynamic
  bindings ([[*parent*]], [[*session-id*]]) that Clojure conveys across the agent's
  virtual-thread tool execution (`bound-fn*`), so concurrent tool spans nest correctly.

  ## Session id (the OTel trace-id analog)

  [[*session-id*]] groups all of a run's spans and names its log file. It is minted at the root
  of a fresh capture, or *supplied* by the caller (e.g. MCP passes its `Mcp-Session-Id`), so a
  multi-request MCP conversation all lands in one file.

  ## Sink

  Each span, on finish, is streamed as one JSON line to the dedicated `metabase.ai-tracing.log`
  logger (off by default), routed per-session to its own JSONL file. See
  `metabase.ai-tracing.log`."
  (:require
   [metabase.ai-tracing.log :as ai-tracing.log]
   [metabase.ai-tracing.settings :as ai-tracing.settings]
   [metabase.tracing.core :as tracing]))

(set! *warn-on-reflection* true)

;;;; ----------------------------------------- Gate (separate axis) -----------------------------------------

(defn eval-capture-enabled?
  "True when eval-time capture is enabled for this instance via the `MB_AI_EVAL_CAPTURE` env var.
  Entrypoints consult it to decide whether to establish a capture. Off by default."
  []
  (ai-tracing.settings/ai-eval-capture))

(def ^:dynamic *capture*
  "Per-run capture sink: an atom holding the vector of root span maps, or nil.
  Bound ONLY by an entrypoint. nil ⇒ ai-tracing is inert (the production safety gate)."
  nil)

(def ^:dynamic *parent*
  "The current in-flight span node (an atom), or nil at top level. Conveyed across the
  agent's virtual-thread tool execution via `bound-fn*`, so concurrent tool spans nest
  under the correct parent."
  nil)

(def ^:dynamic *session-id*
  "The eval session id (OTel trace-id analog). Minted at the root of a fresh capture, or supplied
  by the caller (e.g. MCP's `Mcp-Session-Id`). Conveyed across virtual threads via `bound-fn*`;
  drives the per-session log file routing."
  nil)

(defn capture-active?
  "True when an eval capture is in progress on this thread."
  []
  (some? *capture*))

;;;; ----------------------------------------- In-memory span tree ------------------------------------------

(defn- now-ns ^long [] (System/nanoTime))

(defn- now-epoch-nanos ^long [] (* (System/currentTimeMillis) 1000000))

(defn- new-node [span-type span-name attrs parent-id]
  ;; :start-ns (monotonic) drives duration; :start-epoch-nanos (wall clock) drives the log line.
  (atom {:type              span-type
         :name              span-name
         :id                (str (random-uuid))
         :parent-id         parent-id
         :attributes        (or attrs {})
         :events            []
         :children          []
         :start-ns          (now-ns)
         :start-epoch-nanos (now-epoch-nanos)}))

(defn- finish-node [node]
  (let [start  (:start-ns @node)
        dur-ns (- (now-ns) start)]
    (-> @node
        (assoc :duration-ms     (/ (double dur-ns) 1e6)
               :end-epoch-nanos (+ (long (:start-epoch-nanos @node)) dur-ns))
        (dissoc :start-ns))))

(defn- attach! [parent finished]
  ;; swap! is atomic, so concurrent tool spans appending to the same parent are safe.
  (if parent
    (swap! parent update :children conj finished)
    (swap! *capture* conj finished)))

(defn eval-span*
  "Functional core behind the span macros. Runs `thunk` inside a captured span of `span-type`
  named `span-name` with `attrs`, recording nesting + duration, attaching the finished node to
  the tree, and streaming it to the log sink. No-op (just the nil-check) unless a capture is
  active. Errors are recorded as an event and re-thrown."
  [span-type span-name attrs thunk]
  (if-not (capture-active?)
    (thunk)
    (let [parent *parent*
          node   (new-node span-type span-name attrs (when parent (:id @parent)))]
      (try
        (binding [*parent* node]
          (thunk))
        (catch Throwable t
          (swap! node update :events conj {:event :error :message (ex-message t)})
          (throw t))
        (finally
          (let [finished (finish-node node)]
            (attach! parent finished)
            ;; Stream this span as one JSONL line. Runs on whatever thread the span finished on
            ;; (incl. tool virtual threads) — *session-id* is conveyed there by `bound-fn*`.
            (ai-tracing.log/emit! finished *session-id*)))))))

;;;; ----------------------------------------- Enrichment of current span -----------------------------------

(defn record!
  "Merge `attrs` (namespaced keyword → value) onto the current eval span. Use for
  outputs/results/health signals known mid- or post-body. No-op when inactive or outside a span."
  [attrs]
  (when (and (capture-active?) *parent* (seq attrs))
    (swap! *parent* update :attributes merge attrs))
  nil)

(defn event!
  "Append a point-in-time `event` map to the current eval span (a retrieval decision, a health
  signal, a notable log line). No-op when inactive or outside a span."
  [event]
  (when (and (capture-active?) *parent*)
    (swap! *parent* update :events conj event))
  nil)

;;;; ----------------------------------------- Span macros --------------------------------------------------

(defmacro eval-span
  "Generic eval-only span. Usable from any subsystem. `attrs` is a map of namespaced keyword → value."
  {:style/indent 2}
  [span-name attrs & body]
  `(eval-span* :span ~span-name ~attrs (^{:once true} fn* [] ~@body)))

(defmacro with-agent-turn
  "Root span for one agentic turn."
  {:style/indent 1}
  [attrs & body]
  `(eval-span* :turn "agent.turn" ~attrs (^{:once true} fn* [] ~@body)))

(defmacro with-llm-call
  "Span around one LLM round-trip. Record the completion/usage via [[record!]] once known."
  {:style/indent 1}
  [attrs & body]
  `(eval-span* :llm "llm.call" ~attrs (^{:once true} fn* [] ~@body)))

(defmacro with-tool-call
  "Span around one tool invocation. Expects `:ai/tool-name` in `attrs`."
  {:style/indent 1}
  [attrs & body]
  `(let [attrs# ~attrs]
     (eval-span* :tool (str "tool." (:ai/tool-name attrs#)) attrs#
                 (^{:once true} fn* [] ~@body))))

;;;; ----------------------------------------- Entrypoints --------------------------------------------------

(defmacro with-eval-session
  "Generic eval-session entrypoint. When capture is enabled and not already active, establish a
  FRESH capture: bind [[*capture*]] (the in-memory tree), [[*session-id*]] (use `supplied-id` or
  mint a fresh uuid), and reset [[*parent*]] to nil. When already [[capture-active?]], INHERIT the
  outer bindings (nesting). Inert (body only) when eval-capture is disabled.

  Session-id is minted eagerly here so callers can read [[*session-id*]] before the first span.

    (with-eval-session nil          (with-agent-turn {…} …))   ; agent loop — mint
    (with-eval-session mcp-session  (eval-span \"mcp.tools/call\" {…} …))   ; MCP — supplied"
  {:style/indent 1}
  [supplied-id & body]
  `(let [supplied# ~supplied-id]
     (cond
       (capture-active?)       (do ~@body)            ; inherit / nest
       (eval-capture-enabled?) (binding [*capture*    (atom [])
                                         *session-id* (or supplied# (str (random-uuid)))
                                         *parent*     nil]
                                 ~@body)
       :else                   (do ~@body))))         ; inert

(defmacro capturing
  "In-process capture, UNCONDITIONAL (ignores the gate). Establishes a fresh capture, mints a
  session id if none is bound, and returns `{:result <body value> :trace <root spans>}`. Used by
  [[capture-reducible]] and tests. The harness must fully realize any lazy result inside `body`."
  [& body]
  `(let [sink# (atom [])]
     (binding [*capture*    sink#
               *parent*     nil
               *session-id* (or *session-id* (str (random-uuid)))]
       ;; bind result# in a let so the body (which populates sink#) is forced BEFORE @sink#
       (let [result# (do ~@body)]
         {:result result# :trace @sink#}))))

(defn capture-reducible
  "In-process eval entrypoint. Realizes `reducible` (e.g. the value of
  `metabase.metabot.agent.core/run-agent-loop`) with capture active, collecting every reduced item
  into a vector. Returns `{:result [items…] :trace [root-spans]}`.

    (ai-tracing/capture-reducible (run-agent-loop opts))"
  [reducible]
  (capturing (into [] reducible)))

;;;; ----------------------------------------- Helpers re-exported ------------------------------------------

(def sanitize-sql
  "Re-export of `metabase.tracing.core/best-effort-sanitize-sql` — use for any SQL placed in
  span attributes so values become `?` placeholders."
  tracing/best-effort-sanitize-sql)
