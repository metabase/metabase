(ns metabase.ai-tracing.log
  "File-based JSONL sink for eval traces.

  One JSON object per span is emitted on THIS dedicated logger (`metabase.ai-tracing.log` — the
  logger name equals the namespace), routed per-session to its own `<session-id>.jsonl` file by a
  Log4j2 `RoutingAppender` keyed on the `mb-eval-session-id` ThreadContext value.

  Each line is the message only (the appender uses `%m%n`), so the file is pure JSONL: an external
  script joins lines by `:session` and rebuilds the tree by chaining `:id`/`:parent`.

  The single on/off switch is `MB_AI_EVAL_CAPTURE` (off by default): [[emit!]] is only reached while
  a capture is active, so on a normal instance this logger writes nothing even though it sits at
  INFO. (`resources/log4j2.xml` also lets you set the logger to `off` as a hard kill.) Traces contain
  full, unredacted user content — intended for dedicated eval instances only."
  (:require
   [metabase.util.json :as json]
   [metabase.util.log :as log]))

(set! *warn-on-reflection* true)

(defn node->entry
  "Pure: a finished span node + `session-id` → the JSONL map. No semantic-convention mapping and no
  size limits — full payloads. The reconstruction script joins on `:session` and chains
  `:id`/`:parent`."
  [{:keys [type name id parent-id attributes events duration-ms start-epoch-nanos end-epoch-nanos]}
   session-id]
  {:session    session-id
   :id         id
   :parent     parent-id
   :type       type
   :name       name
   :start-ns   start-epoch-nanos
   :end-ns     end-epoch-nanos
   :dur-ms     duration-ms
   :attributes attributes
   :events     events})

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
      (log/with-context {:eval-session-id session-id}
        (log/info (json/encode (node->entry node session-id))))
      ;; Never let trace serialization break the traced run (the attributes now carry arbitrary
      ;; request context / agent state, which could in principle contain a non-encodable value).
      (catch Throwable t
        (log/warn t "ai-tracing: failed to serialize/emit eval span"))))
  nil)
