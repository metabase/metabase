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
   [metabase.mcp.v2.message :as message]
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
  "`e` rewrapped by [[common/message-ex-info]] with its humanized schema explanation after its message, keeping its
   data and with `e` as the cause, or unchanged when it carries none."
  [^clojure.lang.ExceptionInfo e]
  ;; The pipeline files the explanation under `:humanized` but states only the bare verdict, which leaves an agent
  ;; nothing to edit. Only structural validation failures carry the key, so the dialect steering is always apt.
  (if-let [humanized (:humanized (ex-data e))]
    (let [detail (message/msg [(str "Invalid at %s. Fix the named paths, or call "
                                    "\"learn\" with \"query-dialect\" for the clause shapes.")]
                              (common/ellipsize (common/humanize-detail humanized) max-schema-detail-length))]
      (common/message-ex-info (if-let [text (common/exception-message e)]
                                (message/msg ["%s %s"] text detail)
                                detail)
                              (ex-data e)
                              e))
    e))

(defn- with-recovery-hint
  "`e` rewrapped by [[common/message-ex-info]] with v2's recovery message for its `ex-data` on a line after its
   message, keeping its data and with `e` as the cause, or unchanged when there is none."
  [^clojure.lang.ExceptionInfo e]
  (if-let [hint (v2.recovery-hints/recovery-hint (ex-data e))]
    (common/message-ex-info (if-let [text (common/exception-message e)]
                              (message/msg ["%s" "%s"] text hint)
                              hint)
                            (ex-data e)
                            e)
    e))

(defn execute-representations-query
  "Run the shared representations pipeline (validate → repair → resolve) as the MCP v2 surface —
   the one entry point for v2 tools that accept an agent-authored MBQL query. Binds the numeric-id
   dialect on. A structural failure gains the offending paths ([[with-schema-detail]]), and an
   agent error gains v2's recovery message ([[with-recovery-hint]])."
  [external-query]
  (binding [serdes.resolve/*numeric-ids-allowed?* true]
    (try
      (metabot.construct/execute-representations-query external-query)
      (catch clojure.lang.ExceptionInfo e
        (throw (cond-> (with-schema-detail e)
                 (:agent-error? (ex-data e)) with-recovery-hint))))))

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
   argument, ending in `hint` (server text naming the shapes the calling tool accepts); permission
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
         (if-let [text (common/exception-message e)]
           (message/msg ["\"definition\" could not be resolved: %s %s"] (common/ellipsize text 300) hint)
           (message/msg ["\"definition\" could not be resolved. %s"] hint)))
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
      (common/throw-teaching-error (message/msg [(str "Query handle contents are invalid — run "
                                                      "the query again to get a fresh handle.")])))))

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
            (common/throw-teaching-error (message/msg [(str "Query handle not found — it may "
                                                            "have expired; run the query again.")])))
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
   `{:query <decoded map> :prompt <string-or-nil>}`, or throws a teaching error.

   Refuses a handle carrying bound `:parameters`. `execute_sql` re-attaches the values it ran
   with so the handle re-runs and visualizes as what the agent saw, but `:parameters` is
   runtime-only — [[metabase.lib.schema]]'s serialize-query strips it on the way into
   `dataset_query`. Saving such a handle would therefore persist the query WITHOUT its filter and
   without complaining: a card built from `WHERE quantity > 4` falls back to the tag's default and
   returns rows the agent's own run excluded. That is a disclosure, not just a wrong row count, so
   the save path fails closed rather than guessing at the card shape the values should have become
   (a card `:parameters` entry or a template-tag `:default`, which differ between native and MBQL
   handles)."
  [mcp-session-id user-id handle]
  (let [{:keys [encoded_query prompt]}
        (or (mcp.session/resolve-query-handle mcp-session-id user-id handle)
            (common/throw-teaching-error (message/msg [(str "Query handle not found — it may "
                                                            "have expired; run the query again.")])))
        query (decode-stored-query encoded_query)]
    (query-guards/validate-serialized-query! query)
    (query-guards/check-token-query-permissions! query)
    (when (seq (:parameters query))
      (common/throw-teaching-error
       (message/msg [(str "This query_handle carries bound parameter values, which a saved query can't keep — "
                          "storing it would drop the filter and save a question that returns rows the run you "
                          "saw excluded. Save it with the filter built in instead: pass `native` with "
                          "`template_tags` giving each tag a `default`, or re-run the query with the values "
                          "written into the SQL/MBQL filter itself and save that handle.")])))
    {:query query :prompt prompt}))

;;; ------------------------------------------------ Raw-SQL kill switch -------------------------------------------

(defn check-execute-sql-enabled!
  "Throw a 403 unless the instance-level `mcp-execute-sql-enabled` kill switch is on. `subject` opens the
   refusal sentence, naming what the instance refused.

   The gate covers every v2 path on which the AGENT AUTHORS the SQL — `execute_sql` itself, and
   `question_write` / `transform_write` storing agent-authored native SQL — so a switch an admin
   turned off is not reachable by a second route to the same capability.

   It deliberately does not cover running SQL that already exists as a saved, permission-checked
   artifact: `run_saved_question` executes a stored native card without consulting it, as does
   `execute_query` over a `:source-card` naming one. That matches the setting's own scope —
   \"Whether the MCP `execute_sql` tool is available\" — and the read check on the card is what
   guards those. Turning the switch off removes the agent's ability to write SQL, not the
   instance's ability to run questions it already has."
  [subject]
  (when-not (agent-api.settings/mcp-execute-sql-enabled)
    (common/throw-teaching-error
     (message/msg [(str "%s is disabled on this instance — an admin can "
                        "re-enable it with the mcp-execute-sql-enabled setting.")]
                  subject)
     {:status-code 403})))
