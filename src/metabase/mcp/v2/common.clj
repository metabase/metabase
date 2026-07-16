(ns metabase.mcp.v2.common
  "Shared conventions for v2 MCP tools: the list envelope, teaching errors, id resolution,
   `response_format`/`fields` plumbing, `_write` method dispatch, and the MCP response-channel
   helpers. Tool namespaces add domain logic only and never re-derive these shapes.

   Scope-binding rule: a v2 tool that covers a v1 tool reuses the v1 scope string verbatim.
   Issued OAuth tokens carry those literal strings (a token holding `agent:question:create`
   satisfies no other name), so renaming a v1 scope strands every existing token. Add new leaf
   scopes for net-new capability; never rename."
  (:require
   [clojure.string :as str]
   [metabase.agent-api.query-guards :as query-guards]
   [metabase.eid-translation.core :as eid-translation]
   [metabase.mcp.scope :as mcp.scope]
   [metabase.mcp.session :as mcp.session]
   [metabase.mcp.v2.projections :as projections]
   [metabase.util :as u]
   [metabase.util.json :as json])
  (:import
   (org.apache.commons.text.similarity LevenshteinDistance)))

(set! *warn-on-reflection* true)

;;; ------------------------------------------------ Response channels ---------------------------------------------

;; JSON-RPC error codes recorded as `mcp_tool_call_log.error_code` for failed tool calls.
(def error-code-invalid-request
  "JSON-RPC -32600: request rejected before dispatch (e.g. insufficient scope)." -32600)
(def error-code-method-not-found
  "JSON-RPC -32601: unknown or disabled tool." -32601)
(def error-code-invalid-params
  "JSON-RPC -32602: invalid arguments, including teaching errors and not-found." -32602)
(def error-code-internal
  "JSON-RPC -32603: unexpected server-side failure." -32603)

(defn error-content
  "Wrap an error message as MCP error content. The JSON-RPC `code` (default: internal error) is
   carried under the namespaced `::error-code` key for usage logging and stripped from the
   response before it reaches the client (see the registry's call-tool)."
  ([message] (error-content message error-code-internal))
  ([message code] {:content [{:type "text" :text message}] :isError true ::error-code code}))

(defn success-content
  "Assemble the two MCP response channels deliberately. When `structuredContent` is present,
   clients may hand the model that channel alone — the MCP spec defines the text block as the
   backwards-compat serialization of `structuredContent`, so structured is the primary channel
   whenever both exist, and a structured payload that is a subset of the text silently hides
   the rest from the model. Tools therefore default to text-only (omit `structured`), with
   `text` self-sufficient: everything the model needs to reason or make its next call. Pass
   `structured` only when a concrete programmatic consumer reads it (e.g. an MCP Apps iframe),
   and make it a faithful mirror of the text — never a subset, never the sole home of anything
   the model needs."
  ([text] (success-content text nil))
  ([text structured]
   (cond-> {:content [{:type "text" :text (if (string? text) text (json/encode text))}]}
     (some? structured) (assoc :structuredContent structured))))

;;; ------------------------------------------------ Teaching errors -----------------------------------------------

(defn throw-teaching-error
  "Throw an `ex-info` whose message is a complete caller-facing sentence naming the fix.
   Surfaced to the MCP client as `isError` content by [[->mcp-error-content]]."
  ([msg] (throw-teaching-error msg nil))
  ([msg data]
   (throw (ex-info msg (merge {:status-code 400} data)))))

(defn throw-not-found
  "Throw the collapsed not-found teaching error. Deliberately identical for \"doesn't exist\"
   and \"exists but not readable\", so responses never form an existence oracle across the
   permission boundary."
  [model id]
  (throw (ex-info (format "%s %s not found — it may not exist, or you may not have access to it."
                          (name model) id)
                  {:status-code 404})))

(defn- status-code->error-code
  [status-code]
  (cond
    (contains? #{401 403} status-code) error-code-invalid-request
    (contains? #{400 404} status-code) error-code-invalid-params
    :else                              error-code-internal))

(defn ->mcp-error-content
  "Convert a caught exception into MCP error content. `ex-info`s surface their message (the
   teaching-error channel); anything else becomes a generic internal error. An explicit
   `::error-code` in `ex-data` wins over the `:status-code` mapping."
  [e]
  (let [{::keys [error-code] :keys [status-code]} (ex-data e)]
    (error-content (or (ex-message e) "Internal error")
                   (or error-code
                       (status-code->error-code status-code)))))

;;; ------------------------------------------------ List envelope -------------------------------------------------

(defn truncation-line
  "The steering sentence appended to a truncated list response: names the narrowing `param` when
   one narrows this list, and always the next offset. Returns nil when the page isn't truncated
   (or `total` is unknown)."
  ;; A list with nothing to narrow by still has to say more exists — without a line the caller
  ;; reads a truncated page as the whole set.
  [{:keys [param offset limit total]}]
  (let [offset (or offset 0)]
    (when (and total limit (< (+ offset limit) total))
      (let [returned (min limit (- total offset))
            next     (+ offset limit)]
        (if param
          (format "Returned %d of %d — narrow with `%s`, or continue with `offset: %d`."
                  returned total (name param) next)
          (format "Returned %d of %d — continue with `offset: %d`."
                  returned total next))))))

(defn list-envelope
  "The literal list-response envelope `{:data … :returned … :total?}`. `total` is included
   when known (offset pagination over the app db usually can count)."
  ([data] (list-envelope data nil))
  ([data total]
   (cond-> {:data data :returned (count data)}
     (some? total) (assoc :total total))))

(defn list-content
  "Build the MCP success content for a list response: the envelope (compact JSON) in the text
   block, with the truncation steering line appended when the page is truncated. `data` is
   already the page; `opts` carries `:offset`/`:limit` and an optional `:param` naming what
   narrows this list. Text-only — list data never rides `structuredContent` by reflex."
  [data total opts]
  (let [envelope (list-envelope data total)
        line     (truncation-line (assoc opts :total total))]
    (success-content (cond-> (json/encode envelope)
                       line (str "\n" line)))))

;;; ------------------------------------------------ Id resolution -------------------------------------------------

(def ^:private entity-id-re
  "NanoID shape used by `entity_id` columns."
  #"^[A-Za-z0-9_-]{21}$")

(defn entity-id?
  "Is `x` a 21-character entity_id string?"
  [x]
  (boolean (and (string? x) (re-matches entity-id-re x))))

(defn resolve-id-or-404
  "Resolve a numeric id or 21-char entity_id to the numeric id for `model`. Throws the
   collapsed not-found error when an entity_id doesn't resolve, and a teaching error for any
   other shape.

   This is translation only — it must always be followed by the object's read check. Prefer
   [[resolve-and-read]], which enforces that pairing."
  [model id-or-eid]
  (cond
    (int? id-or-eid)
    id-or-eid

    (entity-id? id-or-eid)
    (try
      (eid-translation/->id-or-404 model id-or-eid)
      (catch clojure.lang.ExceptionInfo e
        (if (= 404 (:status-code (ex-data e)))
          (throw-not-found model id-or-eid)
          (throw e))))

    :else
    (throw-teaching-error (format "Invalid id %s — pass a numeric id or a 21-character entity_id."
                                  (pr-str id-or-eid)))))

(defn resolve-and-read
  "Resolve `id-or-eid` for `model`, then run `read-check-fn` (which must perform the same
   read check the corresponding REST endpoint runs, and return the object). \"Doesn't exist\"
   and \"exists but not readable\" collapse into the same not-found error, so the response
   never leaks existence across the permission boundary."
  [model id-or-eid read-check-fn]
  (let [id (resolve-id-or-404 model id-or-eid)]
    (try
      (let [result (read-check-fn id)]
        (if (nil? result)
          (throw-not-found model id-or-eid)
          result))
      (catch clojure.lang.ExceptionInfo e
        (if (contains? #{403 404} (:status-code (ex-data e)))
          (throw-not-found model id-or-eid)
          (throw e))))))

(defn resolve-collection-id
  "Resolve a `collection_id`/`parent_id` argument. `nil` and `\"root\"` mean the root
   collection and resolve to nil without a DB translation; `\"trash\"` resolves to
   `:trash-collection-id` when the caller allows it (the tool passes the id from the
   collections module) and is a teaching error otherwise."
  ([id-or-sentinel] (resolve-collection-id id-or-sentinel nil))
  ([id-or-sentinel {:keys [trash-collection-id]}]
   (cond
     (or (nil? id-or-sentinel) (= "root" id-or-sentinel))
     nil

     (= "trash" id-or-sentinel)
     (or trash-collection-id
         (throw-teaching-error "\"trash\" is not a valid collection here — pass a collection id, entity_id, or \"root\"."))

     :else
     (resolve-id-or-404 :model/Collection id-or-sentinel))))

;;; --------------------------------------------- response_format --------------------------------------------------

(defn response-format
  "Read `:response_format` from tool arguments: `:concise` (default) or `:detailed`; anything
   else is a teaching error."
  [args]
  (case (get args :response_format)
    (nil "concise") :concise
    "detailed"      :detailed
    (throw-teaching-error (format "Invalid response_format %s — use \"concise\" or \"detailed\"."
                                  (pr-str (get args :response_format))))))

;;; ------------------------------------------------ fields resolver -----------------------------------------------

(def ^:private ^LevenshteinDistance levenshtein
  (LevenshteinDistance/getDefaultInstance))

(defn- nearest-paths
  [^String path catalog]
  (->> catalog
       (sort-by #(.apply levenshtein path ^String %))
       (take 3)))

(defn- valid-path?
  "A requested path is valid when it is a catalog entry or a segment-aligned prefix of one
   (selecting a whole subtree)."
  [path catalog]
  (boolean (some #(or (= % path) (str/starts-with? % (str path "."))) catalog)))

(defn- add-path
  "Merge one path (a vector of segments) into the selection tree. `::all` marks a
   whole-subtree selection; it absorbs any narrower path at the same node, in either
   insertion order, so `[\"parameters\" \"parameters.name\"]` selects all of `parameters`."
  [tree segs]
  (cond
    (= ::all tree) ::all
    (empty? segs)  ::all
    :else          (update tree (first segs) #(add-path (or % {}) (rest segs)))))

(defn- paths->tree
  [paths]
  (reduce (fn [tree path] (add-path tree (str/split path #"\.")))
          {}
          paths))

(defn- select-tree
  [node tree]
  (cond
    (= ::all tree)     node
    ;; Arrays are item-relative: apply the selection to every item.
    (sequential? node) (mapv #(select-tree % tree) node)
    (map? node)        (into {}
                             (keep (fn [[seg subtree]]
                                     (let [k (keyword seg)]
                                       (when (contains? node k)
                                         [k (select-tree (get node k) subtree)]))))
                             tree)
    :else              node))

(defn select-fields
  "Narrow `response-map` (the permission-filtered built response for one item of `type`,
   never a raw model row) to the requested `fields` dot-paths. Paths are validated against
   `type`'s catalog; an unknown path is a teaching error naming the nearest valid paths.
   `fields` is mutually exclusive with `response_format` and `include` — the caller passes
   what was present and combining them is a teaching error."
  ([type response-map fields]
   (select-fields type response-map fields nil))
  ([type response-map fields {:keys [response-format include]}]
   (when (or response-format include)
     (throw-teaching-error "Use `fields` OR `response_format`/`include`, not both."))
   (when (empty? fields)
     (throw-teaching-error "`fields` must name at least one path."))
   (let [catalog (or (projections/catalog type)
                     (throw-teaching-error (format "`fields` is not supported for type %s." (name type))))]
     (doseq [path fields]
       (when-not (valid-path? path catalog)
         (throw-teaching-error (format "Unknown field path %s for type %s. Nearest valid paths: %s."
                                       (pr-str path) (name type)
                                       (str/join ", " (nearest-paths path catalog))))))
     (select-tree response-map (paths->tree fields)))))

;;; ------------------------------------------------ _write dispatch -----------------------------------------------

(defn check-update-scope!
  "The method-level scope gate for merged `_write` tools: the registry requires the create
   scope to list/call the tool at all; `method: \"update\"` additionally requires
   `update-scope` at runtime. No-op for unscoped callers (cookie sessions bind the
   unrestricted sentinel, which [[metabase.mcp.scope/matches?]] always accepts)."
  [token-scopes update-scope tool-name]
  (when-not (mcp.scope/matches? token-scopes update-scope)
    (throw (ex-info (format "Insufficient scope to call %s with method: update — this token can create but not update."
                            tool-name)
                    {:status-code 403 ::error-code error-code-invalid-request}))))

(defn dispatch-write
  "Shared `method` dispatch for `_write` tools. `entry` carries the tool's write contract:
   `:tool-name`, `:update-scope` (re-checked at runtime on update), and `:create-required`
   (arg keys enforced at create with teaching errors — the \"(create)\" markers in the spec).

   Returns `[:create args]` or `[:update id args]` (with `:method`/`:id` stripped), or throws
   a teaching error. Does not itself touch the DB — the tool handler consumes the result."
  [{:keys [tool-name update-scope create-required]} token-scopes {:keys [method id] :as args}]
  (case method
    "create"
    (do
      (doseq [k create-required]
        (when (nil? (get args k))
          (throw-teaching-error (format "`%s` is required when method is \"create\"." (name k)))))
      [:create (dissoc args :method)])

    "update"
    (do
      (when (nil? id)
        (throw-teaching-error "`id` is required when method is \"update\"."))
      (when update-scope
        (check-update-scope! token-scopes update-scope tool-name))
      [:update id (dissoc args :method :id)])

    (throw-teaching-error (format "Invalid method %s — use \"create\" or \"update\"." (pr-str method)))))

;;; ------------------------------------------------ Query handles -------------------------------------------------

(defn encode-serialized-query
  "Base64-encode a serialized MBQL query map ([[metabase.lib.core/prepare-for-serialization]] output)
   for storage in the query-handle store. The inverse of the decode step in [[resolve-query-handle!]]."
  [serialized-query]
  (-> serialized-query json/encode u/encode-base64))

(defn mint-query-handle!
  "Store `encoded-query` (base64 serialized MBQL, exactly what ran — see [[encode-serialized-query]])
   under a fresh handle owned by `user-id`, with the user's original `prompt` alongside for the
   visualization feedback flow. Returns the handle UUID string. Execute tools mint on every call,
   including `validate_only`, so what the agent later saves or visualizes through the handle is
   byte-identical to what ran."
  ([mcp-session-id user-id encoded-query]
   (mint-query-handle! mcp-session-id user-id encoded-query nil))
  ([mcp-session-id user-id encoded-query prompt]
   (mcp.session/store-handle! mcp-session-id user-id encoded-query prompt)))

(defn- decode-stored-query
  "Decode a stored handle's base64 query payload to a map, surfacing garbage as a teaching error
   rather than a decode exception."
  [encoded]
  (let [decoded (try
                  (-> encoded u/decode-base64 json/decode+kw)
                  (catch Exception _ ::invalid))]
    (if (map? decoded)
      decoded
      (throw-teaching-error "Query handle contents are invalid — run the query again to get a fresh handle."))))

(defn resolve-query-handle!
  "Resolve `handle` for `user-id` and re-run the fresh-query guards on the stored query, so a
   handle can never smuggle native SQL past the MBQL-scoped tools or grant access the caller has
   since lost. Returns `{:query <decoded MBQL map> :prompt <string-or-nil>}`, or throws a teaching
   error (unknown/expired handle, native query, malformed query, or missing permissions).

   MBQL-path callers only: the MCP Apps UI tools read handles directly through
   [[metabase.mcp.session/resolve-query-handle]] — a native/SQL handle is visualizable by design,
   so the native-reject guard must never move into the store's read path."
  [mcp-session-id user-id handle]
  (let [{:keys [encoded_query prompt]}
        (or (mcp.session/resolve-query-handle mcp-session-id user-id handle)
            (throw-teaching-error "Query handle not found — it may have expired; run the query again."))
        query (decode-stored-query encoded_query)]
    (query-guards/reject-native-query! query)
    (query-guards/validate-serialized-query! query)
    (query-guards/check-token-query-permissions! query)
    {:query query :prompt prompt}))

;;; ------------------------------------------------ Argument plumbing ---------------------------------------------

(defn drop-nil-args
  "Strip nil-valued top-level keys from MCP tool arguments. Strict MCP clients (ChatGPT) send
   every declared property with `null` for the ones they don't populate; stripping at the
   boundary lets handlers treat missing and null identically. Nested values are left alone."
  [arguments]
  (when arguments
    (into {} (remove (comp nil? val)) arguments)))
