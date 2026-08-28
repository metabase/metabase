(ns metabase.mcp.v2.queries
  "The v2 MCP tools' query machinery: the representations pipeline entry point (validate ->
   repair -> resolve, in the numeric-id dialect with v2 recovery sentences), portable-dialect
   resolution for `definition` arguments, and the query-handle store (mint/resolve, with the
   fresh-query guards re-run on every read). Landed with its first consumer (`metric_write`);
   the execute tools (query PR) add the minting call sites."
  (:require
   [metabase.agent-api.query-guards :as query-guards]
   [metabase.agent-api.settings :as agent-api.settings]
   [metabase.lib.core :as lib]
   [metabase.mcp.session :as mcp.session]
   [metabase.mcp.v2.common :as common]
   [metabase.mcp.v2.recovery-hints :as v2.recovery-hints]
   [metabase.metabot.tools.construct :as metabot.construct]
   [metabase.models.serialization.resolve :as serdes.resolve]
   [metabase.util :as u]
   [metabase.util.json :as json]))

(set! *warn-on-reflection* true)

(def ^:private max-schema-detail-length
  "Character budget for the humanized schema explanation appended to a structural failure. A
   deeply nested query explains in kilobytes; the leading paths are the ones worth fixing first,
   and an unbounded dump would crowd out the rest of the agent's context."
  500)

(defn- with-schema-detail
  "`e` with its humanized schema explanation folded into the message, or unchanged when it carries
   none. The representations pipeline computes the explanation and files it under `:humanized` but
   states only the bare verdict, which leaves an agent nothing to edit; only structural validation
   failures carry the key, so the dialect steering is always apt where it lands."
  [^clojure.lang.ExceptionInfo e]
  (if-let [humanized (:humanized (ex-data e))]
    (ex-info (str (ex-message e)
                  " Invalid at " (common/ellipsize (common/humanize-detail humanized) max-schema-detail-length)
                  ". Fix the named paths, or call `learn` with \"query-dialect\" for the clause shapes.")
             (ex-data e)
             (ex-cause e))
    e))

(defn execute-representations-query
  "Run the shared representations pipeline (validate → repair → resolve) as the MCP v2 surface —
   the one entry point for v2 tools that accept an agent-authored MBQL query. Binds the numeric-id
   dialect on, and supplies v2's recovery sentences so a resolution failure names `browse_data` /
   `search` rather than v1's `read_resource` / `metabase://` URIs. A structural failure gains the
   offending paths ([[with-schema-detail]]), which the pipeline computes but does not state."
  [external-query]
  (binding [serdes.resolve/*numeric-ids-allowed?* true]
    (try
      (metabot.construct/execute-representations-query
       external-query
       {:recovery-hint v2.recovery-hints/recovery-hint})
      (catch clojure.lang.ExceptionInfo e
        (throw (with-schema-detail e))))))

;;; ------------------------------------------------ Portable queries ----------------------------------------------

(defn portable-query?
  "True when `query` is a full query whose first stage names its source the way the portable
   external dialect does — an FK path `[db schema table]` or a card entity_id — rather than a
   numeric id."
  [query]
  (let [stage (first (:stages query))]
    (or (vector? (:source-table stage))
        (string? (:source-card stage)))))

(defn resolve-external-query
  "Resolve a full query in the portable external dialect through the same pipeline `execute_query`
   runs a fresh `query` through — repair, portable-FK resolution, and the runnable/editor gates —
   and return the serialized MBQL 5 query. Resolution only: the pipeline does not execute.

   The pipeline's own agent-facing failures become a teaching error about the `definition`
   argument, ending in `hint` (a sentence naming the shapes the calling tool accepts); permission
   failures and anything unrecognized pass through."
  [external-query hint]
  (try
    ;; Through the v2 entry point, not the raw pipeline: a `definition` gets the same numeric-id
    ;; dialect and the same v2 recovery sentences a fresh `execute_query` body would.
    (-> (execute-representations-query external-query)
        (get-in [:structured-output :query])
        lib/prepare-for-serialization)
    (catch clojure.lang.ExceptionInfo e
      (if (:agent-error? (ex-data e))
        (common/throw-teaching-error
         (format "`definition` could not be resolved: %s %s" (common/ellipsize (ex-message e) 300) hint))
        (throw e)))))

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
    (if (map? decoded) ;; catch ::invalid and non-map values
      decoded
      (common/throw-teaching-error "Query handle contents are invalid — run the query again to get a fresh handle."))))

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
            (common/throw-teaching-error "Query handle not found — it may have expired; run the query again."))
        query (decode-stored-query encoded_query)]
    (query-guards/reject-native-query! query)
    (query-guards/validate-serialized-query! query)
    (query-guards/check-token-query-permissions! query)
    {:query query :prompt prompt}))

(defn resolve-query-handle-for-save!
  "Like [[resolve-query-handle!]] but for the save/write path: resolves `handle` for `user-id`,
   re-runs the shape and permission guards, and — unlike the MBQL read path — DOES allow a native
   query through. `execute_sql` mints handles specifically so their SQL can be saved; the
   native-reject guard would otherwise make those handles unsaveable. Returns
   `{:query <decoded map> :prompt <string-or-nil>}`, or throws a teaching error."
  [mcp-session-id user-id handle]
  (let [{:keys [encoded_query prompt]}
        (or (mcp.session/resolve-query-handle mcp-session-id user-id handle)
            (common/throw-teaching-error "Query handle not found — it may have expired; run the query again."))
        query (decode-stored-query encoded_query)]
    (query-guards/validate-serialized-query! query)
    (query-guards/check-token-query-permissions! query)
    {:query query :prompt prompt}))

;;; ------------------------------------------------ Raw-SQL kill switch -------------------------------------------

(defn check-execute-sql-enabled!
  "Throw a 403 unless the instance-level `mcp-execute-sql-enabled` kill switch is on. `subject`
   opens the refusal sentence, naming what the instance refused. Every v2 path that runs or stores
   raw SQL consults this one gate — a switch an admin turned off must not be reachable by a
   second route."
  [subject]
  (when-not (agent-api.settings/mcp-execute-sql-enabled)
    (throw (ex-info (format (str "%s is disabled on this instance — an admin can re-enable it "
                                 "with the mcp-execute-sql-enabled setting.")
                            subject)
                    {:status-code 403}))))
