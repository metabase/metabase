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
   [metabase.mcp.v2.projections :as projections]
   [metabase.util :as u]
   [metabase.util.json :as json]
   [metabase.util.log :as log])
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

(defn truncation-line
  "The steering sentence appended to a truncated list response: names the narrowing `param` when
   one narrows this list, and always the next offset. Returns nil when the page isn't truncated
   (or `total` is unknown). `:returned` is the actual page size — the caller's ground truth, e.g.
   `(count data)` — not derived arithmetically, since a post-fetch drop (a stale index hit, an
   unreadable row) can leave a page shorter than `limit`/`total`/`offset` alone would predict.
   `:total-floor?` marks `total` as a lower bound rather than an exact count — e.g. a search total
   capped at the ranking limit — so the sentence reads \"at least N\"."
  ;; A list with nothing to narrow by still has to say more exists — without a line the caller
  ;; reads a truncated page as the whole set.
  [{:keys [param offset limit total total-floor? returned]}]
  (let [offset (or offset 0)]
    (when (and total limit (< (+ offset limit) total))
      (let [total-str (str (when total-floor? "at least ") total)
            next      (+ offset limit)]
        (if param
          (format "Returned %d of %s — narrow with `%s`, or continue with `offset: %d`."
                  returned total-str (name param) next)
          (format "Returned %d of %s — continue with `offset: %d`."
                  returned total-str next))))))

(defn list-envelope
  "The literal list-response envelope `{:data … :returned … :total?}`. `total` is included
   when known (offset pagination over the app db usually can count)."
  ([data] (list-envelope data nil))
  ([data total]
   (cond-> {:data data :returned (count data)}
     (some? total) (assoc :total total))))

(defn list-content
  "Build the MCP success content for a list response: the envelope (compact JSON) in the text
   block, with a steering line appended. `data` is already the page; `opts` carries
   `:offset`/`:limit`, an optional `:param` naming what narrows this list, and an optional
   `:empty-hint` used in place of the truncation line when nothing matched at all. Text-only —
   list data never rides `structuredContent` by reflex."
  [data total {:keys [empty-hint] :as opts}]
  (let [envelope (list-envelope data total)
        line     (if (and empty-hint (= 0 total))
                   empty-hint
                   (truncation-line (assoc opts :total total :returned (count data))))]
    (success-content (cond-> (json/encode envelope)
                       line (str "\n" line)))))

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

(defn ->mcp-error-content
  "Convert a caught exception into MCP error content, and the single point where an exception
   message is judged safe to return. Only deliberately caller-facing errors surface their
   message: an explicit `::error-code` (other than internal) or a client (4xx) `:status-code`
   in `ex-data` — teaching errors, not-found, scope denials. Every other exception — incidental
   `ex-info`s from libraries (whose messages may embed SQL or connection detail), 5xx
   invariants, and non-`ex-info` failures like JDBC or NPE — becomes a generic internal error;
   the real exception is logged server-side for debugging but never returned to the client."
  [e]
  (let [{::keys [error-code] :keys [status-code]} (ex-data e)
        code (or (when (and error-code (not= error-code error-code-internal)) error-code)
                 (when (contains? client-error-status-codes status-code)
                   (status-code->error-code status-code)))]
    (if code
      (error-content (or (ex-message e) "Internal error") code)
      (do
        (log/error e "Unhandled error dispatching MCP v2 tool call")
        (error-content "Internal error" error-code-internal)))))

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

;;; ------------------------------------------------ Response format -----------------------------------------------

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

;;; ------------------------------------------------ Shared schemas ------------------------------------------------

(def card-display-values
  "Visualization types a card (or an MCP Apps visualization) can render as."
  ["table" "bar" "line" "pie" "scatter" "area" "row" "combo" "pivot"
   "scalar" "smartscalar" "gauge" "progress" "funnel" "map" "waterfall" "sankey"])

(def card-display-enum
  "[[card-display-values]] as an undescribed Malli enum."
  (into [:enum] card-display-values))
