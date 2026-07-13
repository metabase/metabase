(ns metabase.agent-api.handles
  "The query-handle store: where a query lives so the model never has to carry it.

   A tool that validates or runs a query hands back a `query_handle`, and passing that handle to a
   later call — the next page, a visualization, a save — replays the byte-identical query the user
   already saw. Re-emitting the MBQL instead is regeneration, and regeneration can silently mutate
   what gets saved.

   Rows hold plain JSON and are keyed by the **authenticated user**, never a transport session: the
   2026-07-28 protocol has no handshake, so a request can arrive cold and a handle stored by one
   connection has to resolve from the next. The store is content-addressed — the handle UUID is a
   deterministic hash of (user, query) — so an iteration loop that re-runs the same query keeps one
   row rather than one per attempt, and an unused handle just expires.

   A row holds the query as JSON. [[store-query!]] and [[read-query]] speak that shape directly; the
   base64 pair ([[store-handle!]], [[read-handle]], [[resolve-query-handle]]) exists for the callers
   whose wire format is base64 — the construct endpoints and the embedding iframe — and converts at the
   boundary, in both directions, so a row of either shape reads back correctly."
  (:require
   [clojure.string :as str]
   [java-time.api :as t]
   [metabase.agent-api.models.mcp-query-handle]
   [metabase.agent-api.settings :as agent-api.settings]
   [metabase.app-db.core :as app-db]
   [metabase.util :as u]
   [metabase.util.json :as json]
   [toucan2.core :as t2])
  (:import
   (java.nio.charset StandardCharsets)
   (java.util UUID)))

(set! *warn-on-reflection* true)

(defn- json-payload?
  "True if `payload` is JSON rather than base64. A serialized MBQL query is a JSON object, so it starts
   with `{`; base64 never does."
  [payload]
  (str/starts-with? (str/triml payload) "{"))

(defn- ->stored-json
  "Normalize a query payload to the JSON text stored in a handle row."
  [payload]
  (if (json-payload? payload)
    payload
    (u/decode-base64 payload)))

(defn- stored->base64
  "Return a stored query payload as base64, the shape the construct endpoints and the iframe speak. A row
   that already holds base64 passes through unchanged."
  [payload]
  (if (json-payload? payload)
    (u/encode-base64 payload)
    payload))

(defn- content-addressed-handle-id
  "Deterministic handle UUID for a (`user-id`, `query-json`) pair."
  ^String [user-id query-json]
  (str (UUID/nameUUIDFromBytes
        (.getBytes (str user-id " " query-json) StandardCharsets/UTF_8))))

(defn- handle-expires-at
  []
  (t/plus (t/offset-date-time) (t/days (agent-api.settings/mcp-query-handle-ttl-days))))

(defn store-handle!
  "Store `encoded-query` for `user-id` and return the handle UUID.

   Content-addressed: storing the same query twice for the same user yields the same handle and a single
   row. The handle expires after [[metabase.agent-api.settings/mcp-query-handle-ttl-days]].

   `prompt` is optional but should be supplied for construct_query handles so visualize_query can return
   the original prompt to the MCP iframe."
  ([user-id encoded-query]
   (store-handle! user-id encoded-query nil))
  ([user-id encoded-query prompt]
   (let [query-json (->stored-json encoded-query)
         handle-id  (content-addressed-handle-id user-id query-json)]
     ;; Re-storing the same query refreshes the TTL and, when a prompt is supplied, the prompt —
     ;; so an iteration loop keeps a single live row rather than resurrecting an expired one.
     (app-db/update-or-insert!
      :model/McpQueryHandle
      {:id handle-id}
      (fn [existing]
        (cond-> {:user_id       user-id
                 :encoded_query query-json
                 :expires_at    (handle-expires-at)}
          prompt                       (assoc :prompt prompt)
          (and (nil? prompt) existing) (assoc :prompt (:prompt existing)))))
     handle-id)))

(defn store-query!
  "Store the serialized MBQL `query` map for `user-id` and return its handle."
  ([user-id query]
   (store-query! user-id query nil))
  ([user-id query prompt]
   (store-handle! user-id (json/encode query) prompt)))

(defn- find-handle-row
  "Look up a live (unexpired) handle row by `handle-id`, scoped to `user-id`. Handle ids are globally
   unique, so this returns at most one row."
  [user-id handle-id]
  (when (and user-id handle-id)
    (t2/select-one :model/McpQueryHandle
                   {:where [:and
                            [:= :id handle-id]
                            [:= :user_id user-id]
                            [:> :expires_at :%now]]})))

(defn read-handle
  "Return the stored query for `handle-id` owned by `user-id` (base64, for the v1 tools and the iframe),
   or nil if no live handle exists."
  [user-id handle-id]
  (some-> (find-handle-row user-id handle-id)
          :encoded_query
          stored->base64))

(defn read-query
  "Return the serialized MBQL query map `handle-id` names for `user-id`, or nil if no live handle exists."
  [user-id handle-id]
  (some-> (find-handle-row user-id handle-id)
          :encoded_query
          ->stored-json
          json/decode+kw))

(defn resolve-query-handle
  "Return {:encoded_query <base64> :prompt ...} for `handle-id` owned by `user-id`, or nil if no live
   handle exists."
  [user-id handle-id]
  (when-let [row (find-handle-row user-id handle-id)]
    {:encoded_query (stored->base64 (:encoded_query row))
     :prompt        (:prompt row)}))
