(ns metabase.ai-tracing.core
  "Eval-time tracing for the AI / Metabot agentic system.

  This layer is **separate from production observability** (`metabase.tracing`). It exists
  to capture rich, complete agent traces *during benchmark/eval runs* so a scorer can read
  the data back — full prompts/completions, tool I/O, and ad-hoc debug spans (search
  internals, health signals).

  ## The separate gate (production safety)

  All ops here are gated on [[*capture*]], a per-run dynamic binding established ONLY by the
  eval entrypoint ([[capturing]]). This is a third axis, orthogonal to `metabase.tracing`'s
  `MB_TRACING_ENABLED` + group gates. Consequences, by design:

    - In production — even with `metabase.tracing` fully enabled — ai-tracing is inert
      (a single nil-check of overhead). Eval spans, which may carry full prompts and verbose
      search internals, can therefore NEVER fire on organic traffic or reach the production
      trace sink. That isolation is the whole point.
    - In an eval run, the harness binds [[*capture*]] (via [[capturing]]) and the spans fire
      regardless of whether production tracing is on.

  ## What it captures

  An in-memory trace tree (`agent.turn → llm.call → tool.*`) with prompts, completions, tool
  I/O, durations, and custom spans. Nesting is tracked through [[*parent*]], a dynamic binding
  Clojure conveys across the agent's virtual-thread tool execution (`bound-fn*`), so concurrent
  tool spans nest under the right parent. The harness reads the tree back via [[capturing]] /
  [[capture-reducible]] (in-process) or the `eval_trace` SSE data part (API path).

  ## Export

  The same tree is also replayed to an external eval backend (Confident AI / Langfuse / Phoenix)
  over OTLP by `metabase.ai-tracing.export` — a DEDICATED provider, isolated from the production
  tracing sink. Opt-in via `MB_AI_EVAL_OTLP_ENDPOINT`; the domain→wire-schema mapping lives in
  one chokepoint there, so swapping vendors never touches call sites."
  (:require
   [metabase.ai-tracing.export :as ai-tracing.export]
   [metabase.ai-tracing.settings :as ai-tracing.settings]
   [metabase.tracing.core :as tracing]))

(set! *warn-on-reflection* true)

;;;; ----------------------------------------- Gate (separate axis) -----------------------------------------

(defn eval-capture-enabled?
  "True when eval-time capture is enabled for this instance via the `MB_AI_EVAL_CAPTURE` env var.
  This is the production toggle: the API entrypoint consults it to decide whether to establish a
  capture binding around an agent run. Off by default — production stays inert."
  []
  (ai-tracing.settings/ai-eval-capture))

(def ^:dynamic *capture*
  "Per-run capture sink: an atom holding the vector of root span maps, or nil.
  Bound ONLY by [[capturing]]. nil ⇒ ai-tracing is inert (the production safety gate)."
  nil)

(def ^:dynamic *parent*
  "The current in-flight span node (an atom), or nil at top level. Conveyed across the
  agent's virtual-thread tool execution via `bound-fn*`, so concurrent tool spans nest
  under the correct parent."
  nil)

(defn capture-active?
  "True when an eval capture is in progress on this thread."
  []
  (some? *capture*))

;;;; ----------------------------------------- In-memory span tree ------------------------------------------

(defn- now-ns ^long [] (System/nanoTime))

(defn- now-epoch-nanos ^long [] (* (System/currentTimeMillis) 1000000))

(defn- new-node [span-type span-name attrs]
  ;; :start-ns (monotonic) drives duration; :start-epoch-nanos (wall clock) drives OTLP replay.
  (atom {:type             span-type
         :name             span-name
         :attributes       (or attrs {})
         :events           []
         :children         []
         :start-ns         (now-ns)
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
  named `span-name` with `attrs`, recording nesting + duration. No-op (just the nil-check)
  unless a capture is active. Errors are recorded as an event and re-thrown."
  [span-type span-name attrs thunk]
  (if-not (capture-active?)
    (thunk)
    (let [node   (new-node span-type span-name attrs)
          parent *parent*]
      (try
        (binding [*parent* node]
          (thunk))
        (catch Throwable t
          (swap! node update :events conj {:event :error :message (ex-message t)})
          (throw t))
        (finally
          (attach! parent (finish-node node)))))))

;;;; ----------------------------------------- Enrichment of current span -----------------------------------

(defn record!
  "Merge `attrs` (namespaced keyword → primitive) onto the current eval span. Use for
  outputs/results/health signals known mid- or post-body. No-op when inactive or outside
  a span."
  [attrs]
  (when (and (capture-active?) *parent* (seq attrs))
    (swap! *parent* update :attributes merge attrs))
  nil)

(defn event!
  "Append a point-in-time `event` map to the current eval span (a retrieval decision, a
  health signal, a notable log line). No-op when inactive or outside a span."
  [event]
  (when (and (capture-active?) *parent*)
    (swap! *parent* update :events conj event))
  nil)

;;;; ----------------------------------------- Span macros --------------------------------------------------

(defmacro eval-span
  "Generic eval-only span. Usable from any subsystem (e.g. `metabase.search` for ranking/
  candidate debug). `attrs` is a map of namespaced keyword → primitive."
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

;;;; ----------------------------------------- Harness entrypoint -------------------------------------------

(defmacro capturing
  "Establish an eval capture for `body` and return `{:result <body value> :trace <root spans>}`.
  The harness MUST fully realize any lazy result (e.g. the `run-agent-loop` reducible) inside
  `body`, otherwise spans created during realization are not captured."
  [& body]
  `(let [sink# (atom [])]
     (binding [*capture* sink#
               *parent*  nil]
       (let [result# (do ~@body)]
         {:result result# :trace @sink#}))))

(defn capture-reducible
  "In-process eval entrypoint. Realizes `reducible` (e.g. the value of
  `metabase.metabot.agent.core/run-agent-loop`) with capture active, collecting every
  reduced item into a vector. Returns `{:result [items…] :trace [root-spans]}`.

    (ai-tracing/capture-reducible (run-agent-loop opts))"
  [reducible]
  (let [{:keys [trace] :as out} (capturing (into [] reducible))]
    (ai-tracing.export/export-trace! trace)
    out))

;;;; ----------------------------------------- OTLP export (re-exported) ------------------------------------

(defn export-trace!
  "Replay a captured eval trace (`roots`) onto the dedicated OTLP eval provider and force-flush.
  Best-effort; no-op when `MB_AI_EVAL_OTLP_ENDPOINT` is unset. Call sites use this so they never
  touch the internal export namespace."
  [roots]
  (ai-tracing.export/export-trace! roots))

(defn shutdown-export!
  "Flush and shut down the dedicated eval OTLP provider, if any."
  []
  (ai-tracing.export/shutdown!))

;;;; ----------------------------------------- Helpers re-exported ------------------------------------------

(def sanitize-sql
  "Re-export of `metabase.tracing.core/best-effort-sanitize-sql` — use for any SQL placed in
  span attributes so values become `?` placeholders."
  tracing/best-effort-sanitize-sql)
