(ns metabase.mcp.v2.tools.visualize
  "The v2 MCP Apps visualization tools: `visualize_query` renders a query as an interactive
   in-chat chart, `render_drill_through` renders the follow-up when the user clicks into one.

   Both are UI tools — they return a `query_handle` and point the host at a `ui://` iframe shell
   ([[metabase.mcp.v2.resources]]) that resolves the handle over an authenticated endpoint. The
   result data never enters the model context: the agent gets a handle and a steering line, the
   iframe gets the rows. That's the v2 change from v1, which inlined the base64 query in
   `structuredContent`."
  (:require
   [metabase.agent-api.query-guards :as query-guards]
   [metabase.api.common :as api]
   [metabase.lib.core :as lib]
   [metabase.mcp.session :as mcp.session]
   [metabase.mcp.v2.common :as common]
   [metabase.mcp.v2.registry :as registry]
   [metabase.mcp.v2.resources :as v2.resources]
   [metabase.metabot.tools.construct :as metabot.construct]
   [metabase.util.json :as json]))

(set! *warn-on-reflection* true)

(def ^:private visualize-steering
  "Rendering the visualization in the interactive UI. This is the final answer — do not call an execute tool afterwards, and do not tell the user to switch display types or open a Metabase panel or sidebar.")

(defn- resolve-visualizable-handle!
  "Assert `handle` exists and belongs to the caller, throwing a teaching error otherwise.

   Deliberately the raw store read rather than [[metabase.mcp.v2.common/resolve-query-handle!]]
   and friends: those re-validate the stored query against the shape v2's execute tools mint
   (`:stages`, positive `:limit`, MBQL-only). A visualizable handle need not have that shape —
   the drill-through handles the iframe mints through `POST /api/embed-mcp/drills` hold the
   SDK's legacy `dataset_query`, and `execute_sql` handles hold native SQL. Both are visualizable
   by design, so the guards would reject exactly the handles these tools exist to render.

   Access control still holds: the store read is keyed on `(mcp session, user)`, and the iframe
   executes the query through the ordinary QP path under the user's own session, where data
   permissions are enforced."
  [session-id handle]
  (or (mcp.session/resolve-query-handle session-id api/*current-user-id* handle)
      (common/throw-teaching-error
       "Query handle not found — it may have expired; run the query again.")))

(defn- handle-for-visualization!
  "Resolve `visualize_query`'s mutually exclusive inputs to the handle the iframe will render.

   A fresh `query` runs the representations pipeline (validate → repair → resolve, permission
   checked) and mints a handle, so the iframe renders exactly what was resolved. A supplied
   `query_handle` is reused as-is rather than re-minted — the stored query is unchanged, and a
   duplicate handle would only add a row for the GC to collect.

   Native is allowed through the handle path but not the fresh path: `execute_sql` mints handles
   whose SQL is visualizable by design, while inline `query` is MBQL 5 only, matching
   `execute_query`."
  [{:keys [query query_handle prompt]} session-id]
  (let [provided (cond-> []
                   query        (conj :query)
                   query_handle (conj :query_handle))]
    (when-not (= 1 (count provided))
      (common/throw-teaching-error
       (str "Pass exactly one of query | query_handle: `query_handle` for a query you already ran "
            "(preferred — no re-resolution), `query` for a fresh portable MBQL 5 query.")))
    (if query_handle
      (do (resolve-visualizable-handle! session-id query_handle)
          query_handle)
      (do
        (query-guards/reject-native-query! query)
        (common/mint-query-handle!
         session-id
         api/*current-user-id*
         (-> (metabot.construct/execute-representations-query query)
             (get-in [:structured-output :query])
             lib/prepare-for-serialization
             common/encode-serialized-query)
         prompt)))))

(defn- visualization-content
  "The two response channels for both UI tools. `structuredContent` is what the iframe reads;
   the text mirrors it so the model is never told less than the iframe was."
  [payload]
  (common/success-content (str (json/encode payload) "\n" visualize-steering) payload))

;;; ---------------------------------------------- visualize_query -------------------------------------------------

(def ^:private visualize-query-args-schema
  [:map {:closed true}
   [:query {:optional true}
    [:maybe [:map {:description "A fresh query in the portable MBQL 5 dialect (same shape execute_query takes): named refs, not numeric ids, never base64. Exactly one of query | query_handle."}]]]
   [:query_handle {:optional true}
    [:maybe [:string {:min 1 :description "A query_handle from a previous execute_query / execute_sql call — visualizes the exact stored query, MBQL or native SQL. Preferred over query. Exactly one of query | query_handle."}]]]
   [:display {:optional true}
    [:maybe (into [:enum {:description "Chart type to render. Omit to let the visualization infer one from the result shape — prefer omitting it unless the user asked for a specific chart type."}]
                  common/card-display-values)]]
   [:prompt {:optional true}
    [:maybe [:string {:min 1 :max 10000 :description "The user's original request. Only used when minting a fresh handle from `query`; a supplied query_handle already carries the prompt it was stored with."}]]]])

(def ^:private visualize-query-output-schema
  [:map
   [:query_handle {:description "Handle the visualization iframe resolves to fetch the query and its results."}
    :string]
   [:display {:optional true :description "Chart type the visualization renders as, when one was requested."}
    [:maybe :string]]])

(registry/deftool visualize-query
  "Visualize a query as an interactive chart or table, rendered inline in the conversation. Pass exactly one of: query_handle (preferred — a handle from execute_query or execute_sql, MBQL or native SQL) or query (a fresh portable MBQL 5 query, same dialect execute_query takes). Optionally pass display to pick the chart type; omit it and the chart type is inferred from the result shape.

Use this for any request to show, display, visualize, plot, chart, or present results — for example `Show me customers`, `Show me orders by month`, `Display revenue by region`, `Visualize active users over time`. Rendering the visualization IS the final answer: do not call execute_query or execute_sql afterwards to restate the numbers, and do not tell the user to change display types or open the Metabase query builder, a panel, or a sidebar — this is a lightweight inline visualization, not the full Metabase UI."
  {:name                "visualize_query"
   :scope               (v2.resources/resource-scope v2.resources/visualize-query-uri)
   :annotations         {:readOnlyHint true :idempotentHint true}
   :required-extensions #{:mcp-app-ui}
   :_meta               {:ui {:resourceUri v2.resources/visualize-query-uri}}
   :outputSchema        visualize-query-output-schema
   :args                visualize-query-args-schema}
  [{:keys [display] :as args} {:keys [session-id]}]
  (let [handle (handle-for-visualization! args session-id)]
    (visualization-content (cond-> {:query_handle handle}
                             display (assoc :display display)))))

;;; -------------------------------------------- render_drill_through ----------------------------------------------

(def ^:private render-drill-through-args-schema
  [:map {:closed true}
   [:query_handle
    [:string {:min 1 :description "The handle UUID from the user's drill-through message. Pass it through verbatim — do not run the query yourself."}]]])

(def ^:private render-drill-through-output-schema
  [:map
   [:query_handle {:description "Handle the visualization iframe resolves to fetch the drill-through query and its results."}
    :string]])

(registry/deftool render-drill-through
  "Render the drill-through visualization the user just navigated into. Use this — not an execute tool — when the user asks to show a result and their message carries a handle UUID; it is the exact follow-up for the phrase `Show me the result`. Pass that UUID through as query_handle without running the query yourself. Like visualize_query, this renders a lightweight inline visualization and is the final answer: do not restate the numbers with an execute tool, and do not tell the user to change display types or open a Metabase panel or sidebar."
  {:name                "render_drill_through"
   :scope               (v2.resources/resource-scope v2.resources/render-drill-through-uri)
   :annotations         {:readOnlyHint true :idempotentHint true}
   :required-extensions #{:mcp-app-ui}
   :_meta               {:ui {:resourceUri v2.resources/render-drill-through-uri}}
   :outputSchema        render-drill-through-output-schema
   :args                render-drill-through-args-schema}
  [{:keys [query_handle]} {:keys [session-id]}]
  (resolve-visualizable-handle! session-id query_handle)
  (visualization-content {:query_handle query_handle}))
