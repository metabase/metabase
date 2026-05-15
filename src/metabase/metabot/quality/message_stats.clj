(ns metabase.metabot.quality.message-stats
  "Per-turn stats persisted alongside the message body in `metabot_message`.

  `message-stats` is called inside `metabot.persistence/finalize-assistant-turn!`
  on the post-`combine-text-parts-xf` parts vector (`content`), and its result
  is folded into the same UPDATE that writes `data`, `usage`, `finished`, and
  `error`. This keeps the per-turn authoring counters consistent with the
  persisted parts blob — they are computed from the exact bytes that go into
  `metabot_message.data`.

  v1 stores two counters: `query_modified` (boolean) and `query_count` (int).
  Both are functions of the set of AUTHORING tool calls in the turn — see
  `quality.constants/authoring-tools`."
  (:require
   [metabase.metabot.quality.constants :as constants]))

(set! *warn-on-reflection* true)

(defn- tool-input-part?
  "True if `part` is a tool-input emitted during streaming.

  In-memory parts (before persistence) carry `:type :tool-input` as a Clojure
  keyword. Persisted parts (after JSON round-trip) carry `:type \"tool-input\"`
  as a string. Both shapes are recognised so a future backfill that re-reads
  persisted rows can reuse this function unchanged."
  [part]
  (let [t (:type part)]
    (or (= :tool-input t)
        (= "tool-input" t))))

(defn- authoring-call?
  "True if `part` is a tool-input call to an AUTHORING tool."
  [part]
  (and (tool-input-part? part)
       (contains? constants/authoring-tools (:function part))))

(defn message-stats
  "Compute per-turn authoring stats from a parts vector.

  Returns `{:query_modified <boolean> :query_count <int>}`.

  `parts` is the post-`combine-text-parts-xf` content vector that
  `metabot.persistence/finalize-assistant-turn!` writes to
  `metabot_message.data`. Empty/nil input yields `{:query_modified false
  :query_count 0}` — the same defaults the Liquibase migration applies to
  user rows and assistant turns that didn't author a query."
  [parts]
  (let [n (count (filter authoring-call? parts))]
    {:query_modified (pos? n)
     :query_count    n}))
