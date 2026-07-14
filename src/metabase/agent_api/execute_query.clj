(ns metabase.agent-api.execute-query
  "The v2 `execute_query` tool: one decision point — *I have a query, run it*.

   `query` (portable MBQL 5 JSON) or `query_handle` names the query, `validate_only` is the dry run, and a
   handle comes back either way, so a save or a chart reuses the validated query without the model
   re-carrying it. Building a query, running one, and paging through one are all this tool: a catalog that
   splits them makes a model holding a query choose between overlapping doors, and that choice is the one it
   gets wrong.

   The query travels in the agent API's **external dialect**: staged like the product's own query format,
   but self-describing. Field refs are portable name arrays
   (`[\"field\" {} [\"Sample Database\" \"PUBLIC\" \"ORDERS\" \"TOTAL\"]]`), sources are table-name paths or
   card entity_ids, never bare integer ids — so a query the agent reads back from `get_content` round-trips
   into a run without a translation table, and a name that resolves to nothing is an error rather than a
   query silently run against the wrong column. The resolution pipeline behind that is Metabot's own
   ([[metabase.metabot.tools.construct/execute-representations-query]]): validate → repair → resolve → gate
   on the query builder's `canRun`.

   Continuation is `query_handle` + `offset`: the query lives in the store, so nothing but the offset travels
   through the model's context to read the next page.

   Rows come back in the dataset REST shape (`cols` + `rows` as value arrays), and they travel exactly once —
   in the text block. `structuredContent` carries only what a next call consumes: the handle, the count, and
   whether more rows are behind this page."
  (:require
   [metabase.agent-api.handles :as handles]
   [metabase.agent-api.query :as agent-api.query]
   [metabase.agent-api.results :as results]
   [metabase.agent-api.tools :as tools]
   [metabase.api.common :as api]
   [metabase.lib.core :as lib]
   [metabase.metabot.tools.construct :as metabot-construct]
   [metabase.util.malli :as mu]))

(set! *warn-on-reflection* true)

(def ^:private Params
  "The arguments [[execute-query]] contracts on. `POST /v2/execute-query` declares the wire schema, with the
   bounds a client is held to; this is the looser shape the domain function accepts."
  [:map
   [:query           {:optional true} [:maybe :map]]
   [:query_handle    {:optional true} [:maybe :string]]
   [:validate_only   {:optional true} [:maybe :boolean]]
   [:row_limit       {:optional true} [:maybe :int]]
   [:offset          {:optional true} [:maybe :int]]
   [:response_format {:optional true} [:maybe :string]]])

;;; ──────────────────────────────────────────────────────────────────
;;; The query a call names
;;; ──────────────────────────────────────────────────────────────────

(defn- check-mbql!
  "Refuse a native query, in the tool's voice: `execute_query` carries the MBQL scope, not the SQL one, so a
   handle or a payload that smuggles SQL past it would run raw SQL without the native-query scope and behind
   the `execute_sql` kill switch."
  [query-map]
  (when (agent-api.query/native-query? query-map)
    (tools/teaching-error!
     "This is a native SQL query. Run it with `execute_sql`, which is scoped for raw SQL.")))

(defn- resolve-query
  "The serialized MBQL query a call names, from a handle or from the portable payload.

   The payload path runs the resolution pipeline, which is where the teaching happens: an unknown table or
   column comes back naming the recovery (it names no candidates on purpose — its metadata provider is
   un-sandboxed, so a candidate list would tell a sandboxed caller which tables exist). The handle path skips
   the pipeline: that query resolved once already, when the handle was minted."
  [{:keys [query query_handle]}]
  (if query_handle
    ;; Normalized on the way out of the store: a handle's row is JSON, so its markers come back as strings
    ;; (`"mbql/query"`), and MBQL is keywords.
    (or (some-> (handles/read-query api/*current-user-id* query_handle) lib/normalize)
        (tools/teaching-error!
         (str "No query handle " (pr-str query_handle) ". A handle expires, and it belongs to the user who "
              "minted it — send the query itself in `query`.")
         404))
    (do
      ;; Ahead of the pipeline, which would reject raw SQL as a malformed *MBQL* query and send the model
      ;; off to fix a query that was never MBQL in the first place.
      (check-mbql! query)
      (-> (metabot-construct/execute-representations-query query)
          (get-in [:structured-output :query])
          lib/prepare-for-serialization))))

;;; ──────────────────────────────────────────────────────────────────
;;; The tool
;;; ──────────────────────────────────────────────────────────────────

(mu/defn execute-query :- :map
  "Validate a query, run it, and hand back a handle for what ran.

   The handle is a by-product, not a prerequisite: direct execution needs no construct step, and an unused
   handle just expires. It is minted for provenance — \"run it, then save *that*\" saves the byte-identical
   query the caller just saw, where re-emitting the MBQL is regeneration and can quietly mutate what gets
   saved. The store is content-addressed, so an iteration loop writes one row per distinct query rather than
   one per attempt."
  [{:keys [query_handle validate_only row_limit offset response_format] :as params} :- Params]
  (tools/check-exactly-one! params [:query :query_handle])
  (let [query-map (resolve-query params)]
    ;; Everything that has to hold before a query runs, and every one of them holds for `validate_only` too. A
    ;; dry run that blesses a call the same handle would later refuse is worse than no dry run at all — and
    ;; when what it blesses is a table the caller cannot query or a column their sandbox hides, the refusal it
    ;; skipped was the only thing standing between the model and an existence oracle for exactly the data the
    ;; permission was meant to hide. [[results/pager]] refuses an offset MBQL's `:page` cannot express.
    (check-mbql! query-map)
    (agent-api.query/check-shape! query-map)
    (agent-api.query/check-source-permissions! query-map)
    (let [pager  (results/pager query-map
                                (or offset 0)
                                (tools/clamp-limit row_limit results/default-row-limit results/max-row-limit))
          ;; A handle already names this query, byte for byte. Re-minting would hash the re-encoded JSON, which
          ;; need not encode identically, and hand back a *different* handle than the one the caller passed —
          ;; while the truncation message tells them to keep using the same one.
          handle (or query_handle (handles/store-query! api/*current-user-id* query-map))]
      (if validate_only
        {:query_handle handle :validated true}
        (results/page-response pager
                               (results/run-query! (results/window pager query-map))
                               {:handle handle :response-format response_format})))))
