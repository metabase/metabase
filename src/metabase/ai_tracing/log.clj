(ns metabase.ai-tracing.log
  "File-based JSONL sink for eval traces.

  One JSON object per span is emitted on THIS dedicated logger (`metabase.ai-tracing.log` — the
  logger name equals the namespace), routed per-session to its own `<session-id>.jsonl` file by a
  Log4j2 `RoutingAppender` keyed on the `mb-eval-session-id` ThreadContext value.

  Each line is the message only (the appender uses `%m%n`), so the file is pure JSONL: an external
  script joins lines by `:session` and rebuilds the tree by chaining `:id`/`:parent`.

  `:start-epoch-ns`/`:end-epoch-ns` are wall-clock epoch nanoseconds (millisecond-granular — the
  source is `currentTimeMillis`), NOT `System/nanoTime`; `:dur-ms` carries the precise monotonic
  duration.

  The single on/off switch is `MB_AI_EVAL_CAPTURE` (off by default): [[emit!]] is only reached while
  a capture is active, so on a normal instance this logger writes nothing even though it sits at
  INFO. (`resources/log4j2.xml` also lets you set the logger to `off` as a hard kill.) Traces contain
  full, unredacted user content — intended for dedicated eval instances only.

  Retention is the operator's responsibility. Files are append-only with no rollover, no size cap,
  and no expiry — a long session grows unbounded, and re-running the same session id appends to the
  same file. The `RoutingAppender`'s IdlePurgePolicy only reclaims idle *appenders* (open file
  handles), never the files on disk. An eval host should periodically prune
  `${logfile.path}/eval-traces/` (the harness has usually consumed each `<id>.jsonl` by then)."
  (:require
   [metabase.util.json :as json]
   [metabase.util.log :as log]))

(set! *warn-on-reflection* true)

(defn- node->entry
  "Pure: a finished span node + `session-id` → the JSONL map. No semantic-convention mapping and no
  size limits — full payloads. The reconstruction script joins on `:session` and chains
  `:id`/`:parent`. `:start-epoch-ns`/`:end-epoch-ns` are wall-clock epoch nanos (see ns docstring)."
  [{:keys [type name id parent-id attributes events duration-ms start-epoch-nanos end-epoch-nanos]}
   session-id]
  {:session        session-id
   :id             id
   :parent         parent-id
   :type           type
   :name           name
   :start-epoch-ns start-epoch-nanos
   :end-epoch-ns   end-epoch-nanos
   :dur-ms         duration-ms
   :attributes     attributes
   :events         events})

(def ^:private json-safe-max-depth
  "Recursion cap for [[json-safe]]. Attribute values are arbitrary request context / agent state, so a
  pathologically deep — or cyclic — value would otherwise overflow the stack. A `StackOverflowError` is
  an `Error`, not an `Exception`, so it would escape [[emit!]]'s `catch Exception` net and break the
  traced run. Past this depth we stringify instead of recursing."
  200)

(defn- json-safe
  "Best-effort coercion of a value into something the JSON encoder can handle: recurse through plain
  collections, keep scalars, and stringify anything else. Used ONLY as a fallback after a direct
  encode throws, so it never touches values (UUIDs, dates, …) that already encode fine. Bounded by
  [[json-safe-max-depth]] so a deep/cyclic value degrades to a string rather than overflowing the stack."
  ([v] (json-safe v 0))
  ([v depth]
   (if (>= depth json-safe-max-depth)
     (str v)
     (let [d (inc depth)]
       (cond
         ;; Coerce KEYS too, not just values: the JSON encoder rejects a non-scalar map key (a
         ;; vector/map key), so leaving it intact would let the fallback re-encode throw — orphaning
         ;; the very root span this fallback exists to save.
         (map? v)        (into {} (map (fn [[k val]]
                                         [(if (or (string? k) (keyword? k) (number? k)) k (str k))
                                          (json-safe val d)]))
                               v)
         (set? v)        (mapv #(json-safe % d) v)
         (sequential? v) (mapv #(json-safe % d) v)
         (or (nil? v) (string? v) (number? v) (boolean? v) (keyword? v) (symbol? v)) v
         :else           (str v))))))

(defn emit!
  "Stream one finished span `node` as a single JSONL line, routed to `session-id`'s file. No-op when
  `session-id` is nil.

  `log/with-context` sets `mb-eval-session-id` in the Log4j2 ThreadContext for the duration of the
  single `log/info` call, on whatever thread the span finished on. Because `*session-id*` is conveyed
  across the agent's virtual-thread tool executor by `bound-fn*`, the routing key is always correct,
  and `with-context` restores/removes it afterward so it never leaks onto a pooled thread."
  [node session-id]
  (when session-id
    (try
      (let [entry (node->entry node session-id)
            line  (try
                    (json/encode entry)
                    (catch Exception _
                      ;; The attributes carry arbitrary request context / agent state, which could
                      ;; contain a non-encodable value. Dropping the line here would lose the span —
                      ;; and for a root span, orphan every child that references its `:id`. Degrade
                      ;; to a JSON-safe copy so the span still emits.
                      (json/encode (json-safe entry))))]
        (log/with-context {:eval-session-id session-id}
          (log/info line)))
      ;; Ultimate safety net: never let trace serialization/emission break the traced run. Catch
      ;; `Exception`, not `Throwable`, so JVM `Error`s and `InterruptedException` still propagate —
      ;; this runs in the span's `finally`, often on a tool virtual thread.
      (catch Exception t
        (log/warn t "ai-tracing: failed to serialize/emit eval span"))))
  nil)
