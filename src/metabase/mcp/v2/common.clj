(ns metabase.mcp.v2.common
  "The v2 MCP tools' shared response conventions: the MCP response channels, the teaching-error
   taxonomy, and message-shaping helpers. Sibling namespaces own the other shared machinery as
   their first consumers land it (`v2.resolve` for id resolution, `v2.write` for `_write`
   dispatch, `v2.queries` for the query pipeline). Tool namespaces add domain logic only and
   never re-derive these shapes.

   Scope-binding rule: scopes are never renamed. Issued OAuth tokens carry literal strings (a
   token holding `agent:question:create` satisfies no other name), so renaming one strands every
   existing token. Add new leaf scopes for net-new capability; never rename."
  (:require
   [clojure.string :as str]
   [metabase.channel.urls :as channel.urls]
   [metabase.util :as u]
   [metabase.util.json :as json]
   [metabase.util.log :as log]))

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

(def mcp-apps-meta-key
  "The `_meta` key MCP Apps credentials ride on, private to the host and never shown to the model.

  Named here rather than inline because two places must agree on it: the tool that puts a credential there, and
  the redaction that strips it before the result reaches an eval trace."
  :com.metabase/mcp-apps)

(defn redact-mcp-apps-meta
  "`result` with the private MCP Apps `_meta` block removed.

  A credential in a tool result is a live authenticator for the /api/dataset surface. Recording one verbatim
  parks it in trace files and the superuser-readable ai-tracing API, where it outlives its five-minute window
  in backups and log shipping. v1 strips the same channel before tracing
  (`metabase.mcp.resources/redact-ui-credential`); the transport's HTML scrub covers `resources/read` bodies
  and does not reach tool results."
  [result]
  (cond-> result
    (map? (:_meta result)) (update :_meta dissoc mcp-apps-meta-key)))

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
    (contains? #{401 402 403 409} status-code) error-code-invalid-request
    (contains? #{400 404} status-code)         error-code-invalid-params
    :else                                      error-code-internal))

(def ^:private client-error-status-codes
  "Status codes that mark an exception as deliberately caller-facing — its message is safe to
   return. Everything else is an internal failure whose message may embed SQL, schema, or
   connection detail. 402 (missing premium feature) and 409 (conflict) are included because their
   messages name the missing feature or clashing state — information the agent needs to recover."
  #{400 401 402 403 404 409})

(defn- caller-facing-error-code
  "The JSON-RPC error code for `e` when it is deliberately caller-facing (an explicit
   `::error-code` other than internal, or a client 4xx `:status-code` in `ex-data`), else nil."
  [e]
  (let [{::keys [error-code] :keys [status-code]} (ex-data e)]
    (or (when (and error-code (not= error-code error-code-internal)) error-code)
        (when (contains? client-error-status-codes status-code)
          (status-code->error-code status-code)))))

(defn caller-safe-error-message
  "The message of `e` when it is deliberately caller-facing, judged the same way as
   [[->mcp-error-content]]; any other exception is logged server-side and reported to the client
   as a generic \"Internal error\". This is the sanitizer for response paths that answer with a
   JSON-RPC error rather than tool content — resource reads, list handlers, and the transport's
   own catch-all."
  [e]
  (if (caller-facing-error-code e)
    (or (ex-message e) "Internal error")
    (do
      (log/error e "Unhandled error dispatching MCP v2 request")
      "Internal error")))

(defn ->mcp-error-content
  "Convert a caught exception into MCP error content, and the single point where an exception
   message is judged safe to return. Only deliberately caller-facing errors surface their
   message: an explicit `::error-code` (other than internal) or a client (4xx) `:status-code`
   in `ex-data` — teaching errors, not-found, scope denials. Every other exception — incidental
   `ex-info`s from libraries (whose messages may embed SQL or connection detail), 5xx
   invariants, and non-`ex-info` failures like JDBC or NPE — becomes a generic internal error;
   the real exception is logged server-side for debugging but never returned to the client."
  [e]
  (if-let [code (caller-facing-error-code e)]
    (error-content (or (ex-message e) "Internal error") code)
    (do
      (log/error e "Unhandled error dispatching MCP v2 tool call")
      (error-content "Internal error" error-code-internal))))

;;; ------------------------------------------------ Message helpers ----------------------------------------------

(defn ellipsize
  "`s` truncated to `limit` characters, with an ellipsis marking the cut."
  [s limit]
  (let [s (str s)]
    (if (> (count s) limit)
      (str (subs s 0 limit) "…")
      s)))

(defn humanize-detail
  "Flatten a [[malli.error/humanize]] explanation into one line of `path: expectation`.

   Sequential positions are labelled `[i]` and satisfied entries dropped, so a failure inside a
   multi-element collection names which element it is in; a run of plain strings is a single
   value's alternative messages and joins without positions."
  [errors]
  (cond
    (map? errors)
    (str/join "; " (map (fn [[k v]] (str (u/qualified-name k) ": " (humanize-detail v))) errors))

    (and (sequential? errors) (every? string? errors))
    (str/join ", " errors)

    (sequential? errors)
    (str/join "; " (keep-indexed (fn [i v]
                                   (when (some? v)
                                     (format "[%d] %s" i (humanize-detail v))))
                                 errors))

    :else
    (str errors)))

;;; ------------------------------------------------- Frontend URLs ------------------------------------------------

(defn frontend-url
  "Prefix a `channel.urls` relative `path` with the configured site URL, returning it relative
   when site-url is unset so a tool never emits an absolute URL with an empty host. Always build
   a tool's `:url` this way — `channel.urls`' own `*-url` fns interpolate site-url directly and
   render `nil` as the literal string \"null\", which site-url is whenever it is unconfigured or
   fails validation."
  [path]
  (let [base (channel.urls/site-url)]
    (if (str/blank? base)
      path
      (str base path))))

;;; ------------------------------------------------ Shared schemas ------------------------------------------------

(def card-display-values
  "Visualization types a card (or an MCP Apps visualization) can render as."
  ["table" "bar" "line" "pie" "scatter" "area" "row" "combo" "pivot"
   "scalar" "smartscalar" "gauge" "progress" "funnel" "map" "waterfall" "sankey"])

(def card-display-enum
  "[[card-display-values]] as an undescribed Malli enum."
  (into [:enum] card-display-values))
