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
   [metabase.ai-tracing.settings :as ai-tracing.settings]))

(set! *warn-on-reflection* true)

;;;; ----------------------------------------- Gate (separate axis) -----------------------------------------

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

(def ^:dynamic *retain-tree*
  "When true, each finished span is also retained in the in-memory tree ([[*capture*]] / its parent's
  `:children`) so an in-process caller can read the whole trace back as a return value (see
  [[capturing]]). Left false on the file-routed path ([[with-eval-session]]): there every span is
  already streamed to its JSONL file on finish and the in-memory tree is never read, so retaining it
  would only pin heap proportional to the whole run. Off by default."
  false)

(def safe-session-id-re
  "A session id becomes BOTH a log-file name (the RoutingAppender's `${ctx:mb-eval-session-id}.jsonl`)
  and a URL path segment on the read endpoint, so it must be filesystem/URL safe: start alphanumeric
  (rejects `.`/`..`), then only alphanumerics / `.` `_` `-` (no `/` ⇒ no path traversal). This is the
  single source of truth — enforced at the mint/supply boundary ([[checked-session-id]], via
  [[with-eval-session]]) AND at the read boundary (`metabase.ai-tracing.api`).

  Anchored with `\\A`/`\\z` so it's an exact, newline-safe match under BOTH `re-matches` (the mint/read
  checks) and `re-find` (Malli's `:re` schema on the `eval[_-]session[_-]id` API params). Without the
  anchors, `re-find` would accept any string merely CONTAINING a safe run (e.g. `../../etc/passwd`)."
  #"\A[A-Za-z0-9][A-Za-z0-9._-]*\z")

(def ^:const max-session-id-length
  "Cap on a supplied session id. It becomes `<id>.jsonl` on disk, so this keeps the filename well
  under the ~255-byte filesystem limit. Also mirrored as a `:max` on the API schemas (defense in
  depth for non-API callers: MCP, direct invocation)."
  200)

(defn checked-session-id
  "Return a safe session id: mint a fresh uuid when `supplied` is nil, otherwise validate it against
  [[safe-session-id-re]] and [[max-session-id-length]]. Throws on a supplied id that isn't safe — the
  id names a file written by the RoutingAppender, so an unsafe value (e.g. `../../etc/x`) or an
  over-long one (which would fail filesystem creation and silently drop the trace) must never reach
  it. We throw rather than silently substituting a uuid so a caller that named a trace file gets an
  error instead of a trace it can't find."
  ^String [supplied]
  (if (nil? supplied)
    (str (random-uuid))
    (let [id (str supplied)]
      (when-not (re-matches safe-session-id-re id)
        (throw (ex-info "Invalid eval-session-id: must start alphanumeric and contain only [A-Za-z0-9._-]"
                        {:session-id id})))
      (when (> (count id) max-session-id-length)
        (throw (ex-info (str "Invalid eval-session-id: must be at most " max-session-id-length " characters")
                        {:session-id-length (count id)})))
      id)))

(defn capture-active?
  "True when an eval capture is in progress on this thread."
  []
  (some? *capture*))

;;;; ----------------------------------------- In-memory span tree ------------------------------------------

(defn- now-ns ^long [] (System/nanoTime))

(defn- now-epoch-ms ^long [] (System/currentTimeMillis))

(defn- new-node [span-type span-name attrs parent-id]
  ;; :start-ns (monotonic) drives duration; :start-epoch-ms (wall clock) drives the log line.
  (atom {:type           span-type
         :name           span-name
         :id             (str (random-uuid))
         :parent-id      parent-id
         :attributes     (or attrs {})
         :events         []
         :children       []
         :start-ns       (now-ns)
         :start-epoch-ms (now-epoch-ms)}))

(defn- finish-node [node]
  ;; one deref ⇒ a consistent snapshot (duration, start, and :children all from the same state).
  (let [{:keys [start-ns start-epoch-ms] :as snapshot} @node
        dur-ns (- (now-ns) start-ns)]
    (-> snapshot
        (assoc :duration-ms (/ (double dur-ns) 1e6)
               ;; wall-clock end derived from the monotonic duration (no second, possibly
               ;; backward-jumping clock read); ms-granular — sub-ms precision is in :duration-ms.
               :end-epoch-ms (+ (long start-epoch-ms) (Math/round (/ (double dur-ns) 1e6))))
        (dissoc :start-ns))))

(defn- attach! [parent finished]
  ;; Only build the in-memory tree when a caller will read it back ([[capturing]]). On the file-routed
  ;; path emit! has already streamed this span, so retaining it here would pin heap for the whole run.
  ;; swap! is atomic, so concurrent tool spans appending to the same parent are safe.
  (when *retain-tree*
    (if parent
      (swap! parent update :children conj finished)
      (swap! *capture* conj finished))))

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
          ;; Capture class + ex-data, not just the message: agent-validation `ex-info`s carry their
          ;; signal in ex-data and a bare NPE has a nil message. The log sink JSON-safe-coerces
          ;; :data, so a non-encodable value here never breaks emission.
          (swap! node update :events conj {:event   :error
                                           :message (ex-message t)
                                           :class   (.getName (class t))
                                           :data    (ex-data t)})
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

;;;; ----------------------------------------- Span macros --------------------------------------------------

(defmacro spanning
  "Implementation detail of the span macros below — not intended for direct use (it must be public
  only so the public span macros can expand to it from other namespaces).

  Runs `body` directly when no capture is live (the production no-op), else inside a captured span.
  Guarding `capture-active?` HERE — ahead of the `eval-span*` call — means `span-name`/`attrs` are
  only constructed when a capture is active, so organic traffic never builds the span name string or
  the attrs map (it pays only the `*capture*` nil-check). `body` is emitted once, behind a `thunk#`,
  so a large body isn't duplicated into both branches; the disabled path's only residual cost is that
  one small closure."
  {:style/indent 3}
  [span-type span-name attrs & body]
  `(let [thunk# (^:once fn* [] ~@body)]
     (if (capture-active?)
       (eval-span* ~span-type ~span-name ~attrs thunk#)
       (thunk#))))

(defmacro eval-span
  "Generic eval-only span. Usable from any subsystem. `attrs` is a map of namespaced keyword → value."
  {:style/indent 2}
  [span-name attrs & body]
  `(spanning :span ~span-name ~attrs ~@body))

(defmacro with-agent-turn
  "Root span for one agentic turn."
  {:style/indent 1}
  [attrs & body]
  `(spanning :turn "agent.turn" ~attrs ~@body))

(defmacro with-llm-call
  "Span around one LLM round-trip. Record the completion/usage via [[record!]] once known."
  {:style/indent 1}
  [attrs & body]
  `(spanning :llm "llm.call" ~attrs ~@body))

(defmacro with-tool-call
  "Span around one tool invocation. Expects `:ai/tool-name` in `attrs`."
  {:style/indent 1}
  [attrs & body]
  ;; Can't route through `spanning`: the span name derives from `attrs`, and we want `attrs` built
  ;; only when a capture is active AND only once (not twice — for the name and for the span). So we
  ;; inline the gate and bind `attrs#` inside the active branch. Tool calls run on the organic agent
  ;; path, so keeping this build behind `capture-active?` is the point.
  `(let [thunk# (^:once fn* [] ~@body)]
     (if (capture-active?)
       (let [attrs# ~attrs]
         (eval-span* :tool (str "tool." (:ai/tool-name attrs#)) attrs# thunk#))
       (thunk#))))

;;;; ----------------------------------------- Entrypoints --------------------------------------------------

(defmacro with-eval-session
  "Generic eval-session entrypoint. When capture is enabled and not already active, establish a
  FRESH capture: bind [[*capture*]] (the in-memory tree), [[*session-id*]] (a [[checked-session-id]]
  of `supplied-id`, or a fresh uuid), and reset [[*parent*]] to nil. When already [[capture-active?]],
  INHERIT the outer bindings (nesting). Inert (body only) when eval-capture is disabled. Throws if
  `supplied-id` is present but not [[safe-session-id-re]] (it names a file — no path traversal).

  Session-id is minted eagerly here so callers can read [[*session-id*]] before the first span.

    (with-eval-session nil          (with-agent-turn {…} …))   ; agent loop — mint
    (with-eval-session mcp-session  (eval-span \"mcp.tools/call\" {…} …))   ; MCP — supplied"
  {:style/indent 1}
  [supplied-id & body]
  `(cond
     (capture-active?)                     (do ~@body)   ; inherit / nest
     (ai-tracing.settings/ai-eval-capture) (binding [*capture*    (atom [])
                                                     *session-id* (checked-session-id ~supplied-id)
                                                     *parent*     nil]
                                             ~@body)
     :else                                 (do ~@body))) ; inert

(defmacro capturing
  "In-process capture, UNCONDITIONAL (ignores the gate). Establishes a fresh capture that RETAINS the
  span tree ([[*retain-tree*]]) and returns `{:result <body value> :trace <root spans>}`. Used by
  [[capture-reducible]] and tests. The harness must fully realize any lazy result inside `body`.

  This path is RETURN-VALUE-based, not file-routed: the trace comes back as `:trace`. It deliberately
  does NOT mint a session id — [[*session-id*]] is left as-is (nil at top level), so
  [[metabase.ai-tracing.log/emit!]] no-ops and NO `<id>.jsonl` is written; read `:trace` instead. A
  session id supplied to an inner [[with-eval-session]] (e.g. `:eval-session-id` threaded through
  `run-agent-loop`) is IGNORED — capture is already active, so the inner form inherits these bindings
  rather than re-minting. (A capture nested inside a live file-routed session inherits that session
  and still streams to its file.)"
  [& body]
  `(let [sink# (atom [])]
     (binding [*capture*     sink#
               *parent*      nil
               *retain-tree* true]
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
