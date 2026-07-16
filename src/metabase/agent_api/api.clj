(ns metabase.agent-api.api
  "Customer-facing Agent API for headless BI applications.
  Endpoints are versioned (e.g., /v1/search) and use standard HTTP semantics."
  (:require
   [clojure.string :as str]
   [metabase.agent-api.query-guards :as query-guards]
   [metabase.agent-api.settings :as agent-api.settings]
   [metabase.agent-api.validation :as agent-api.validation]
   [metabase.ai-tracing.core :as ait]
   [metabase.api.common :as api]
   [metabase.api.macros :as api.macros]
   [metabase.api.macros.scope :as scope]
   [metabase.api.open-api :as open-api]
   [metabase.api.routes.common :as api.routes.common]
   [metabase.auth-identity.core :as auth-identity]
   [metabase.channel.urls :as channel.urls]
   [metabase.collections.core :as collections]
   [metabase.collections.models.collection :as collection]
   [metabase.dashboards.autoplace :as autoplace]
   [metabase.dashboards.models.dashboard :as dashboard]
   [metabase.dashboards.models.dashboard-card :as dashboard-card]
   [metabase.events.core :as events]
   [metabase.lib-be.core :as lib-be]
   [metabase.lib.core :as lib]
   [metabase.metabot.core :as metabot]
   [metabase.metabot.tools.construct :as metabot-construct]
   [metabase.metabot.tools.resources :as metabot-resources]
   [metabase.metabot.tools.search :as metabot-search]
   [metabase.metabot.util :as metabot.u]
   [metabase.queries.core :as queries]
   [metabase.query-permissions.core :as query-perms]
   [metabase.query-processor.card :as qp.card]
   [metabase.query-processor.core :as qp]
   [metabase.query-processor.middleware.permissions :as qp.perms]
   [metabase.query-processor.streaming :as qp.streaming]
   [metabase.request.core :as request]
   [metabase.server.streaming-response :as streaming-response]
   [metabase.util :as u]
   [metabase.util.json :as json]
   [metabase.util.log :as log]
   [metabase.util.malli.registry :as mr]
   [metabase.util.malli.schema :as ms]
   [toucan2.core :as t2]))

;;; --------------------------------------------------- Defaults ------------------------------------------------------

(def ^:private ^:const page-size
  "Rows returned per page when paginating the combined query endpoint via continuation tokens.
   Also used as the query processor's per-call row constraint."
  200)

(def ^:private ^:const max-total-row-limit
  "Ceiling on the user-requested :limit for the combined query endpoint. Agents can paginate
   through up to this many rows across pages."
  2000)

;;; ---------------------------------------------------- Helpers ------------------------------------------------------

(defn- personal-collection-id
  "Id of the current caller's personal collection, created on demand; `nil` for API-key callers,
  which have none. Agent-created content defaults here rather than the root collection REST uses —
  the user's own space, not shared \"Our analytics\"."
  []
  (:id (collection/user->personal-collection api/*current-user-id*)))

(defn- collection-path
  "Permission-filtered location breadcrumb of `collection-id`, e.g. \"Our analytics / Marketing / Q3\".
  Ancestors the caller can't read are omitted, matching the app breadcrumb.
  A `nil` `collection-id` is the root collection (\"Our analytics\"), not a personal collection."
  [collection-id]
  (if-not collection-id
    (:name (collection/root-collection-with-ui-details nil))
    (let [coll      (t2/select-one [:model/Collection :id :name :location :personal_owner_id
                                    :namespace :archived_directly]
                                   collection-id)
          ;; `:effective_ancestors` is the app breadcrumb: it leads with the "Our analytics" root and
          ;; drops ancestors the caller can't read. A personal subtree leads with the personal
          ;; collection instead, so drop that root crumb for them.
          ancestors (cond->> (:effective_ancestors (t2/hydrate coll :effective_ancestors))
                      (collection/is-personal-collection-or-descendant-of-one? coll)
                      (remove #(= "root" (:id %))))
          chain     (collection/personal-collections-with-ui-details (conj (vec ancestors) coll))]
      (str/join " / " (map :name chain)))))

;;; --------------------------------------------------- Schemas ------------------------------------------------------

;; Response schemas for the Agent API.
;; - Use snake_case keys in schema definitions (JSON convention)
;; - Use :encode/api transformers to convert kebab-case data from internal functions
;; - Convert keyword enum values (like :table, :metric) to strings for JSON

(mr/def ::search-result-item
  "A table, model, metric, saved question, dashboard, or collection returned from search.
   The map is intentionally open: the underlying search enriches results with extra fields
   (e.g. `:database_name`, `:portable_entity_id`, metric base-table info) that callers may
   ignore. Only the keys agents commonly rely on are declared here."
  [:map {:encode/api #(update-keys % metabot.u/safe->snake_case_en)}
   [:id :int]
   [:type [:enum "table" "metric" "model" "question" "dashboard" "collection"]]
   [:name :string]
   [:display_name {:optional true} [:maybe :string]]
   [:description {:optional true} [:maybe :string]]
   [:database_id {:optional true} [:maybe :int]]
   [:database_schema {:optional true} [:maybe :string]]
   [:verified {:optional true} [:maybe :boolean]]
   [:official {:optional true} [:maybe :boolean]]
   ;; Present on questions, dashboards, metrics, and models — the collection the entity lives in.
   [:collection {:optional true} [:maybe :map]]
   ;; Present on collection results — the parent location path (e.g. "/12/34/").
   [:location {:optional true} [:maybe :string]]
   [:updated_at {:optional true} [:maybe :any]]
   [:created_at {:optional true} [:maybe :any]]])

(mr/def ::search-response
  "Search results containing tables, models, metrics, saved questions, dashboards, and
   collections matching the query."
  [:map {:encode/api #(update-keys % metabot.u/safe->snake_case_en)}
   [:data [:sequential ::search-result-item]]
   [:total_count :int]])

;;; --------------------------------------------------- Endpoints ----------------------------------------------------

(api.macros/defendpoint :get "/v1/ping" :- [:map [:message :string]]
  "Health check endpoint for the Agent API."
  {:scope :unchecked}
  []
  {:message "pong"})

(defn- coerce-query-list
  "Defensive coercion for `/v1/search`'s query arguments. Some MCP clients (notably
   Codex) serialize array args through a string layer, so a caller that intended to
   send `[\"orders\"]` may actually send `\"[\\\"orders\\\"]\"`. Accept either shape:
   an array is returned as-is; a string that parses as a JSON array of non-blank
   strings is unwrapped; any other string is treated as a single-element query."
  [v]
  (cond
    (nil? v)        nil
    (sequential? v) v
    (string? v)     (or (try
                          (let [parsed (json/decode+kw v)]
                            (when (and (sequential? parsed)
                                       (every? #(and (string? %) (not (str/blank? %))) parsed))
                              parsed))
                          (catch Exception _ nil))
                        [v])
    :else           v))

(api.macros/defendpoint :post "/v1/search" :- ::search-response
  "Search for tables, models, metrics, saved questions, dashboards, and collections.

  Supports both term-based and semantic search queries. Results are ranked using
  Reciprocal Rank Fusion when both query types are provided."
  {:scope metabot/agent-search
   :tool  {:name "search"
           :title "Search Metabase Content"
           :description (str "Search for tables, models, metrics, saved questions, dashboards, and collections "
                             "in Metabase. "
                             "Use term_queries for keyword search or semantic_queries for natural language search. "
                             "Both arguments are arrays of strings, for example term_queries: [\"orders\", \"revenue\"].")
           :annotations {:read-only? true}}}
  [_route-params
   _query-params
   {term-queries     :term_queries
    semantic-queries :semantic_queries}
   :- [:map
       [:term_queries {:optional true
                       :tool/description "Keyword search queries as an array of strings, for example [\"orders\", \"revenue\"]."}
        [:maybe [:or [:sequential ms/NonBlankString] ms/NonBlankString]]]
       [:semantic_queries {:optional true
                           :tool/description "Natural-language search queries as an array of strings, for example [\"how much revenue did we make\"]."}
        [:maybe [:or [:sequential ms/NonBlankString] ms/NonBlankString]]]]]
  (let [results (metabot-search/search
                 {:term-queries     (or (coerce-query-list term-queries) [])
                  :semantic-queries (or (coerce-query-list semantic-queries) [])
                  :entity-types     ["table" "metric" "model" "question" "dashboard" "collection"]
                  :limit            (or (request/limit) 50)})]
    {:data        results
     :total_count (count results)}))

;;; ------------------------------------------------ Construct Query -------------------------------------------------

(mr/def ::construct-query-request
  "Request body for /v2/construct-query and the fresh-query branch of /v2/query.
  A single `:query` key whose value is a JSON object matching
  [[metabase.lib.schema/external-query]] — the canonical portable MBQL 5 wire format. The
  query is fully self-describing: the database is derived from the first stage's
  `source-table:` or `source-card:`, all field references are portable FKs
  (`[<db-name>, <schema>, <table-name>, <column-name>]`), and there is no auxiliary
  `source_entity` / `referenced_entities` envelope. See
  `resources/metabot/prompts/tools/construct_notebook_query.md` for the full format reference
  (including operators, joins, expressions, multi-stage queries, and FK conventions).

  Closed map: any extra top-level keys (notably the legacy `source_entity` /
  `referenced_entities` envelope from before the repr migration) are rejected with a 400 so
  callers don't silently send fields the server ignores.

  The inner `:query` value is intentionally typed as a plain `:map` at this boundary rather
  than `::lib.schema/external-query`. Reasons:

  1. Deep MBQL-shape validation runs inside the representations pipeline
     (`metabot.tools.construct/execute-representations-query` calls `repr/validate-query`
     after the repair pass), so the boundary check would be redundant.

  2. The strict-tool manifest lint (`assert-optional-fields-nullable!`) walks every map
     reachable from the tool input schema. `::external-query` references `::query`, which
     carries several `:optional` keys (`:lib/metadata`, `:database`, `:settings`, …) that
     are not `[:maybe ...]` — for sound reasons unrelated to this endpoint. Recursing into
     them would force a wide schema change just to satisfy the lint at the agent boundary."
  [:map {:closed true}
   [:query {:tool/description (str "A Metabase MBQL 5 query as a JSON object. See the "
                                   "`construct_notebook_query` tool for the format reference.")}
    :map]
   ;; The user's original message, when available, captured so `visualize_query` can later
   ;; surface it back to the iframe alongside the query body for feedback submission. The MCP
   ;; layer stores it with the handle (see `metabase.mcp.tools/make-store-construct-query-result`).
   ;; Bounded at 10000 chars to match the constraint master enforced on the legacy program path.
   [:prompt {:optional true} [:maybe [:string {:min 1 :max 10000}]]]])

(mr/def ::construct-query-response
  "Response containing a base64-encoded MBQL query for use with /v1/execute. The optional
  `:prompt` echoes the request's prompt back so the MCP layer can store it with the
  handle (see `metabase.mcp.tools/make-store-construct-query-result`)."
  [:map
   [:query  ms/NonBlankString]
   [:prompt {:optional true} [:maybe ms/NonBlankString]]])

(defn- evaluate-external-query-to-live-query
  "Run the representations pipeline (validate → convert → repair → resolve) on a request body
  and return the resolved MBQL 5 lib query (with `:lib/metadata` attached).

  The pipeline raises `:agent-error?` ex-data on any LLM-input failure (unknown DB, unknown
  table, ambiguous FK, etc.); we let those propagate so [[api.macros/defendpoint]] surfaces
  them with the appropriate 4xx status code instead of a 500."
  [body]
  (-> (metabot-construct/execute-representations-query (:query body))
      (get-in [:structured-output :query])))

(defn- evaluate-external-query-for-execution
  "Evaluate a request body and return a plain MBQL 5 query map suitable for serialization into
  a continuation token and execution by the QP."
  [body]
  (lib/prepare-for-serialization (evaluate-external-query-to-live-query body)))

(api.macros/defendpoint :post "/v2/construct-query" :- ::construct-query-response
  "Construct an MBQL query from a portable MBQL 5 representations JSON payload.

  The body is `{\"query\": <external-query>}` where `<external-query>` is a JSON object
  matching `::lib.schema/external-query` \u2014 see the `construct_notebook_query` tool
  documentation for the format reference. Returns a base64-encoded MBQL query that can be
  executed via /v1/execute or paginated via /v2/query."
  {:scope metabot/agent-query-construct
   :tool  {:name "construct_query"
           ;; Condensed inline summary so LLMs see the shape directly in `tools/list`. Full
           ;; grammar lives in the `construct_notebook_query` tool prompt.
           :description
           (str "Construct a Metabase MBQL 5 query as JSON. Pass the body "
                "`{\"query\": <object>}`; returns `{\"query_handle\": \"<uuid>\"}` to feed "
                "`execute_query` or `visualize_query`.\n"
                "\n"
                "Workflow: use search / entity_details first to discover the exact database, "
                "schema, table, and column NAMES (not numeric IDs). Never invent identifiers.\n"
                "\n"
                "Shape: every clause is `[\"op\", {}, ...args]` with a MANDATORY empty options "
                "map at position 1. Every field reference is "
                "`[\"field\", {}, [<db-name>, <schema-or-null>, <table-name>, <column-name>]]` "
                "(4-segment portable FK string array, NOT a numeric id). Cross-stage refs use "
                "a bare column-name string in the third slot: `[\"field\", {}, \"count\"]`.\n"
                "\n"
                "Top level: `{\"lib/type\": \"mbql/query\", \"stages\": [...]}`. Each stage has "
                "`\"lib/type\": \"mbql.stage/mbql\"` plus either `source-table` (portable FK) "
                "or `source-card` (entity_id string) on the FIRST stage only; later stages "
                "implicitly read the previous stage's output. Per-stage clause keys: "
                "`filters`, `aggregation`, `breakout`, `expressions`, `fields`, `joins`, "
                "`order-by`, `limit`.\n"
                "\n"
                "Minimal example (count of orders by month):\n"
                "```\n"
                "{\"query\": {\"lib/type\": \"mbql/query\",\n"
                "             \"stages\": [{\"lib/type\": \"mbql.stage/mbql\",\n"
                "                          \"source-table\": [\"Sample Database\", \"PUBLIC\", \"ORDERS\"],\n"
                "                          \"aggregation\": [[\"count\", {}]],\n"
                "                          \"breakout\": [[\"field\", {\"temporal-unit\": \"month\"},\n"
                "                                        [\"Sample Database\", \"PUBLIC\", \"ORDERS\", \"CREATED_AT\"]]]}]}}\n"
                "```\n"
                "\n"
                "Common pitfalls: (1) forgetting the `{}` options map; (2) writing numeric "
                "ids where a portable FK is required; (3) putting a post-aggregation filter "
                "(`[\">\", {}, [\"aggregation\", {}, 0], 10]`) alongside `order-by` / `limit` "
                "in the same stage \u2014 split into two stages explicitly. See the "
                "`construct_notebook_query` tool prompt for the full grammar, operator "
                "catalog, joins, expressions, and multi-stage examples.")
           :annotations {:read-only? true :idempotent? true}}}
  [_route-params
   _query-params
   {:keys [prompt] :as body} :- ::construct-query-request]
  (let [query (evaluate-external-query-for-execution body)]
    ;; Record the resolved query for eval tracing (inert unless capturing). The MCP `construct_query`
    ;; tool only returns an opaque handle, so this span attribute is how an eval harness recovers the
    ;; agent's actual query off the trace to grade it. `query` is already serialization-ready (no
    ;; `:lib/metadata`), so it stays small.
    (ait/record! {:ai/query query})
    (cond-> {:query (-> query json/encode u/encode-base64)}
      prompt (assoc :prompt prompt))))

;;; --------------------------------------------- Construct Native Query ---------------------------------------------

(mr/def ::construct-native-query-request
  "Request body for /v1/construct-native-query: a target database and a raw SQL string."
  [:map {:closed true}
   [:database_id {:tool/description "Numeric id of the database to run the SQL against."}
    ms/PositiveInt]
   [:sql {:tool/description "The raw SQL query text."}
    ms/NonBlankString]])

(api.macros/defendpoint :post "/v1/construct-native-query" :- ::construct-query-response
  "Construct a native (raw SQL) query against a database.

  Wraps `sql` into a serialized native query and returns it base64-encoded — the same
  `{\"query\": <base64>}` shape as /v2/construct-query — so it can be saved as a question via
  /v1/question (the MCP layer swaps the base64 for a `query_handle`).

  This endpoint does NOT execute the SQL; to run native SQL ad hoc use /v1/execute-sql. The
  MBQL execution endpoints (/v1/execute, /v2/query) reject native queries by design, so a
  handle produced here is for saving, not for /v2/query execution."
  {:scope metabot/agent-sql-construct
   :tool  {:name "construct_native_query"
           :description (str "Construct a native (raw SQL) query for the given database. Returns "
                             "`{\"query_handle\": \"<uuid>\"}` to feed `create_question` and save it "
                             "as a question. Use this ONLY for native SQL — for MBQL use "
                             "`construct_query`. This does NOT run the SQL; to execute SQL ad hoc "
                             "use `execute_sql`. Saving the resulting question requires native-query "
                             "permission on the target database.")
           :annotations {:read-only? true :idempotent? true}}}
  [_route-params
   _query-params
   {:keys [database_id sql]} :- ::construct-native-query-request]
  ;; Construction does not run the query, but require the caller to at least be able to see the
  ;; target database so a bogus/inaccessible database_id fails here rather than at save time.
  (api/read-check :model/Database database_id)
  ;; Emit MBQL 5 (via `lib/native-query` + `prepare-for-serialization`, same as `construct_query`)
  (let [mp    (lib-be/application-database-metadata-provider database_id)
        query (-> (lib/native-query mp sql) lib/prepare-for-serialization)]
    ;; See /v2/construct-query: record the resolved query so an eval harness can grade it off the trace.
    (ait/record! {:ai/query query})
    {:query (-> query json/encode u/encode-base64)}))

;;; ------------------------------------------------- Combined Query -------------------------------------------------

(defn- generate-continuation-token
  "Build a base64-encoded continuation token carrying the query and next-page pagination info.
   :limit is the user's total row cap across all pages, not the per-page size."
  [query-map total-limit page]
  (-> {:query      query-map
       :pagination {:limit total-limit :page (inc page)}}
      json/encode
      u/encode-base64))

(defn- decode-base64-json-map
  "Decode a base64-encoded JSON object to a Clojure map, returning a 400 (not a 500) on malformed input.
   The query_handle and continuation-token payloads are client-reachable, so garbage in must surface as
   a clean 400 rather than a decode exception that bubbles up as a 500."
  [encoded]
  (let [decoded (try
                  (-> encoded u/decode-base64 json/decode+kw)
                  (catch Exception _ ::invalid))]
    (if (map? decoded)
      decoded
      (throw (ex-info "Invalid request: expected a base64-encoded JSON object."
                      {:status-code 400})))))

(defn- decode-continuation-token
  "Decode a base64-encoded continuation token into {:query ... :pagination ...}.
   The token is client-supplied, so sanity-check the pagination ints to turn
   garbage into a 400 rather than a downstream 500. Permission re-validation on
   the embedded query happens in [[query-guards/check-token-query-permissions!]] — a token
   doesn't grant access the bearer wouldn't otherwise have."
  [token]
  (let [decoded (decode-base64-json-map token)
        {:keys [limit page]} (:pagination decoded)]
    (api/check (and (int? limit) (pos? limit))
               [400 "Invalid continuation token: limit must be a positive integer"])
    (api/check (and (int? page) (pos? page))
               [400 "Invalid continuation token: page must be a positive integer"])
    decoded))

(defn- clamp-total-limit
  "Cap `limit` at the combined endpoint's hard maximum.
   A nil `limit` (no explicit limit in the query) defaults to the full 2000-row budget so that
   omitting :limit doesn't silently collapse pagination to a single page."
  [limit]
  (min (or limit max-total-row-limit) max-total-row-limit))

(defn- total-row-limit
  "The user's requested :limit read from a resolved lib query, defaulted and capped."
  [live-query]
  (clamp-total-limit (lib/current-limit live-query)))

(defn- serialized-query-limit
  "Read the last-stage :limit from a serialized MBQL 5 query map — the `lib/current-limit`
   equivalent for the plain-map form carried by a query_handle (already resolved, so we read it
   off the map rather than rehydrating a live query)."
  [query-map]
  (get-in query-map [:stages (dec (count (:stages query-map))) :limit]))

(defn- rows-before-page
  "Total rows consumed by the pages preceding `page`. Single source of truth for
   the page-size * (page - 1) arithmetic used by both sizing and pagination-exit."
  [page]
  (* (dec page) page-size))

(defn- remaining-page-rows
  "Rows to request for this page, respecting the user's total cap.
   Returns at most page-size, and never more than remaining rows under the cap."
  [total-limit page]
  (max 0 (min page-size (- total-limit (rows-before-page page)))))

(defn- more-pages-available?
  "True when this page was filled to its requested size *and* the total cap still
   has room for more rows — i.e. we should emit a continuation token."
  [page total-limit rows-returned items]
  (and (= rows-returned items)
       (< (rows-before-page (inc page)) total-limit)))

(defn- apply-page-to-query
  "Set `:page` on the last stage of a serialized MBQL 5 query map. Operates on the
  plain-map form because the continuation-token path only has that shape available —
  rehydrating to a live lib query here would require a metadata provider we don't
  currently plumb through the token."
  [query-map page items]
  (let [stages   (:stages query-map)
        last-idx (dec (count stages))]
    (assoc-in query-map [:stages last-idx :page] {:page page :items items})))

(defn- prepare-agent-query
  "Apply standard Agent API query preparation: middleware defaults and execution info."
  [query]
  (-> query
      (update-in [:middleware :js-int-to-string?] (fnil identity true))
      qp/userland-query-with-default-constraints
      (update :info merge {:executed-by api/*current-user-id*
                           :context     :agent})))

(defn- prepare-combined-query
  "Apply the tighter row cap used by the combined query endpoint. Each page is bounded
   by page-size; the user's total-limit is enforced separately via pagination."
  [query]
  (assoc (prepare-agent-query query)
         :constraints {:max-results           page-size
                       :max-results-bare-rows page-size}))

(mr/def ::query-request
  "Request body for /v2/query, one of three shapes:
    - `{:continuation_token <string>}` from a prior response (pagination);
    - `{:query <base64-string>}` — a query_handle resolved by the MCP layer to its stored base64
      MBQL; already resolved, so it's executed directly (like /v1/execute) rather than re-run
      through the representations pipeline;
    - `{:query <external-query-object>}` — a fresh portable MBQL 5 payload, same shape as
      /v2/construct-query.

  The string-vs-object `:query` distinction is what the `:dispatch` keys on. Each branch is a
  closed map: extra top-level keys (e.g. the legacy `source_entity` / `referenced_entities`
  envelope, or sending `:query` and `:continuation_token` simultaneously) are rejected with a 400."
  [:multi {:dispatch (fn [m]
                       (cond
                         (:continuation_token m) :continuation
                         (string? (:query m))    :handle
                         :else                   :fresh))}
   [:continuation [:map {:closed true} [:continuation_token ms/NonBlankString]]]
   [:handle       [:map {:closed true} [:query ms/NonBlankString]]]
   [:fresh        ::construct-query-request]])

(defn- initial-page-state
  "Normalize the three /v2/query entry points into a single {:query :total-limit :page} shape.

   - A continuation token carries the query + pagination state from a prior response (and
     re-validates query permissions, since the token is client-supplied and per-user permissions
     can change between pages).
   - A base64 `:query` string is a query_handle the MCP layer already resolved to its stored MBQL;
     it's decoded and executed directly (like /v1/execute), skipping the representations pipeline.
     Permissions are enforced by the QP at execution time, as on /v1/execute.
   - A fresh request body is evaluated through the representations pipeline and the total-row budget
     is derived from the resolved query's `:limit`."
  [body]
  (cond
    (:continuation_token body)
    (let [{:keys [query pagination]} (decode-continuation-token (:continuation_token body))]
      (query-guards/reject-native-query! query)
      (query-guards/validate-serialized-query! query)
      (query-guards/check-token-query-permissions! query)
      {:query query :total-limit (:limit pagination) :page (:page pagination)})

    (string? (:query body))
    (let [query (decode-base64-json-map (:query body))]
      (query-guards/reject-native-query! query)
      (query-guards/validate-serialized-query! query)
      {:query query :total-limit (clamp-total-limit (serialized-query-limit query)) :page 1})

    :else
    (let [live-query (evaluate-external-query-to-live-query body)]
      {:query       (lib/prepare-for-serialization live-query)
       :total-limit (total-row-limit live-query)
       :page        1})))

(api.macros/defendpoint :post "/v2/query"
  :- (streaming-response/streaming-response-schema ::query-response)
  "Execute a portable MBQL 5 representations JSON query and stream the results, with
  continuation-token pagination.

  Accepts either a JSON body (same shape as /v2/construct-query) or a `continuation_token`
  from a previous response. Returns results with column metadata and an optional
  `continuation_token` for fetching the next page."
  {:scope metabot/agent-query
   :tool  {:name "query"
           :title "Query Tables and Metrics"
           :description (str "Execute a Metabase query and return results with column "
                             "metadata, paginating automatically up to 2,000 rows total.\n\n"
                             "Results are returned in pages of 200 rows. When more pages remain "
                             "within the 2,000-row budget, the response includes a "
                             "continuation_token — pass it back to fetch the next page. A missing "
                             "continuation_token means the budget is exhausted or the table has "
                             "fewer rows than the page size. If the table is larger than 2,000 "
                             "rows and you need more, add a filter or aggregation to narrow "
                             "the result set.\n\n Provide one of: a `query_handle` returned "
                             "by construct_query (preferred when you have one); a `{\"query\": <object>}` "
                             "body (same shape as construct_query; see the `construct_notebook_query` "
                             "tool for the format reference); or a `{\"continuation_token\": "
                             "\"...\"}` from a previous response.")
           :annotations {:read-only? true}}}
  [_route-params
   _query-params
   body :- ::query-request]
  (let [{:keys [query total-limit page]} (initial-page-state body)
        items           (remaining-page-rows total-limit page)
        mbql5-with-page (apply-page-to-query query page items)]
    (qp.streaming/streaming-response
     [rff :api]
      (qp/process-query
       (prepare-combined-query mbql5-with-page)
       (qp.streaming/transforming-query-response
        rff
        (fn [result]
          (assoc result :continuation_token
                 (when (more-pages-available? page total-limit (:row_count result) items)
                   (generate-continuation-token query total-limit page)))))))))

;;; ------------------------------------------------- Execute Query --------------------------------------------------

(mr/def ::execute-query-request
  "Request schema for /v1/execute. Accepts a base64-encoded MBQL query."
  [:map
   [:query {:tool/description "A base64-encoded query string returned by /v1/construct-query. Do not construct this value manually."}
    ms/NonBlankString]])

(mr/def ::column-metadata
  "Metadata for a single result column."
  [:map
   [:name           :string]
   [:base_type      :string]
   [:effective_type {:optional true} [:maybe :string]]
   [:display_name   :string]])

(mr/def ::execute-query-response
  "Response from query execution. The HTTP status is always 202 because results are streamed —
   check the `status` field to determine success or failure."
  [:map
   [:status       [:enum :completed :failed]]
   [:data         {:optional true}
    [:map
     [:cols [:sequential ::column-metadata]]
     [:rows [:sequential [:sequential :any]]]]]
   [:row_count    {:optional true} :int]
   [:running_time {:optional true} :int]
   [:error        {:optional true} :string]])

(mr/def ::query-response
  "Extends ::execute-query-response with an optional continuation_token for pagination."
  [:merge ::execute-query-response
   [:map [:continuation_token {:optional true} [:maybe :string]]]])

(api.macros/defendpoint :post "/v1/execute"
  :- (streaming-response/streaming-response-schema ::execute-query-response)
  "Execute an MBQL query and return results.

  Accepts a base64-encoded MBQL query (as returned by /v1/construct-query) and executes it,
  returning results with column metadata.

  Response format:
  - On success: {:data {:cols [...] :rows [...]} :row_count N :status :completed :running_time M}
  - On failure: {:status :failed :error \"message\" ...}

  Standard userspace query limits are enforced (2000 rows for simple queries, 10000 for aggregated)."
  {:scope metabot/agent-query-execute
   :tool  {:name "execute_query"
           :description (str "Execute a previously constructed query and return raw results with column metadata, "
                             "row count, and execution time. Use this when the user explicitly asks for raw data, "
                             "rows, columns, counts, metadata, or programmatic query results. If the user asks to "
                             "show, display, visualize, plot, chart, or present the result, use visualize_query "
                             "instead.")
           :annotations {:read-only? true :idempotent? true}}}
  [_route-params
   _query-params
   {encoded-query :query} :- ::execute-query-request]
  (let [query (-> encoded-query
                  u/decode-base64
                  json/decode+kw)]
    (query-guards/reject-native-query! query)
    (qp.streaming/streaming-response [rff :api]
      (qp/process-query (prepare-combined-query query) rff))))

;;; --------------------------------------------------- Execute SQL --------------------------------------------------

(mr/def ::execute-sql-request
  "Request shape for /v1/execute-sql. The LLM passes a raw SQL string against a target database."
  [:map
   [:database_id ms/PositiveInt]
   [:sql         ms/NonBlankString]])

(api.macros/defendpoint :post "/v1/execute-sql"
  :- (streaming-response/streaming-response-schema ::execute-query-response)
  "Execute a raw SQL query against a database. Returns rows + column metadata.

  Requires the user to have native-query permission on the target database; the QP
  middleware enforces this. The instance-level `mcp-execute-sql-enabled` setting
  must also be on (it is by default)."
  {:scope metabot/agent-sql-execute
   :tool  {:name "execute_sql"
           :description (str "Execute a raw SQL query against a Metabase-connected database. "
                             "Use this ONLY when MBQL via construct_query cannot express the question. "
                             "User must have native-query permission on the target database. "
                             "Standard userspace query limits apply.")}}
  [_route-params
   _query-params
   {:keys [database_id sql]} :- ::execute-sql-request]
  ;; Kill-switch check: refuse with 403 when the admin has disabled execute_sql.
  (when-not (agent-api.settings/mcp-execute-sql-enabled)
    (throw (ex-info "execute_sql is disabled on this instance" {:status-code 403})))
  (let [raw-query {:database database_id
                   :type     :native
                   :native   {:query sql}}]
    ;; Belt-and-suspenders: friendlier 403 from the tool layer than the QP's perms-exception.
    ;; The QP middleware (query-processor.middleware.permissions) will re-check inside process-query.
    (when-not (qp.perms/current-user-has-adhoc-native-query-perms? raw-query)
      (throw (ex-info "You do not have permission to run native queries against this database."
                      {:status-code 403
                       :database_id database_id})))
    ;; Run through the same userland prep the other Agent API query endpoints use, so we get
    ;; the documented row cap, QueryExecution audit row, and `{:status :failed ...}` error
    ;; shape instead of a raw 500. Review finding #1.
    (qp.streaming/streaming-response [rff :api]
      (qp/process-query (prepare-agent-query raw-query) rff))))

;;; -------------------------------------------------- Read Resource -------------------------------------------------

(mr/def ::read-resource-request
  "Request shape for /v1/read-resource. Accepts up to 5 metabase:// URIs."
  [:map
   [:uris [:sequential ms/NonBlankString]]])

(mr/def ::read-resource-item
  "One fetched resource. Either `:content` (success) or `:error` (failure) is present."
  [:map
   [:uri     ms/NonBlankString]
   [:content {:optional true} [:maybe :any]]
   [:error   {:optional true} [:maybe :string]]])

(mr/def ::read-resource-response
  "Response shape from /v1/read-resource. `:resources` is the per-URI result list;
  `:output` is the formatted XML string the LLM consumes."
  [:map
   [:resources [:sequential ::read-resource-item]]
   [:output    :string]])

(api.macros/defendpoint :post "/v1/read-resource" :- ::read-resource-response
  "Read one or more Metabase resources via metabase:// URI patterns.

  Dispatches into the shared URI resolver in `metabase.metabot.tools.resources`,
  which validates URIs, fetches entities with per-URI permission checks, and
  returns a map of `{:resources ... :output ...}`. Up to 5 URIs per call."
  {:scope metabot/agent-resource-read
   :tool  {:name "read_resource"
           :description (str "Read Metabase entities by metabase:// URI. "
                             "Examples: metabase://databases, metabase://database/{id}/tables, "
                             "metabase://collection/{id}/items, metabase://question/{id}, "
                             "metabase://dashboard/{id}/items, metabase://table/{id}/fields. "
                             "Up to 5 URIs per call. List endpoints cap at 25 items.")}}
  [_route-params
   _query-params
   body :- ::read-resource-request]
  (try
    (metabot-resources/read-resource body)
    (catch clojure.lang.ExceptionInfo e
      ;; The Metabot dispatcher's "too many URIs" guard throws ex-info without a
      ;; :status-code. Surface it as a 400 to the HTTP boundary rather than the
      ;; default 500.
      (throw (ex-info (ex-message e)
                      (merge {:status-code 400} (ex-data e))
                      e)))))

;;; ------------------------------------------------- Create Question ------------------------------------------------

(defn- frontend-url
  "Prefix `channel.urls` relative path `path` with the configured site URL, returning it relative when
  site-url is unset so the agent never emits an absolute URL with an empty host."
  [path]
  (let [base (channel.urls/site-url)]
    (if (str/blank? base)
      path
      (str base path))))

(mr/def ::card-display
  "Display types accepted by Card. Validates LLM-passed values so a bogus
   value (e.g. `\"potato\"`) gets a 400 rather than persisting junk."
  [:enum "table" "bar" "line" "pie" "scatter" "area" "row" "combo" "pivot"
   "scalar" "smartscalar" "gauge" "progress" "funnel" "map" "waterfall" "sankey"])

;;; ------------------------------------------- Card mutation helpers ------------------------------------------------
;;
;; `create_question`/`create_metric` and `update_question`/`update_metric` share the same
;; permission-mirroring stack and response shape; only the card `:type`, the default display, and
;; (for metrics) an extra query-shape validation differ. These helpers hold that common logic so the
;; two pairs can't drift.

(defn- card->base-response
  "The card fields both the create and update tools report back."
  [card]
  {:id              (:id card)
   :name            (:name card)
   :display         (name (:display card))
   :collection_id   (:collection_id card)
   :collection_path (collection-path (:collection_id card))
   :description     (:description card)})

(defn- create-card-response
  "Response body for the create-card tools — the shared fields plus the saved card's URL."
  [card]
  (assoc (card->base-response card)
         :url (frontend-url (channel.urls/card-path (:id card)))))

(defn- update-card-response
  "Response body for the update-card tools — the shared fields plus archived state."
  [card]
  (assoc (card->base-response card)
         :archived (boolean (:archived card))))

(defn- create-card-from-agent!
  "Shared body for `create_question` / `create_metric`. Decodes the base64 `:query`, resolves the
  target collection (absent → personal, explicit `null` → root), mirrors REST `POST /api/card/`
  permission pre-checks, creates the card, and returns the create response.

  `opts`: `:card-type` (`:question` / `:metric`), `:default-display` (used when the caller omits
  `:display`), and optional `:validate-query!` (a metric-shape check run before the permission
  checks).

  Mirror REST `POST /api/card/` pre-checks before calling `queries/create-card!`. `create-card!`
  itself does NOT run permissions checks; without these mirroring the REST endpoint, an LLM caller
  could (a) save a card whose query references data the user cannot run, and (b) plant the card in a
  collection they cannot write to.

  TODO (Bryan 2026-05-20): extract REST's create-card pre-check stack into a shared
  `metabase.queries.*` helper so REST + agent-api can't drift. This helper only dedups the two
  agent-api create endpoints; the next person who adds a REST check will probably still miss the
  agent side unless we dedup against REST too."
  [{:keys [query display description visualization_settings] card-name :name :as body}
   {:keys [card-type default-display validate-query!]}]
  (let [dataset-query (-> query u/decode-base64 json/decode+kw)
        ;; `nil` means the root collection, so only default to the personal collection when the
        ;; key is absent. `(or ...)` would silently turn an explicit `null` into personal.
        collection_id (if (contains? body :collection_id)
                        (:collection_id body)
                        (personal-collection-id))]
    (when validate-query!
      (validate-query! dataset-query))
    (query-perms/check-run-permissions-for-query dataset-query)
    (api/create-check :model/Card {:collection_id collection_id})
    (create-card-response
     (queries/create-card!
      {:name                   card-name
       :type                   card-type
       :dataset_query          dataset-query
       :display                (keyword (or display default-display))
       :description            description
       :collection_id          collection_id
       :visualization_settings (or visualization_settings {})}
      {:id api/*current-user-id*}))))

(defn- apply-agent-card-patch!
  "Shared body for `update_question` / `update_metric`. `card-before-update` is the card the caller
  has already `write-check`ed. Builds the patch from `body` over the common field allowlist, mirrors
  REST's update-card permission pre-checks, applies it, and returns the update response.

  `opts` may carry `:validate-query!` — a metric-shape check run on the normalized replacement query
  before anything is written.

  TODO (Bryan 2026-05-20): see the matching TODO on `create-card-from-agent!`. The pre-check stack
  mirrored here (collection move, run-permissions, cycle detection) is also duplicated against REST's
  update-card path; extracting a shared `metabase.queries.*` helper is the larger fix that stops REST
  + agent-api from drifting."
  [card-before-update body {:keys [validate-query!]}]
  (let [id        (:id card-before-update)
        ;; Normalize a replacement query like the REST update path so downstream helpers (metric
        ;; validation, cycle detection, permission check) see the canonical MBQL shape regardless of
        ;; whether the LLM sent legacy or MBQL 5.
        new-query   (when (contains? body :query)
                      (-> (:query body) u/decode-base64 json/decode+kw lib-be/normalize-query))
        _           (when (and new-query validate-query!)
                      (validate-query! new-query))
        raw-updates (cond-> {}
                      (contains? body :name)
                      (assoc :name (:name body))

                      (contains? body :description)
                      (assoc :description (:description body))

                      (contains? body :collection_id)
                      (assoc :collection_id (:collection_id body))

                      (contains? body :display)
                      (assoc :display (some-> (:display body) keyword))

                      (contains? body :visualization_settings)
                      (assoc :visualization_settings (:visualization_settings body))

                      (contains? body :archived)
                      (assoc :archived (boolean (:archived body)))

                      new-query
                      (assoc :dataset_query new-query))
        ;; Set :archived_directly to mirror :archived (mark as Trash if explicitly archived). The
        ;; REST endpoint runs this in `update-card!` on every update; we need it too so LLM-archived
        ;; cards behave the same as UI-archived ones.
        card-updates (api/updates-with-archived-directly card-before-update raw-updates)]
    ;; A move (or archive that retargets the collection) requires write on BOTH the source and the
    ;; target collection. The caller's `api/write-check :model/Card` only covered the source entity.
    ;; Mirror the REST endpoint's `check-allowed-to-move` gate.
    (collection/check-allowed-to-change-collection card-before-update card-updates)
    ;; Mirror REST's `check-allowed-to-modify-query`: swapping the dataset_query requires data perms
    ;; to run the *new* query, otherwise a user with collection write on a card can repoint it at data
    ;; they cannot query. `queries/update-card!` does NOT run this check itself, so we run it here.
    (when (api/column-will-change? :dataset_query card-before-update card-updates)
      (query-perms/check-run-permissions-for-query (:dataset_query card-updates))
      ;; Reject cycles. `lib/check-card-overwrite` throws if the new query references this card
      ;; transitively. Mirror REST's wrapping that promotes it to HTTP 400 instead of a 500.
      (try
        (lib/check-card-overwrite id (:dataset_query card-updates))
        (catch clojure.lang.ExceptionInfo e
          ;; Don't downgrade a more specific status if the throwing fn ever starts setting one
          ;; (e.g. a 404 for a missing card).
          (let [data (ex-data e)]
            (throw (ex-info (ex-message e)
                            (assoc data :status-code (or (:status-code data) 400))))))))
    (queries/update-card! {:card-before-update    card-before-update
                           :card-updates          card-updates
                           :actor                 @api/*current-user*
                           :delete-old-dashcards? false})
    (update-card-response (t2/select-one :model/Card :id id))))

(mr/def ::create-question-request
  [:map
   [:name                   ms/NonBlankString]
   [:query                  ms/NonBlankString]
   [:display                {:optional true} [:maybe ::card-display]]
   [:description            {:optional true} [:maybe :string]]
   [:collection_id          {:optional true} [:maybe ms/PositiveInt]]
   [:visualization_settings {:optional true} [:maybe :map]]])

(mr/def ::create-question-response
  [:map
   [:id              ms/PositiveInt]
   [:name            ms/NonBlankString]
   [:url             :string]
   [:display         :string]
   [:collection_id   [:maybe ms/PositiveInt]]
   [:collection_path :string]
   [:description     [:maybe :string]]])

(api.macros/defendpoint :post "/v1/question" :- ::create-question-response
  "Save a previously constructed query as a named question (card).

  The `query` parameter accepts a `query_handle` (UUID) returned by `construct_query` (MBQL) or
  `construct_native_query` (native SQL), or a base64-encoded query string. MCP callers should
  always use the handle.
  Optionally specify display type, description, collection, and visualization settings.
  If `collection_id` is omitted the question is saved to the caller's personal collection.
  Pass an explicit `null` to save it to the root collection.
  The response `collection_path` is the saved location.

  Saving a native (raw SQL) query requires native-query permission on the target database."
  {:scope metabot/agent-question-create
   :tool  {:name "create_question"
           :description (str "Save a query as a named question in Metabase. "
                             "Pass the `query_handle` returned by `construct_query` (MBQL) or "
                             "`construct_native_query` (native SQL). "
                             "Optionally set display type (table, bar, line, pie, etc.), "
                             "description, and target collection. "
                             "If you omit collection_id it's saved to the user's personal collection; "
                             "pass an explicit null to save it to the root collection. "
                             "Report the saved location from the response `collection_path`.")}}
  [_route-params
   _query-params
   body :- ::create-question-request]
  ;; REST also calls `check-if-card-can-be-saved`, which only fires for `card-type :metric`; this
  ;; endpoint always creates a question, so no `:validate-query!` is passed.
  (create-card-from-agent! body {:card-type :question, :default-display "table"}))

;;; -------------------------------------------------- Create Metric -------------------------------------------------

(mr/def ::create-metric-request
  [:map
   [:name                   ms/NonBlankString]
   [:query                  ms/NonBlankString]
   [:display                {:optional true} [:maybe ::card-display]]
   [:description            {:optional true} [:maybe :string]]
   [:collection_id          {:optional true} [:maybe ms/PositiveInt]]
   [:visualization_settings {:optional true} [:maybe :map]]])

(mr/def ::create-metric-response
  [:map
   [:id              ms/PositiveInt]
   [:name            ms/NonBlankString]
   [:url             :string]
   [:display         :string]
   [:collection_id   [:maybe ms/PositiveInt]]
   [:collection_path :string]
   [:description     [:maybe :string]]])

(defn- check-metric-query-can-be-saved!
  "Throw a 400 unless `dataset-query` is a valid metric definition. Mirrors REST's
  `check-if-card-can-be-saved` for `:metric` cards: a metric needs a single stage, exactly one
  aggregation, and at most one date/datetime breakout (see `lib/can-run-method`). The base64
  payload stored by `construct_query` is stripped of its metadata provider, so re-hydrate one
  before calling `lib/can-save?` (its breakout type-check reads field metadata)."
  [dataset-query]
  (let [mp    (lib-be/application-database-metadata-provider (:database dataset-query))
        query (lib/query mp dataset-query)]
    (when-not (lib/can-save? query :metric)
      (throw (ex-info (str "This query can't be saved as a metric. A metric needs exactly one "
                           "aggregation and at most one date/datetime grouping. Construct a query "
                           "with a single summarize (e.g. count, sum) before saving it as a metric.")
                      {:status-code 400})))))

(api.macros/defendpoint :post "/v1/metric" :- ::create-metric-response
  "Save a previously constructed query as a named metric.

  A metric is a reusable aggregation (a `Card` of type `metric`): the underlying query must have
  exactly one aggregation and at most one date/datetime grouping. The `query` parameter accepts a
  `query_handle` (UUID) returned by `construct_query`, or a base64-encoded MBQL string. MCP callers
  should always use the handle.
  Optionally specify display type, description, collection, and visualization settings.
  If `collection_id` is omitted the metric is saved to the caller's personal collection.
  Pass an explicit `null` to save it to the root collection.
  The response `collection_path` is the saved location."
  {:scope metabot/agent-metric-create
   :tool  {:name "create_metric"
           :description (str "Save a query as a reusable metric in Metabase. "
                             "Pass the `query_handle` returned by `construct_query`. "
                             "The query must have exactly one aggregation (e.g. count, sum, average) "
                             "and at most one date/datetime grouping — build it with `construct_query` first. "
                             "Optionally set display type, description, and target collection. "
                             "If you omit collection_id it's saved to the user's personal collection; "
                             "pass an explicit null to save it to the root collection. "
                             "Report the saved location from the response `collection_path`.")}}
  [_route-params
   _query-params
   body :- ::create-metric-request]
  (create-card-from-agent! body {:card-type        :metric
                                 :default-display  "scalar"
                                 :validate-query!  check-metric-query-can-be-saved!}))

;;; -------------------------------------------------- Update Metric -------------------------------------------------

(mr/def ::update-metric-request
  "Patch shape for `update_metric`. Every field is optional; only the fields the caller
  passes are changed. `:query` accepts a base64-encoded MBQL string (or query_handle UUID
  resolved upstream in the MCP layer) and must still describe a valid metric."
  [:map
   [:name                   {:optional true} [:maybe ms/NonBlankString]]
   [:description            {:optional true} [:maybe :string]]
   [:collection_id          {:optional true} [:maybe ms/PositiveInt]]
   [:display                {:optional true} [:maybe ::card-display]]
   [:visualization_settings {:optional true} [:maybe :map]]
   [:archived               {:optional true} [:maybe :boolean]]
   [:query                  {:optional true} [:maybe ms/NonBlankString]]])

(mr/def ::update-metric-response
  "Returned by `update_metric` - the fields the LLM is most likely to want to read back
  after an update. Excludes the full dataset_query, which the caller can re-fetch via
  `read_resource` if needed."
  [:map
   [:id              ms/PositiveInt]
   [:name            ms/NonBlankString]
   [:display         :string]
   [:collection_id   [:maybe ms/PositiveInt]]
   [:collection_path :string]
   [:description     [:maybe :string]]
   [:archived        :boolean]])

(api.macros/defendpoint :put "/v1/metric/:id" :- ::update-metric-response
  "Update a saved metric. Patch semantics - only fields that you pass are changed.

  Set `collection_id` to move the metric to a different collection. Set `archived: true` to archive.
  Archiving is a soft delete - there is no delete endpoint. It can be reversed by setting
  `archived: false`.
  Pass `query` (a query_handle from construct_query, or a base64 MBQL string) to replace the underlying
  query; the replacement must still be a valid metric (exactly one aggregation, at most one
  date/datetime grouping). The target card must be a metric — use `update_question` for questions."
  {:scope metabot/agent-metric-update
   :tool  {:name "update_metric"
           :description (str "Update a saved metric. Patch semantics - only fields you pass are changed. "
                             "To move a metric to a different collection, set collection_id. "
                             "Archiving (archived true) is a soft delete - use it when asked to "
                             "delete or remove a metric; set archived false to restore. "
                             "To replace the underlying query, pass query "
                             "(a query_handle from construct_query) - it must still have exactly one "
                             "aggregation and at most one date/datetime grouping. The target must be a "
                             "metric; use update_question for regular questions.")}}
  [{:keys [id]} :- [:map [:id ms/PositiveInt]]
   _query-params
   body :- ::update-metric-request]
  (let [card-before-update (api/write-check :model/Card id)]
    ;; This is the metric endpoint: refuse to touch questions/models so an LLM can't silently force a
    ;; non-metric card's query through the metric-shape validation (and vice-versa via update_question).
    (api/check-400 (= :metric (:type card-before-update))
                   (str "Card " id " is not a metric. Use update_question to update questions."))
    (apply-agent-card-patch! card-before-update body
                             {:validate-query! check-metric-query-can-be-saved!})))

;;; ------------------------------------------------- Update Question ------------------------------------------------

(mr/def ::update-question-request
  "Patch shape for `update_question`. Every field is optional; only the fields the caller
  passes are changed. `:query` accepts a base64-encoded MBQL string (or query_handle UUID
  resolved upstream in the MCP layer)."
  [:map
   [:name                   {:optional true} [:maybe ms/NonBlankString]]
   [:description            {:optional true} [:maybe :string]]
   [:collection_id          {:optional true} [:maybe ms/PositiveInt]]
   [:display                {:optional true} [:maybe ::card-display]]
   [:visualization_settings {:optional true} [:maybe :map]]
   [:archived               {:optional true} [:maybe :boolean]]
   [:query                  {:optional true} [:maybe ms/NonBlankString]]])

(mr/def ::update-question-response
  "Returned by `update_question` - the fields the LLM is most likely to want to read back
  after an update. Excludes the full dataset_query, which the caller can re-fetch via
  `read_resource` if needed."
  [:map
   [:id              ms/PositiveInt]
   [:name            ms/NonBlankString]
   [:display         :string]
   [:collection_id   [:maybe ms/PositiveInt]]
   [:collection_path :string]
   [:description     [:maybe :string]]
   [:archived        :boolean]])

(api.macros/defendpoint :put "/v1/question/:id" :- ::update-question-response
  "Update a saved question (card). Patch semantics - only fields that you pass are changed.

  Set `collection_id` to move the card to a different collection. Set `archived: true` to archive.
  Archiving is a soft delete - there is no delete endpoint. It can be reversed by setting
  `archived: false`.
  Pass `query` (a query_handle from construct_query or construct_native_query, or a base64 query
  string) to replace the underlying query. Replacing it with a native (raw SQL) query requires
  native-query permission on the target database."
  {:scope metabot/agent-question-update
   :tool  {:name "update_question"
           :description (str "Update a saved question (card). Patch semantics - only fields you pass are changed. "
                             "To move a card to a different collection, set collection_id. "
                             "Archiving (archived true) is a soft delete - use it when asked to "
                             "delete or remove a question; set archived false to restore. "
                             "To replace the underlying query, pass query "
                             "(a query_handle from construct_query or construct_native_query).")}}
  [{:keys [id]} :- [:map [:id ms/PositiveInt]]
   _query-params
   body :- ::update-question-request]
  (apply-agent-card-patch! (api/write-check :model/Card id) body nil))

;;; ------------------------------------------------ Execute Question -----------------------------------------------

(defn- reject-parameterized-card!
  "Agent execution does not yet supply parameter values, so refuse to run a card that declares
   user-facing parameters or input template tags (field filters / variables). Snippet and
   card-reference template tags don't count — those need no runtime input. Returns a 400 so the
   limitation surfaces clearly rather than silently running the card with defaults."
  [card]
  (when (seq (qp.card/combined-parameters-and-template-tags card))
    (throw (ex-info (str "This question takes parameters, which agent execution does not yet "
                         "support. Run it in Metabase, or save a parameterless version.")
                    {:status-code 400 :card-id (:id card)}))))

(api.macros/defendpoint :post "/v1/question/:id/query"
  :- (streaming-response/streaming-response-schema ::execute-query-response)
  "Run a saved question (card) and return its results.

  Executes the query stored on the card under the caller's permissions and returns rows +
  column metadata — the same response shape as /v1/execute.

  Parameterized questions are NOT supported: if the card declares parameters or input
  template tags (field filters / variables), this returns a 400. Run it in Metabase, or
  save a parameterless version."
  {:scope metabot/agent-question-execute
   :tool  {:name "execute_question"
           :description (str "Run a saved question by id and return its rows with column metadata, "
                             "row count, and execution time. Use this to get the current results of "
                             "an existing saved question. Does NOT support parameterized questions — "
                             "if the question takes parameters or template-tag input, this returns an "
                             "error.")
           :annotations {:read-only? true :idempotent? true}}}
  [{:keys [id]} :- [:map [:id ms/PositiveInt]]
   _query-params
   _body]
  (let [card (api/read-check :model/Card id)]
    (reject-parameterized-card! card)
    (qp.card/process-query-for-card
     card :api
     :context    :question
     :middleware {:process-viz-settings? false})))

;;; ------------------------------------------------ Create Dashboard -----------------------------------------------

(defn- size-override
  "Optional explicit size from the LLM. Returns {:width :height} or nil to fall back to defaults."
  [display-size]
  (case display-size
    "wide"    {:width 18 :height 6}
    "tall"    {:width 9  :height 12}
    "full"    {:width 24 :height 9}
    nil))

(defn- autoplaced-position
  "Grid position for a new dashcard: the LLM's explicit `display-size` if given, otherwise the
   default size for `display`."
  [placed display display-size]
  (if-let [{:keys [width height]} (size-override display-size)]
    (autoplace/get-position-for-new-dashcard placed width height autoplace/default-grid-width)
    (autoplace/get-position-for-new-dashcard placed display)))

(mr/def ::create-dashboard-request
  [:map
   [:name          ms/NonBlankString]
   [:description   {:optional true} [:maybe :string]]
   [:collection_id {:optional true} [:maybe ms/PositiveInt]]
   [:question_ids  {:optional true} [:maybe [:sequential ms/PositiveInt]]]])

(mr/def ::dashboard-tab
  [:map
   [:id   ms/PositiveInt]
   [:name :string]])

(defn- dashboard-tabs
  "The dashboard's tabs as `{:id :name}` in display order, [] when it has none."
  [dashboard-id]
  (mapv #(select-keys % [:id :name])
        (t2/select [:model/DashboardTab :id :name] :dashboard_id dashboard-id
                   {:order-by [[:position :asc] [:id :asc]]})))

(mr/def ::create-dashboard-response
  [:map
   [:id              ms/PositiveInt]
   [:name            ms/NonBlankString]
   [:url             :string]
   [:collection_id   [:maybe ms/PositiveInt]]
   [:collection_path :string]
   [:description     [:maybe :string]]
   [:dashcard_ids    [:sequential ms/PositiveInt]]
   [:tabs            [:sequential ::dashboard-tab]]])

(api.macros/defendpoint :post "/v1/dashboard" :- ::create-dashboard-response
  "Create a new dashboard, optionally populated with saved questions.

  Pass `question_ids` to add existing saved questions as cards on the dashboard.
  Cards are automatically positioned on the grid based on their display type.
  If `collection_id` is omitted the dashboard is saved to the caller's personal collection.
  Pass an explicit `null` to save it to the root collection.
  The response `collection_path` is the saved location."
  {:scope metabot/agent-dashboard-create
   :tool  {:name "create_dashboard"
           :description (str "Create a dashboard in Metabase. "
                             "Optionally pass question_ids to add saved questions as cards. "
                             "Cards are auto-positioned on the dashboard grid. "
                             "If you omit collection_id it's saved to the user's personal collection; "
                             "pass an explicit null to save it to the root collection. "
                             "To add section headings or narrative text cards, follow up with "
                             "update_dashboard. "
                             "Report the saved location from the response `collection_path`. "
                             "Returns the dashboard URL.")}}
  [_route-params
   _query-params
   {:keys [description question_ids]
    dashboard-name :name
    :as body}
   :- ::create-dashboard-request]
  ;; `nil` means the root collection, so only default to the personal collection when the
  ;; key is absent. `(or ...)` would silently turn an explicit `null` into personal.
  (let [collection_id (if (contains? body :collection_id)
                        (:collection_id body)
                        (personal-collection-id))]
    (api/create-check :model/Dashboard {:collection_id collection_id})
    (let [cards (when (seq question_ids)
                  (mapv #(api/read-check :model/Card %) question_ids))
          dash  (t2/with-transaction [_conn]
                  (let [dash (first (t2/insert-returning-instances!
                                     :model/Dashboard
                                     {:name          dashboard-name
                                      :description   description
                                      :parameters    []
                                      :creator_id    api/*current-user-id*
                                      :collection_id collection_id}))]
                    (when (seq cards)
                      (reduce (fn [placed card]
                                (let [display  (or (:display card) :table)
                                      position (autoplaced-position placed display nil)]
                                  (t2/insert-returning-instance!
                                   :model/DashboardCard
                                   (merge position {:dashboard_id (:id dash)
                                                    :card_id      (:id card)}))
                                  (conj placed position)))
                              []
                              cards))
                    dash))]
      (events/publish-event! :event/dashboard-create {:object dash :user-id api/*current-user-id*})
      {:id              (:id dash)
       :name            (:name dash)
       :url             (frontend-url (channel.urls/dashboard-path (:id dash)))
       :collection_id   (:collection_id dash)
       :collection_path (collection-path (:collection_id dash))
       :description     (:description dash)
       ;; select-fn-vec returns nil, not [], when there are no rows
       :dashcard_ids    (or (t2/select-fn-vec :id :model/DashboardCard :dashboard_id (:id dash)
                                              {:order-by [[:row :asc] [:col :asc]]})
                            [])
       :tabs            (dashboard-tabs (:id dash))})))

;;; ------------------------------------------------- Update Dashboard -----------------------------------------------

(mr/def ::dashcard-mutation
  "One dashcard mutation. Discriminated on `:action`:
   - `add`         : requires `card_id`. Auto-positioned. Optional `display_size` (\"wide\", \"tall\", or \"full\").
   - `add_heading` : requires `text`. Adds a full-width section heading.
   - `add_text`    : requires `text` (Markdown). Adds a text card. Optional `display_size`
                     (\"wide\", \"tall\", or \"full\").
   - `update_text` : requires `dashcard_id` and `text`. Replaces a heading or text card's text
                     in place, keeping its position and size.
   - `remove`      : requires `dashcard_id`.
   - `move`        : requires `dashcard_id` and `position` (\"top\" or \"bottom\").

   The add actions take an optional `tab_id` (a tab on this dashboard); omitted, new cards land on
   the dashboard's first tab."
  [:multi {:dispatch :action}
   ;; Branches are closed so an inapplicable key (e.g. `display_size` on `add_heading`, which is
   ;; always full-width) fails validation instead of being silently ignored.
   ["add"         [:map {:closed true}
                   [:action       [:= "add"]]
                   [:card_id      ms/PositiveInt]
                   [:display_size {:optional true} [:maybe [:enum "wide" "tall" "full"]]]
                   [:tab_id       {:optional true} [:maybe ms/PositiveInt]]]]
   ["add_heading" [:map {:closed true}
                   [:action [:= "add_heading"]]
                   [:text   ms/NonBlankString]
                   [:tab_id {:optional true} [:maybe ms/PositiveInt]]]]
   ["add_text"    [:map {:closed true}
                   [:action       [:= "add_text"]]
                   [:text         ms/NonBlankString]
                   [:display_size {:optional true} [:maybe [:enum "wide" "tall" "full"]]]
                   [:tab_id       {:optional true} [:maybe ms/PositiveInt]]]]
   ["update_text" [:map {:closed true}
                   [:action      [:= "update_text"]]
                   [:dashcard_id ms/PositiveInt]
                   [:text        ms/NonBlankString]]]
   ["remove"      [:map {:closed true}
                   [:action      [:= "remove"]]
                   [:dashcard_id ms/PositiveInt]]]
   ["move"        [:map {:closed true}
                   [:action      [:= "move"]]
                   [:dashcard_id ms/PositiveInt]
                   [:position    [:enum "top" "bottom"]]]]])

(mr/def ::update-dashboard-request
  "Patch shape for `update_dashboard`. Metadata fields and an optional `dashcards` list of
   add/add_heading/add_text/update_text/remove/move mutations applied in order."
  [:map
   [:name          {:optional true} [:maybe ms/NonBlankString]]
   [:description   {:optional true} [:maybe :string]]
   [:collection_id {:optional true} [:maybe ms/PositiveInt]]
   [:archived      {:optional true} [:maybe :boolean]]
   [:dashcards     {:optional true} [:maybe [:sequential ::dashcard-mutation]]]])

(mr/def ::update-dashboard-response
  "Returned by `update_dashboard`. `:dashcard_ids` is the post-mutation list of dashcard
  ids in row/col order so the LLM can confirm what landed on the dashboard. `:tabs` lists
  the dashboard's tabs in display order — the ids a mutation's `tab_id` accepts."
  [:map
   [:id              ms/PositiveInt]
   [:name            ms/NonBlankString]
   [:collection_id   [:maybe ms/PositiveInt]]
   [:collection_path :string]
   [:description     [:maybe :string]]
   [:archived        :boolean]
   [:dashcard_ids    [:sequential ms/PositiveInt]]
   [:tabs            [:sequential ::dashboard-tab]]])

(defn- insert-new-dashcard!
  "Insert a new dashcard at `position-fields` on `tab-id` and record it in the mutation `state`.
   Goes through [[dashboard-card/create-dashboard-cards!]] so model-level invariants (e.g. no
   document-backed cards on dashboards) are enforced. The returned instance (with its :id) goes
   into :placed so later mutations in the batch — notably a `move` to \"top\", which shifts every
   other card by id — can address it."
  [state dashboard-id tab-id position-fields columns]
  (let [new-dashcard (first (dashboard-card/create-dashboard-cards!
                             [(merge position-fields
                                     {:dashboard_id     dashboard-id
                                      :dashboard_tab_id tab-id}
                                     columns)]))]
    (swap! state #(-> %
                      (update :placed conj new-dashcard)
                      (update :added conj new-dashcard)))))

(defn- apply-dashcard-mutations!
  "Apply a sequence of LLM-friendly dashcard mutations. Returns {:added [...] :removed [...] :moved [...]}.

  Errors:
  - `card_id` that doesn't exist or the user can't read -> 404 / 403 via `api/read-check`.
  - `dashcard_id` that isn't on this dashboard -> 404 via `api/check-404`.

  Autoplace state walks the current dashcards list as we add, so each new card gets a unique slot.
  Placement is per-tab: adds go on the mutation's `tab_id` (default: the first tab) and only
  collide with that tab's cards; a move only reflows cards sharing the moved card's tab."
  [dashboard-id mutations]
  (let [current        (t2/select :model/DashboardCard :dashboard_id dashboard-id)
        ;; one fetch serves the default tab, per-mutation tab_id validation, and collision grouping
        tab-ids        (t2/select-pks-vec :model/DashboardTab :dashboard_id dashboard-id
                                          {:order-by [[:position :asc] [:id :asc]]})
        ;; new dashcards land on the first tab, alongside any nil-tab dashcards, which the
        ;; frontend renders there; nil when the dashboard has no tabs
        default-tab-id (first tab-ids)
        tab-id?        (set tab-ids)
        ;; A tab_id that isn't a tab on this dashboard -> 404, so a typo can't silently create a
        ;; dashcard that no tab displays.
        target-tab-id  (fn [tab-id]
                         (if tab-id
                           (do (api/check-404 (tab-id? tab-id)) tab-id)
                           default-tab-id))
        ;; Dashcards with a nil tab id still render on a tabbed dashboard's first tab, so for
        ;; collision/reflow purposes they count as first-tab cards.
        effective-tab  (fn [dashcard] (or (:dashboard_tab_id dashcard) default-tab-id))
        on-tab         (fn [placed tab-id] (filterv #(= (effective-tab %) tab-id) placed))
        state          (atom {:placed  (vec current)
                              :added   []
                              :removed []
                              :moved   []})]
    (doseq [[mutation-index {:keys [action card_id dashcard_id display_size position text tab_id] :as mutation}]
            (map-indexed vector mutations)]
      (try
        (case action
          "add"
          (let [card    (api/read-check :model/Card card_id)
                ;; A card internal to a different dashboard (a dashboard question) can't be added
                ;; here — mirrors the REST dashcard-creation gate.
                _       (api/check (or (nil? (:dashboard_id card))
                                       (= (:dashboard_id card) dashboard-id))
                                   [400 "Can't add a question that is internal to another dashboard."])
                ;; Archived cards can't be added — except a question internal to THIS dashboard:
                ;; it was auto-archived when its last dashcard was removed, and re-adding it
                ;; unarchives it via the internal-question sync after the mutations.
                ;; TODO (Chris 2026-07-10) -- this surfaces as check-not-archived's standard 404,
                ;; matching REST; a 400 naming the archived card would guide an LLM caller better.
                _       (when-not (= (:dashboard_id card) dashboard-id)
                          (api/check-not-archived card))
                display (or (:display card) :table)
                tab-id  (target-tab-id tab_id)]
            (insert-new-dashcard! state dashboard-id tab-id
                                  (autoplaced-position (on-tab (:placed @state) tab-id) display display_size)
                                  {:card_id card_id}))

          "add_heading"
          (let [tab-id (target-tab-id tab_id)]
            (insert-new-dashcard! state dashboard-id tab-id
                                  (autoplaced-position (on-tab (:placed @state) tab-id) :heading nil)
                                  {:visualization_settings (dashboard-card/virtual-card-settings "heading" text)}))

          "add_text"
          (let [tab-id (target-tab-id tab_id)]
            (insert-new-dashcard! state dashboard-id tab-id
                                  (autoplaced-position (on-tab (:placed @state) tab-id) :text display_size)
                                  {:visualization_settings (dashboard-card/virtual-card-settings "text" text)}))

          "update_text"
          (let [existing (api/check-404
                          (t2/select-one :model/DashboardCard
                                         :id dashcard_id :dashboard_id dashboard-id))
                vs       (:visualization_settings existing)
                display  (some-> (get-in vs [:virtual_card :display]) name)]
            (api/check (or (contains? #{"heading" "text"} display)
                           ;; legacy text cards predate virtual_card and carry only a :text setting
                           (and (nil? display)
                                (nil? (:card_id existing))
                                (nil? (:action_id existing))
                                (string? (:text vs))))
                       [400 "Only heading and text cards support update_text."])
            ;; In-place: position and size stay put, unlike a remove + add_* round-trip.
            (t2/update! :model/DashboardCard dashcard_id
                        {:visualization_settings (assoc vs :text text)}))

          "remove"
          (let [existing (api/check-404
                          (t2/select-one :model/DashboardCard
                                         :id dashcard_id :dashboard_id dashboard-id))]
            ;; Model-level delete also cleans up orphaned inline parameters and pulse cards.
            (dashboard-card/delete-dashboard-cards! [dashcard_id])
            (swap! state #(-> %
                              (update :placed (fn [cards] (vec (remove (comp #{dashcard_id} :id) cards))))
                              (update :removed conj existing))))

          "move"
          (let [existing  (api/check-404
                           (t2/select-one :model/DashboardCard
                                          :id dashcard_id :dashboard_id dashboard-id))
                ;; A move only makes sense relative to the moved card's own tab: collision checks
                ;; and the move-to-top reflow must not touch cards on other tabs. Compared via
                ;; `effective-tab` so nil-tab dashcards group with the first tab they render on.
                same-tab? #(= (effective-tab %) (effective-tab existing))
                ;; Strip the moved card from the placed list while we recompute its position,
                ;; otherwise autoplace will treat it as still occupying its old slot.
                others     (vec (remove (comp #{dashcard_id} :id) (:placed @state)))
                tab-placed (filterv same-tab? others)
                new-pos    (case position
                             "top"    {:row 0 :col 0
                                       :size_x (:size_x existing) :size_y (:size_y existing)}
                             ;; Not first-fit autoplace — that would re-fill the slot the moved card
                             ;; just vacated. "bottom" means below the tab's bottom edge.
                             "bottom" {:row    (transduce (map #(+ (:row %) (:size_y %))) max 0 tab-placed)
                                       :col    (:col existing)
                                       :size_x (:size_x existing) :size_y (:size_y existing)})
                shifted?   (fn [c] (and (= position "top") (same-tab? c)))]
            ;; "top" parks the card at row 0; everything else on its tab has to shift down by the
            ;; moved card's height or we get overlapping dashcards (review finding #2).
            (when (= position "top")
              (let [shift (:size_y existing)]
                (doseq [{:keys [id row]} tab-placed]
                  (t2/update! :model/DashboardCard id {:row (+ row shift)}))))
            (t2/update! :model/DashboardCard dashcard_id
                        (select-keys new-pos [:row :col]))
            (swap! state #(-> %
                              (assoc :placed
                                     (conj (mapv (fn [c]
                                                   (cond-> c
                                                     (shifted? c) (update :row + (:size_y existing))))
                                                 others)
                                           (merge existing (select-keys new-pos [:row :col]))))
                              (update :moved conj (merge existing new-pos))))))
        (catch Exception e
          ;; Re-throw with the mutation index so the LLM can tell which entry failed when
          ;; submitting a batch. The whole batch rolls back via the surrounding transaction.
          (throw (ex-info (str "Dashcard mutation #" mutation-index " (" action ") failed: "
                               (ex-message e))
                          (assoc (ex-data e)
                                 :mutation-index mutation-index
                                 :mutation       mutation)
                          e)))))
    ;; Adding/removing dashcards can orphan (or resurrect) dashboard questions — cards internal to
    ;; this dashboard. Sync their archived state from the final dashcard set, like the REST path.
    (when (or (seq (:added @state)) (seq (:removed @state)))
      (dashboard/archive-or-unarchive-internal-dashboard-questions!
       dashboard-id (t2/select :model/DashboardCard :dashboard_id dashboard-id)))
    (select-keys @state [:added :removed :moved])))

(api.macros/defendpoint :put "/v1/dashboard/:id" :- ::update-dashboard-response
  "Update a dashboard. Patch semantics - only fields you pass are changed.

  Metadata: `name`, `description`, `collection_id`, `archived`. Archiving is a soft delete - there
  is no delete endpoint. It can be reversed by setting `archived: false`.
  Dashcard mutations are submitted under `dashcards` as a list of
  `{action: add|add_heading|add_text|update_text|remove|move, ...}` entries applied in
  order. `add` requires `card_id`; `add_heading` and `add_text` require `text` (Markdown
  for text cards); `update_text`, `remove`, and `move` require `dashcard_id`."
  {:scope metabot/agent-dashboard-update
   :tool  {:name "update_dashboard"
           :description (str "Update a dashboard. Patch semantics - only fields you pass are changed. "
                             "Set collection_id to move it. "
                             "Archiving (archived true) is a soft delete - use it when asked to "
                             "delete or remove a dashboard; set archived false to restore. "
                             "Use dashcards to add, remove, or move cards: "
                             "[{\"action\":\"add\",\"card_id\":42},{\"action\":\"remove\",\"dashcard_id\":101}]. "
                             "add_heading adds a full-width section heading and add_text adds a "
                             "Markdown text card, both from a \"text\" field: "
                             "[{\"action\":\"add_heading\",\"text\":\"Revenue\"},"
                             "{\"action\":\"add_text\",\"text\":\"Orders *grew 12%* this quarter.\"}]. "
                             "update_text rewrites an existing heading or text card in place "
                             "(keeping its position) from dashcard_id and text. "
                             "Mutations apply in order. New cards auto-place into the first free "
                             "grid slot (left-to-right, top-to-bottom), so cards may sit side by "
                             "side; a full-width heading always starts its own row, so lead each "
                             "section with add_heading to build a sectioned layout. "
                             "Add actions take an optional tab_id; omitted, new cards land on the "
                             "dashboard's first tab. The response tabs lists the dashboard's tabs "
                             "in display order. "
                             "The response dashcard_ids lists all dashcards in row/col order; "
                             "metabase://dashboard/{id}/items (via read_resource) shows each "
                             "dashcard with its dashcard_id.")}}
  [{:keys [id]} :- [:map [:id ms/PositiveInt]]
   _query-params
   body :- ::update-dashboard-request]
  (let [current-dash (api/write-check :model/Dashboard id)
        updates      (cond-> {}
                       (contains? body :name)          (assoc :name (:name body))
                       (contains? body :description)   (assoc :description (:description body))
                       (contains? body :collection_id) (assoc :collection_id (:collection_id body))
                       (contains? body :archived)      (assoc :archived (boolean (:archived body))))
        ;; Keep `archived_directly` in sync (and drop any `collection_id` sent alongside an
        ;; archive), mirroring the REST PUT-dashboard path.
        ;; TODO (Chris 2026-07-10) -- the drop is silent: archive + move in one request returns
        ;; 200 but discards the move. Matching REST for now; rejecting the combination with a 400
        ;; may serve LLM callers better.
        updates      (api/updates-with-archived-directly current-dash updates)
        ;; A move requires write on BOTH source and target collection. `api/write-check :model/Dashboard`
        ;; above only covered the source entity. Mirror the REST endpoint's gate.
        _            (collection/check-allowed-to-change-collection current-dash updates)
        mutations    (:dashcards body)
        ;; Card mutations on an archived dashboard are rejected, like the REST path. That includes
        ;; a dashboard being archived by THIS request — otherwise the post-mutation
        ;; internal-question sync could unarchive dashboard questions on a just-archived dashboard.
        _            (when (seq mutations)
                       ;; unless THIS request unarchives it first — restore-and-edit is one call,
                       ;; and the update runs before the mutations inside the transaction
                       (when-not (false? (:archived updates))
                         (api/check-not-archived current-dash))
                       (api/check (not (true? (:archived updates)))
                                  [400 "Can't modify dashcards while archiving the dashboard."]))
        result       (t2/with-transaction [_conn]
                       (when (seq updates)
                         (dashboard/cascade-card-state-from-dashboard-update! current-dash updates)
                         (t2/update! :model/Dashboard id updates)
                         ;; Fire :event/collection-touch with the *target* collection id so the
                         ;; activity feed records the right collection. Note: the dashboards-rest
                         ;; PUT-dashboard endpoint passes the dashboard id here instead, which
                         ;; appears to be a bug - the other collection-touch publishers
                         ;; (collections_rest, queries_rest, collections/models/collection) all
                         ;; pass the real collection id. Filed for follow-up.
                         (when (contains? updates :collection_id)
                           (events/publish-event! :event/collection-touch
                                                  {:collection-id (:collection_id updates)
                                                   :user-id       api/*current-user-id*})))
                       (when (seq mutations)
                         (apply-dashcard-mutations! id mutations)))]
    ;; Publish dashcard events outside the transaction, matching the REST endpoint's ordering.
    (when (seq (:added result))
      (events/publish-event! :event/dashboard-add-cards
                             {:object current-dash
                              :user-id api/*current-user-id*
                              :dashcards (:added result)}))
    (when (seq (:removed result))
      (events/publish-event! :event/dashboard-remove-cards
                             {:object current-dash
                              :user-id api/*current-user-id*
                              :dashcards (:removed result)}))
    (let [updated (t2/select-one :model/Dashboard :id id)]
      (events/publish-event! :event/dashboard-update
                             {:object updated :user-id api/*current-user-id*})
      {:id              (:id updated)
       :name            (:name updated)
       :collection_id   (:collection_id updated)
       :collection_path (collection-path (:collection_id updated))
       :description     (:description updated)
       :archived        (boolean (:archived updated))
       ;; select-fn-vec returns nil, not [], when there are no rows
       :dashcard_ids    (or (t2/select-fn-vec :id :model/DashboardCard :dashboard_id id
                                              {:order-by [[:row :asc] [:col :asc]]})
                            [])
       :tabs            (dashboard-tabs id)})))

;;; ------------------------------------------------ Create Collection -----------------------------------------------

(mr/def ::create-collection-request
  "Request shape for `create_collection`. `:parent_collection_id` is named separately from
  the internal `:parent_id` field to make the LLM-facing API less ambiguous (the caller is
  saying \"put it under this parent\", not echoing back a server-set field)."
  [:map
   [:name                 ms/NonBlankString]
   [:description          {:optional true} [:maybe :string]]
   [:parent_collection_id {:optional true} [:maybe ms/PositiveInt]]])

(mr/def ::create-collection-response
  "Returned by `create_collection`. Exposes the materialized-path `:location` so callers
  can sanity-check nesting without a follow-up read."
  [:map
   [:id            ms/PositiveInt]
   [:name          ms/NonBlankString]
   [:parent_id     [:maybe ms/PositiveInt]]
   [:location      ms/NonBlankString]
   [:description   [:maybe :string]]])

(api.macros/defendpoint :post "/v1/collection" :- ::create-collection-response
  "Create a new Collection.

  Pass `parent_collection_id` to nest under another collection; omit for a root-level collection.
  The caller must have write access to the parent (or root, if no parent given)."
  {:scope metabot/agent-collection-create
   :tool  {:name "create_collection"
           :description (str "Create a new collection in Metabase. "
                             "Set parent_collection_id to nest under another collection; "
                             "omit it for a root-level collection.")}}
  [_route-params
   _query-params
   {:keys [description parent_collection_id]
    collection-name :name}
   :- ::create-collection-request]
  ;; Delegate to collections/create-collection! so MCP-created collections behave the same as
  ;; UI/REST-created ones: namespace/type/is_remote_synced inheritance from parent, the
  ;; authority-level check, the tenant-collection validation, and both :event/collection-create
  ;; and :event/collection-touch firings all live in one place.
  (let [coll (collections/create-collection!
              (cond-> {:name collection-name}
                description          (assoc :description description)
                parent_collection_id (assoc :parent_id parent_collection_id)))]
    {:id            (:id coll)
     :name          (:name coll)
     :parent_id     parent_collection_id
     :location      (:location coll)
     :description   (:description coll)}))

;;; ------------------------------------------------- Authentication -------------------------------------------------
;;
;; The Agent API supports two authentication modes:
;;
;; 1. **Session-based**: Client exchanges JWT at `/auth/sso` endpoint to get a session token,
;;    then passes it via `X-Metabase-Session` header. The standard Metabase session middleware
;;    handles validation and expiration checking automatically.
;;
;; 2. **Stateless JWT**: Client passes a JWT via `Authorization: Bearer <jwt>` header.
;;    The JWT is validated using the configured shared secret and max-age settings.
;;    Good for simple integrations and one-off API calls.

(defn- extract-bearer-token
  "Extract the token from a Bearer authorization header."
  [auth-header]
  (when (and auth-header (str/starts-with? (u/lower-case-en auth-header) "bearer "))
    (str/trim (subs auth-header 7))))

(defn- error-response
  "Create a 401 error response with structured JSON body."
  [error-type message]
  {:status  401
   :headers {"Content-Type" "application/json"}
   :body    {:error   error-type
             :message message}})

;;; -------------------------------------------- Stateless JWT Authentication --------------------------------------------

(defn- authenticate-with-jwt
  "Authenticate a request using a stateless JWT. Returns `{:user <user>}` on success, or
   `{:error <type> :message <msg>}` on failure. Does NOT create a session.

   Uses auth-identity/authenticate to validate the JWT, which reuses the same implementation as the /auth/sso endpoint
   and handles all settings validation.

   When the JWT contains a `\"scope\"` claim, the result includes `:scopes` — a parsed set of scope strings — so that
   [[enforce-authentication]] can attach it to the request for downstream scope enforcement."
  [token]
  (let [result (auth-identity/authenticate :provider/jwt {:token token})]
    (if (:success? result)
      ;; JWT is valid - look up user from the email extracted by the JWT provider
      ;; The provider uses jwt-attribute-email setting to extract the email from claims
      (if-let [user (when-let [email (get-in result [:user-data :email])]
                      (t2/select-one :model/User :%lower.email (u/lower-case-en email) :is_active true))]
        (let [scope-entry (-> result :jwt-data (find :scope))]
          (cond-> {:user user}
            scope-entry
            (assoc :scopes (or (scope/parse-scopes (val scope-entry)) #{}))))
        ;; Don't reveal whether the user exists or not - use same error as invalid JWT
        {:error   "invalid_jwt"
         :message "Invalid or expired JWT token."})
      ;; Authentication failed - map error to agent API format
      (case (:error result)
        :jwt-not-enabled {:error   "jwt_not_configured"
                          :message "JWT authentication is not configured. Set the JWT shared secret in admin settings."}
        ;; Default: use generic invalid JWT message (don't leak details)
        {:error   "invalid_jwt"
         :message "Invalid or expired JWT token."}))))

;;; -------------------------------------------------- Middleware ----------------------------------------------------

(defn- enforce-authentication
  "Middleware that ensures requests are authenticated.

   Ensures `:token-scopes` is present on authenticated requests.

   - For **session-authenticated** requests (where `:metabase-user-id` is already set by
     upstream middleware), preserves any pre-existing `:token-scopes` value if present,
     otherwise defaults to `#{::scope/unrestricted}` for unrestricted access.
   - For **JWT-authenticated** requests, derives `:token-scopes` from the JWT when a
     `\"scope\"` claim is present, falls back to any pre-existing `:token-scopes` on the
     request, and finally defaults to `#{::scope/unrestricted}` for unscoped JWTs.

   This ensures downstream scope enforcement never has to special-case nil within the
   agent API."
  [handler]
  (fn [{:keys [headers metabase-user-id token-scopes] :as request} respond raise]
    (cond
      ;; Already authenticated via X-Metabase-Session or synthetic request (e.g. MCP dispatch).
      ;; Preserve existing :token-scopes when present (MCP sets them on the synthetic request).
      metabase-user-id
      (handler (cond-> request
                 (not token-scopes) (assoc :token-scopes #{::scope/unrestricted}))
               respond raise)

      ;; Not authenticated via session - check for Bearer JWT
      :else
      (let [auth-header  (get headers "authorization")
            bearer-token (extract-bearer-token auth-header)]
        (cond
          ;; No authorization header and no session
          (nil? auth-header)
          (respond (error-response "missing_authorization"
                                   "Authentication required. Use X-Metabase-Session header or Authorization: Bearer <jwt>."))

          ;; Authorization header present but not Bearer format
          (nil? bearer-token)
          (respond (error-response "invalid_authorization_format"
                                   "Authorization header must use Bearer scheme: Authorization: Bearer <jwt>"))

          ;; Validate JWT
          :else
          (let [result (authenticate-with-jwt bearer-token)]
            (if-let [user (:user result)]
              (do
                (when (and (:scopes result) token-scopes (not= (:scopes result) token-scopes))
                  (log/warn "JWT scopes" (:scopes result)
                            "differ from pre-existing token-scopes" token-scopes))
                (request/with-current-user (:id user)
                  (handler (assoc request :token-scopes (or (:scopes result)
                                                            token-scopes
                                                            #{::scope/unrestricted}))
                           respond raise)))
              (respond (error-response (:error result) (:message result))))))))))

(def +auth
  "Agent API authentication middleware. Supports both session-based and stateless JWT authentication."
  (api.routes.common/wrap-middleware-for-open-api-spec-generation enforce-authentication))

(def +agent-api-enabled
  "Wrap routes so they may only be accessed when the Agent API is enabled."
  agent-api.validation/+agent-api-enabled)

;;; ---------------------------------------------------- Routes ------------------------------------------------------

(def ^:private base-routes
  (api.macros/ns-handler *ns* +auth))

(def ^{:arglists '([request respond raise])} routes
  "`/api/agent/` routes."
  ;; Wrapped in `handler-with-open-api-spec` so the handler still implements `OpenAPISpec` for
  ;; full-API spec generation (openapi.json, endpoint-dox); the spec is delegated to `base-routes`,
  ;; the underlying `ns-handler`, since the eval-tracing wrapper below carries no route metadata.
  (open-api/handler-with-open-api-spec
   ;; Eval tracing (inert unless MB_AI_EVAL_CAPTURE). Direct callers get a fresh session;
   ;; the synthetic in-process call from MCP inherits the MCP session and nests under it.
   ;; Agent-API endpoints are synchronous, so `respond` fires inside the span and the span
   ;; closes after the handler returns.
   (fn [request respond raise]
     (ait/with-eval-session nil
       (ait/eval-span (str "agent-api." (some-> (:request-method request) name) " " (:uri request))
                      {:http/method  (some-> (:request-method request) name)
                       :http/uri     (:uri request)
                       :http/request (:body request)
                       :http/user-id (or (:metabase-user-id request) api/*current-user-id*)}
                      (base-routes request
                                   ;; Relies on `respond` firing synchronously on this thread (see
                                   ;; above): if an endpoint ever responds async, `*parent*` is
                                   ;; unbound there and this `record!` no-ops, so the span captures
                                   ;; no status/response. Both fail soft; the trace is just incomplete
                                   ;; for async agent-api responses.
                                   (fn eval-traced-respond [response]
                                     (when (ait/capture-active?)
                                       ;; `+auth` binds `*current-user-id*` inside `base-routes`, so it
                                       ;; is unbound when the span opened above but set by the time this
                                       ;; respond fires — record the user id here so direct HTTP callers
                                       ;; (not just the MCP path, which carries `:metabase-user-id`) get it.
                                       (ait/record! {:http/status   (:status response)
                                                     ;; Only record a plain data body. A streaming/opaque
                                                     ;; body (not a coll) would otherwise be stringified
                                                     ;; by the log sink into a useless `#object[…]`, so
                                                     ;; skip it — the trace just omits the response there.
                                                     :http/response (when (coll? (:body response))
                                                                      (:body response))
                                                     :http/user-id  (or (:metabase-user-id request)
                                                                        api/*current-user-id*)}))
                                     (respond response))
                                   raise))))
   (fn [prefix] (open-api/open-api-spec base-routes prefix))))
