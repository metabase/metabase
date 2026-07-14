(ns metabase.agent-api.api
  "The Agent API: the v2 tool endpoints, and the route table that serves them alongside the v1
   generation in [[metabase.agent-api.v1-api]].

   A v2 endpoint is a thin `defendpoint` — its wire schema, its tool description, and a delegation to the
   domain function that does the work. Everything the tools share (projections, bounded envelopes, teaching
   errors, ref ergonomics) lives in [[metabase.agent-api.tools]], and the endpoints themselves reach for
   nothing but that and their own domain namespace. In particular they never touch the application
   database: the permission checks a tool call must pass are the ones the public REST handlers pass, so a
   tool delegates to the same domain functions rather than re-deriving them."
  (:require
   [metabase.agent-api.auth :as agent-api.auth]
   [metabase.agent-api.browse-collection :as agent-api.browse-collection]
   [metabase.agent-api.browse-data :as agent-api.browse-data]
   [metabase.agent-api.card-write :as agent-api.card-write]
   [metabase.agent-api.dashboard-write :as agent-api.dashboard-write]
   [metabase.agent-api.execute-query :as agent-api.execute-query]
   [metabase.agent-api.execute-sql :as agent-api.execute-sql]
   [metabase.agent-api.exports :as agent-api.exports]
   [metabase.agent-api.get-content :as agent-api.get-content]
   [metabase.agent-api.parameter-values :as agent-api.parameter-values]
   [metabase.agent-api.results :as agent-api.results]
   [metabase.agent-api.run-saved-question :as agent-api.run-saved-question]
   [metabase.agent-api.search :as agent-api.search]
   [metabase.agent-api.tools :as agent-api.tools]
   [metabase.agent-api.v1-api :as v1-api]
   [metabase.agent-api.validation :as agent-api.validation]
   [metabase.api.common :as api]
   [metabase.api.macros :as api.macros]
   [metabase.api.util.handlers :as handlers]
   [metabase.metabot.config :as metabot.config]
   [metabase.metabot.feedback :as metabot.feedback]
   [metabase.util.malli.registry :as mr]
   [metabase.util.malli.schema :as ms])
  (:import
   (java.io ByteArrayInputStream)))

(set! *warn-on-reflection* true)

(defn submit-mcp-visualization-feedback!
  "Submit MCP Apps visualization feedback to Harbormaster.

  MCP Apps do not create `metabot_message` rows, so this intentionally skips
  local feedback persistence and forwards the MCP visualization context."
  [body]
  (let [metabot-id (api/check-500 (metabot.config/normalize-metabot-id metabot.config/embedded-metabot-id))
        body       (assoc body :metabot_id metabot-id)]
    (metabot.config/check-metabot-enabled!)
    (metabot.feedback/submit-to-harbormaster!
     (metabot.feedback/mcp-harbormaster-payload body))))

;;; ------------------------------------------------ Shared shapes ---------------------------------------------------

(mr/def ::list-structured-output
  "The `structuredContent` of a v2 list read: what a next call consumes, and never a second copy of the
  page, which travels once in the text block."
  [:map
   [:returned           {:tool/description "Rows in this page."} :int]
   [:total              {:optional true :tool/description "Rows in the whole set, when it is countable."}
    [:maybe :int]]
   [:truncated          {:optional true :tool/description "Whether more rows sit behind this page."}
    [:maybe :boolean]]
   [:truncation_message {:optional true
                         :tool/description (str "How to reach the rest: the next offset and the parameters "
                                                "that narrow the set.")}
    [:maybe :string]]])

;;; ---------------------------------------------------- Search ------------------------------------------------------

(mr/def ::search-request
  "Arguments to the `search` tool. Optional and nullable throughout: which of them are present is what
  picks the mode, and [[metabase.agent-api.search/search]] refuses a call that picks none."
  [:map
   [:term_queries
    {:optional true
     :tool/description (str "Keyword queries, as an array of strings, matched against names and "
                            "descriptions — for example [\"orders\", \"revenue\"]. Each query is "
                            "searched separately and the rankings are merged, so send one query per "
                            "concept rather than one long sentence.")}
    [:maybe [:or [:sequential ms/NonBlankString] ms/NonBlankString]]]
   [:semantic_queries
    {:optional true
     :tool/description (str "Natural-language queries, as an array of strings, matched by meaning — "
                            "for example [\"how much revenue did we make last quarter\"]. Add one only "
                            "for a genuinely different facet of the request, not a reworded synonym.")}
    [:maybe [:or [:sequential ms/NonBlankString] ms/NonBlankString]]]
   [:recent
    {:optional true
     :tool/description (str "Return the items you viewed most recently instead of searching. Takes "
                            "`type`, `limit`, and `offset`; passing queries or any other filter with it "
                            "is an error.")}
    [:maybe :boolean]]
   [:type
    {:optional true
     :tool/description (str "Restrict results to these types. Omit to search everything in the index. "
                            "\"snippet\" is served from the snippet table rather than the index: it is "
                            "matched by `term_queries` only, and cannot be combined with "
                            "`collection_id` or `created_by`.")}
    [:maybe [:sequential (into [:enum] agent-api.search/types)]]]
   [:collection_id
    {:optional true
     :tool/description (str "Restrict results to a collection and everything nested under it. Accepts a "
                            "numeric id or a 21-character entity_id.")}
    [:maybe agent-api.tools/IdRef]]
   [:created_by
    {:optional true
     :tool/description (str "Restrict results to content you created. Only questions, models, metrics, "
                            "dashboards, measures, and documents record a creator.")}
    [:maybe [:= "me"]]]
   [:archived
    {:optional true
     :tool/description "Search the trash instead of live content."}
    [:maybe :boolean]]
   [:limit
    {:optional true
     :tool/description "Results per page (default 20, max 50)."}
    [:maybe [:int {:min 1 :max agent-api.search/max-limit}]]]
   [:offset
    {:optional true
     :tool/description "Results to skip — page with the offset the truncation message names."}
    [:maybe [:int {:min 0}]]]
   [:fields
    {:optional true
     :tool/description (str "Return only these fields of each hit, as dot-paths into its full record (for "
                            "example [\"id\", \"name\"]). Overrides `response_format`.")}
    agent-api.tools/FieldsField]
   [:response_format
    {:optional true
     :tool/description (str "\"concise\" (default) returns id, name, type, description, and "
                            "collection_path per hit; \"detailed\" returns every field the search index "
                            "carries.")}
    agent-api.tools/ResponseFormatField]])

(api.macros/defendpoint :post "/v2/search" :- ::agent-api.tools/list-response
  "Find content in Metabase — the one entry point for discovery.

  Three modes, and a call has to pick one: ranked queries (`term_queries` / `semantic_queries`), a
  filter-only listing (`type` / `collection_id` / `created_by` / `archived`), or `recent: true`.
  Snippets are not in the search index and are served from their own table under `type: [\"snippet\"]`."
  {:scope "agent:discover:read"
   :tool  {:name  "search"
           :title "Search Metabase Content"
           :description
           (str "Find content in Metabase: questions, models, metrics, measures, segments, dashboards, "
                "documents, collections, tables, databases, transforms, and snippets.\n"
                "\n"
                "Pick one of three modes:\n"
                "- Rank by relevance: `term_queries` (keywords) and/or `semantic_queries` (natural "
                "language). Both are arrays of strings; each query is searched separately and the "
                "rankings merged, so send one query per concept.\n"
                "- List by filter: `type`, `collection_id`, `created_by`, and/or `archived` with no "
                "queries — \"all my dashboards\".\n"
                "- `recent: true`: the items you viewed most recently.\n"
                "\n"
                "Every hit carries `type` and `id` — hand them straight to `get_content` to read one. "
                "`collection_path` says where it lives. Page with `limit` (default 20, max 50) and "
                "`offset`.")
           :annotations      {:read-only? true :idempotent? true}
           :structured-output ::list-structured-output
           :input-examples [{:semantic_queries ["revenue by region"] :term_queries ["revenue"]}
                            {:type ["dashboard"] :created_by "me" :limit 50}
                            {:recent true}]}}
  [_route-params
   _query-params
   body :- ::search-request]
  (agent-api.search/search body))

;;; --------------------------------------------------- Browse Data --------------------------------------------------

(mr/def ::browse-data-request
  "Arguments to the `browse_data` tool. Only `action` is schema-required; per-action requirements are
  runtime-enforced with teaching errors in [[metabase.agent-api.browse-data/browse-data]], so a strict
  client's always-send-every-property shape validates."
  [:map
   [:action
    {:tool/description (str "What to list: `list_databases` needs nothing else; `list_schemas`, "
                            "`list_tables`, and `list_models` need `database_id`; `get_fields` needs "
                            "`table_ids`.")}
    (into [:enum] agent-api.browse-data/actions)]
   [:database_id
    {:optional true
     :tool/description (str "The database to browse — required for `list_schemas`, `list_tables`, and "
                            "`list_models`. Accepts a numeric id or a 21-character entity_id.")}
    [:maybe agent-api.tools/IdRef]]
   [:schema
    {:optional true
     :tool/description (str "Scope `list_tables` to one schema. Pass \"\" for tables outside any "
                            "schema.")}
    [:maybe :string]]
   [:search
    {:optional true
     :tool/description "Case-insensitive substring filter on table name — `list_tables` only."}
    [:maybe ms/NonBlankString]]
   [:table_ids
    {:optional true
     :tool/description (str "The tables whose fields to return — `get_fields` only, up to "
                            agent-api.browse-data/max-tables-per-call " per call. Each accepts a numeric "
                            "id or a 21-character entity_id.")}
    [:maybe [:sequential agent-api.tools/IdRef]]]
   [:include_hidden
    {:optional true
     :tool/description "Include hidden tables and fields (default false)."}
    [:maybe :boolean]]
   [:limit
    {:optional true
     :tool/description "Rows per page for the `list_*` actions (default 50, max 200)."}
    [:maybe [:int {:min 1 :max agent-api.browse-data/max-limit}]]]
   [:offset
    {:optional true
     :tool/description (str "For `list_*` actions: rows to skip — page with the offset the truncation "
                            "message names. For `get_fields` with a single table: the field position "
                            "to continue a too-wide table from.")}
    [:maybe [:int {:min 0}]]]
   [:fields
    {:optional true
     :tool/description (str "Return only these fields of each row, as dot-paths into its full record (for "
                            "example [\"id\", \"name\"]). Overrides `response_format`. `list_*` actions "
                            "only — a table unit's `fields` list is what `get_fields` is for.")}
    agent-api.tools/FieldsField]
   [:response_format
    {:optional true
     :tool/description (str "\"concise\" (default) returns the id/name/type essentials per row; "
                            "\"detailed\" on `get_fields` adds each field's full record (fingerprint "
                            "stats, `has_field_values`), sample values, and the questions, models, "
                            "and transforms derived from each table.")}
    agent-api.tools/ResponseFormatField]])

(mr/def ::browse-data-structured-output
  "The `structuredContent` of `browse_data`: the list envelope's next-step fields plus `omitted`, the
  `get_fields` remainder a next call works through."
  [:map
   [:returned           {:tool/description "Rows in this page — tables, for `get_fields`."} :int]
   [:total              {:optional true
                         :tool/description "Rows in the whole set; requested tables, for `get_fields`."}
    [:maybe :int]]
   [:truncated          {:optional true :tool/description "Whether more rows sit behind this page."}
    [:maybe :boolean]]
   [:truncation_message {:optional true
                         :tool/description (str "How to reach the rest: the next offset and the parameters "
                                                "that narrow the set.")}
    [:maybe :string]]
   [:omitted            {:optional true
                         :tool/description (str "`get_fields` only: requested tables not in this response, "
                                                "each with the reason.")}
    [:maybe [:sequential :map]]]])

(api.macros/defendpoint :post "/v2/browse-data" :- ::agent-api.tools/list-response
  "Browse the data hierarchy — databases, schemas, tables, models, fields.

  The action is a named enum, never inferred from argument presence: `list_databases`,
  `list_schemas` / `list_tables` / `list_models` (all scoped by `database_id`), and `get_fields` for
  the fields of up to 20 tables at once."
  {:scope "agent:discover:read"
   :tool  {:name  "browse_data"
           :title "Browse Databases, Schemas, and Tables"
           :description
           (str "Browse the data hierarchy: databases → schemas → tables → fields. Pick an action:\n"
                "- `list_databases` — every database you can query.\n"
                "- `list_schemas` — a database's schemas (`database_id` required).\n"
                "- `list_tables` — a database's tables (`database_id` required; scope with `schema`, "
                "filter with `search`).\n"
                "- `list_models` — the models built on a database (`database_id` required).\n"
                "- `get_fields` — the fields of up to 20 tables at once (`table_ids` required). Read "
                "the fields before writing a query; column names are never a guess.\n"
                "\n"
                "`list_*` actions page with `limit` (default 50, max 200) and `offset`. `get_fields` "
                "returns complete tables until the response budget runs out and names the rest in "
                "`omitted`; a table too wide for one response comes back as an explicit slice "
                "with the `offset` to continue from. `response_format: \"detailed\"` on `get_fields` "
                "adds fingerprint stats, sample values, and each table's derived questions, models, "
                "and transforms.")
           :annotations       {:read-only? true :idempotent? true}
           :structured-output ::browse-data-structured-output
           :input-examples [{:action "list_databases"}
                            {:action "list_tables" :database_id 1 :schema "PUBLIC" :search "order"}
                            {:action "get_fields" :table_ids [7 9] :response_format "detailed"}]}}
  [_route-params
   _query-params
   body :- ::browse-data-request]
  (agent-api.browse-data/browse-data body))

;;; ----------------------------------------------- Browse Collection ------------------------------------------------

(mr/def ::browse-collection-request
  "Arguments to the `browse_collection` tool. Only `id` is schema-required; the per-mode argument rules are
  runtime-enforced with teaching errors in [[metabase.agent-api.browse-collection/browse-collection]]."
  [:map
   [:id
    {:tool/description (str "The collection to browse: a numeric id, a 21-character entity_id, \"root\" for the top "
                            "level (\"Our analytics\"), or \"trash\" for archived content.")}
    agent-api.tools/CollectionLocator]
   [:mode
    {:optional true
     :tool/description (str "\"items\" (default) lists what the collection holds. \"tree\" walks the sub-collections "
                            "below it, without their contents.")}
    [:maybe (into [:enum] agent-api.browse-collection/modes)]]
   [:type
    {:optional true
     :tool/description "Restrict the items to these types — `items` mode only."}
    [:maybe [:sequential (into [:enum] agent-api.browse-collection/types)]]]
   [:sort_column
    {:optional true
     :tool/description "Order the items by name (default), last edit, or type — `items` mode only."}
    [:maybe (into [:enum] agent-api.browse-collection/sort-columns)]]
   [:sort_direction
    {:optional true
     :tool/description "\"asc\" (default) or \"desc\" — `items` mode only."}
    [:maybe [:enum "asc" "desc"]]]
   [:limit
    {:optional true
     :tool/description "Items per page (default 50, max 200) — `items` mode only."}
    [:maybe [:int {:min 1 :max agent-api.browse-collection/max-limit}]]]
   [:offset
    {:optional true
     :tool/description (str "Items to skip — page with the offset the truncation message names. `items` mode only; a "
                            "tree re-roots instead of paging.")}
    [:maybe [:int {:min 0}]]]
   [:depth
    {:optional true
     :tool/description (str "Levels of sub-collections to walk (default 2, max 5) — `tree` mode only. Walk deeper by "
                            "re-rooting on the branch you want.")}
    [:maybe [:int {:min 1 :max agent-api.browse-collection/max-depth}]]]
   [:fields
    {:optional true
     :tool/description (str "Return only these fields of each item, as dot-paths into its full record (for example "
                            "[\"id\", \"name\"]). Overrides `response_format`. `items` mode only.")}
    agent-api.tools/FieldsField]
   [:response_format
    {:optional true
     :tool/description (str "\"concise\" (default) returns id, name, type, description, pin position, and last-edit "
                            "info per item; \"detailed\" returns each item's whole record.")}
    agent-api.tools/ResponseFormatField]])

(api.macros/defendpoint :post "/v2/browse-collection" :- ::agent-api.tools/list-response
  "Browse the collection hierarchy — what a collection holds, or the collections below it.

  `mode: \"items\"` lists a collection's contents, pinned items first, exactly as the app's collection page does.
  `mode: \"tree\"` walks the sub-collections below it. `\"trash\"` is a locator like any other id, so archived content
  is discoverable."
  {:scope "agent:discover:read"
   :tool  {:name  "browse_collection"
           :title "Browse Collections"
           :description
           (str "Browse the collection hierarchy — Metabase's folders. Two modes:\n"
                "- `items` (default) — what the collection holds: questions, models, metrics, dashboards, documents, "
                "timelines, and sub-collections. Pinned items come first. Filter with `type`, order with "
                "`sort_column`, page with `limit` (default 50, max 200) and `offset`.\n"
                "- `tree` — the sub-collections below it, without their contents, to `depth` levels (default 2). A "
                "tree does not page: a branch that was cut names the call that re-roots on it.\n"
                "\n"
                "`id` takes a collection id, an entity_id, `\"root\"` (the top level, \"Our analytics\"), or "
                "`\"trash\"` (archived content — read it to offer a restore). Every item carries `type` and `id`: "
                "hand them to `get_content` to read one.")
           :annotations       {:read-only? true :idempotent? true}
           :structured-output ::list-structured-output
           :input-examples [{:id "root"}
                            {:id 12 :type ["dashboard"] :sort_column "last_edited_at" :sort_direction "desc"}
                            {:id "root" :mode "tree" :depth 3}]}}
  [_route-params
   _query-params
   body :- ::browse-collection-request]
  (agent-api.browse-collection/browse-collection body))

;;; -------------------------------------------------- Get Content ---------------------------------------------------

(mr/def ::content-item
  "One entity to read: the type, and an id in it."
  [:map
   [:type
    {:tool/description "What kind of thing to read."}
    (into [:enum] agent-api.get-content/types)]
   [:id
    {:tool/description (str "Which one. A numeric id, or a 21-character entity_id — except an alert, which "
                            "has no entity_id and takes a number.")}
    agent-api.tools/IdRef]])

(mr/def ::content-request
  "Arguments to the `get_content` tool."
  [:map
   [:items
    {:tool/description (str "The entities to read — up to " agent-api.get-content/max-items
                            " per call, and they may be of different types. `search` and "
                            "`browse_collection` return the type and id of every hit.")}
    [:sequential ::content-item]]
   [:include
    {:optional true
     :tool/description (str "Extra sections, applied to every item they mean something for. A section that "
                            "does not fit an item's type is skipped for that item and named in its result. "
                            "`definition` — the query, in the portable dialect the write tools take "
                            "(questions, models, metrics, measures, segments, transforms). `fields` — the "
                            "columns a saved question returns. `parameters` — the full filter widgets "
                            "(questions and dashboards; a native question's template tags come with them). "
                            "`layout` — a dashboard's raw dashcards, with their visualization settings and "
                            "parameter mappings. `dimensions` — the columns a metric can be grouped and "
                            "filtered by. `revisions` — the change history, whose ids `revert_content` "
                            "takes.")}
    [:maybe [:sequential (into [:enum] agent-api.get-content/includes)]]]
   [:fields
    {:optional true
     :tool/description (str "Return only these fields of each item, as dot-paths into its full record (for "
                            "example [\"id\", \"collection_id\"]). Overrides `response_format`. Applied to "
                            "every item, so a path a type does not carry is simply absent from it.")}
    agent-api.tools/FieldsField]
   [:response_format
    {:optional true
     :tool/description (str "\"concise\" (default) returns the essentials per type — for a dashboard, the "
                            "editing skeleton: its tabs, its parameters and what they filter, and one "
                            "summary row per card. \"detailed\" returns each item's whole record.")}
    agent-api.tools/ResponseFormatField]])

(mr/def ::content-structured-output
  "The `structuredContent` of `get_content`: the envelope's next-step fields plus `omitted`, the items the
  response budget cut, which a next call works through."
  [:map
   [:returned           {:tool/description "Items in this response."} :int]
   [:total              {:tool/description "Items requested."} :int]
   [:truncated          {:optional true :tool/description "Whether the response budget cut items."}
    [:maybe :boolean]]
   [:truncation_message {:optional true :tool/description "How to reach the rest."} [:maybe :string]]
   [:omitted            {:optional true
                         :tool/description "Requested items not in this response, by type and id."}
    [:maybe [:sequential :map]]]])

(api.macros/defendpoint :post "/v2/content" :- ::agent-api.tools/list-response
  "Read entities by type and id — the generic typed fetch.

  Reads up to 10 entities of any mix of types in one call, each through the domain function its REST
  endpoint calls. An id that names nothing, or something the caller may not read, comes back as an error in
  its own element rather than sinking the batch."
  {:scope "agent:discover:read"
   :tool  {:name  "get_content"
           :title "Read Metabase Content"
           :description
           (str "Read Metabase entities you already have the type and id of — from `search`, from "
                "`browse_collection`, or from a write tool's response.\n"
                "\n"
                "`items` takes up to 10 `{type, id}` pairs, and they can be of different types: a "
                "dashboard and the questions on it come back in one call. Types: question, model, metric, "
                "measure, segment, dashboard, document, collection, snippet, alert, subscription, "
                "timeline, transform.\n"
                "\n"
                "Each item comes back with its own type's fields. A dashboard's concise read is its "
                "editing skeleton — tabs, parameters and the dashcards each one filters, and one summary "
                "row per card — which is every input `dashboard_write`'s ops take. A document's body comes "
                "back as Markdown, which is what `document_write` takes. A question says what it is built "
                "on: `database_id`, `table_id`, `source_card_id`.\n"
                "\n"
                "`include` adds sections: `definition` (the query, in the portable dialect `execute_query` "
                "and `question_write` accept — so read, modify, and write round-trips), `fields` (the "
                "columns a question returns), `parameters`, `layout` (a dashboard's raw dashcards), "
                "`dimensions` (what a metric can be grouped by), `revisions` (the undo history, whose ids "
                "`revert_content` takes). Ask for a section on a type it does not fit and that item says "
                "so; the rest of the batch is unaffected.\n"
                "\n"
                "One bad id does not sink the call — it comes back as an `error` on its own element.")
           :annotations       {:read-only? true :idempotent? true}
           :structured-output ::content-structured-output
           :input-examples [{:items [{:type "dashboard" :id 7}]}
                            {:items [{:type "question" :id 42}] :include ["definition" "fields"]}
                            {:items [{:type "question" :id 42} {:type "dashboard" :id 7}]
                             :fields ["id" "name" "collection_id"]}]}}
  [_route-params
   _query-params
   body :- ::content-request]
  (agent-api.get-content/get-content body))

;;; ----------------------------------------------- Parameter Values -------------------------------------------------

(mr/def ::parameter-values-request
  "Arguments to the `get_parameter_values` tool."
  [:map
   [:target
    {:tool/description "Whether the parameter belongs to a dashboard or to a question."}
    (into [:enum] agent-api.parameter-values/targets)]
   [:id
    {:tool/description "The dashboard or question that carries the parameter. Numeric id or 21-character entity_id."}
    agent-api.tools/IdRef]
   [:parameter_id
    {:tool/description (str "The parameter's id — `get_content(include: [\"parameters\"])` on the dashboard or "
                            "question lists them.")}
    ms/NonBlankString]
   [:query
    {:optional true
     :tool/description "Return only the values matching this search text, instead of the first page of all of them."}
    [:maybe ms/NonBlankString]]
   [:constraints
    {:optional true
     :tool/description (str "The values already chosen for the dashboard's other parameters, as "
                            "{parameter_id: value} — the remaining values are filtered to what is reachable under "
                            "them (\"which cities are in the state I picked\"). Dashboards only.")}
    [:maybe [:map-of ms/NonBlankString :any]]]])

(mr/def ::parameter-values-response
  "The REST parameter-values shape, verbatim: each value is `[value]`, or `[value, label]` when the field is remapped.
  `has_more_values` marks a list the backend capped — narrow it with `query`."
  [:map {:closed true}
   [:values          [:sequential [:sequential :any]]]
   [:has_more_values :boolean]])

(mr/def ::parameter-values-structured-output
  "The `structuredContent` of `get_parameter_values`: the values travel in the text block, and the one field
  a next call acts on rides here — whether the list was capped, and so whether to narrow it."
  [:map
   [:has_more_values {:tool/description "Whether the backend capped the list — narrow it with `query`."}
    :boolean]])

(api.macros/defendpoint :post "/v2/parameter-values" :- ::parameter-values-response
  "The values a dashboard or question parameter accepts.

  Backed by the same chain-filter engine the app's filter widget reads, so `constraints` narrows a dashboard's
  parameter to the values reachable under the ones already chosen."
  {:scope "agent:discover:read"
   :tool  {:name  "get_parameter_values"
           :title "Get Filter Values"
           :description
           (str "List the values a dashboard or question filter accepts. Read them before running anything with a "
                "parameter: a value the warehouse does not spell that way matches no rows, and an empty result looks "
                "like an answer.\n"
                "\n"
                "`target` is \"dashboard\" or \"question\", `id` names it, and `parameter_id` is the parameter's id "
                "(`get_content` with `include: [\"parameters\"]` lists them). `query` searches the values by prefix. "
                "`constraints` — dashboards only — passes the values already chosen for the other parameters, so a "
                "dependent filter returns only what is reachable under them.\n"
                "\n"
                "Values come back as `[value]`, or `[value, label]` when the column is remapped: pass the *value*, "
                "show the label. `has_more_values: true` means the list was capped — narrow it with `query`.")
           :annotations       {:read-only? true :idempotent? true}
           :structured-output ::parameter-values-structured-output
           :input-examples [{:target "dashboard" :id 7 :parameter_id "abc12345"}
                            {:target "dashboard" :id 7 :parameter_id "abc12345"
                             :constraints {"def67890" "CA"}}
                            {:target "question" :id 42 :parameter_id "abc12345" :query "wid"}]}}
  [_route-params
   _query-params
   body :- ::parameter-values-request]
  (agent-api.parameter-values/get-parameter-values body))

;;; ------------------------------------------------ Execute Query ---------------------------------------------------

(mr/def ::execute-query-request
  "Arguments to the `execute_query` tool. Exactly one of `query` | `query_handle` names the query, and
  which one is a runtime rule, not a schema combinator: strict clients reject a top-level `oneOf`.

  `:query` is typed as an opaque `:map` at this boundary on purpose. The portable MBQL 5 shape is
  `::lib.schema/external-query`, which references `::lib.schema/query` and its `:optional`
  non-nullable keys (`:lib/metadata`, `:database`, …) — publishing it would emit JSON Schema strict
  clients reject, and the deep validation happens in the resolution pipeline anyway, where the errors
  can teach."
  [:map
   [:query
    {:optional true
     :tool/description (str "A Metabase MBQL 5 query as a JSON object, in the portable dialect described "
                            "in this tool's description. Use `query_handle` instead when you have one.")}
    [:maybe :map]]
   [:query_handle
    {:optional true
     :tool/description (str "A handle returned by a previous `execute_query` — it names the query that call "
                            "already validated. Required to page: pass it with the `offset` the truncation "
                            "message named.")}
    [:maybe ms/UUIDString]]
   [:validate_only
    {:optional true
     :tool/description (str "Validate the query and mint its handle without running it (default false). "
                            "The dry run: no warehouse query, no rows.")}
    [:maybe :boolean]]
   [:row_limit
    {:optional true
     :tool/description (str "Rows to return (default " agent-api.results/default-row-limit
                            ", max " agent-api.results/max-row-limit "). A page that would exceed the "
                            "response budget comes back smaller, and says so.")}
    [:maybe [:int {:min 1 :max agent-api.results/max-row-limit}]]]
   [:offset
    {:optional true
     :tool/description (str "Rows to skip — page with the `query_handle` and the offset the truncation "
                            "message names.")}
    [:maybe [:int {:min 0}]]]
   [:response_format
    {:optional true
     :tool/description (str "\"concise\" (default) describes each column by name, display name, "
                            "description, and type; \"detailed\" returns every field the query processor "
                            "carries about it. Rows are unaffected.")}
    agent-api.tools/ResponseFormatField]])

(mr/def ::query-response
  "The dataset REST shape — `cols` and `rows` as value arrays — plus the handle for what ran and the
  steer to the next page. `validate_only` returns the handle alone: nothing ran, so there is nothing to
  report about it."
  [:map {:closed true}
   [:query_handle       ms/UUIDString]
   [:validated          {:optional true} :boolean]
   [:cols               {:optional true} [:sequential :map]]
   [:rows               {:optional true} [:sequential [:sequential :any]]]
   [:row_count          {:optional true} :int]
   [:truncated          {:optional true} :boolean]
   [:truncation_message {:optional true} :string]])

(mr/def ::query-structured-output
  "The `structuredContent` of `execute_query`: the rows travel once in the text block, and the handle — what
  a save, a chart, or a next page is addressed by — rides here with the count and the truncation steer."
  [:map
   [:query_handle {:tool/description (str "The query that ran. Pass it to `question_write`, `visualize_query`, "
                                          "or back to `execute_query` with an `offset`.")}
    ms/UUIDString]
   [:validated    {:optional true
                   :tool/description "`validate_only` only: the query is valid and nothing ran."}
    [:maybe :boolean]]
   [:row_count    {:optional true :tool/description "Rows in this page."} [:maybe :int]]
   [:truncated    {:optional true :tool/description "Whether more rows may sit behind this page."}
    [:maybe :boolean]]
   [:truncation_message
    {:optional true
     :tool/description "How to reach the rest: the next offset, and what narrows the result instead."}
    [:maybe :string]]])

(api.macros/defendpoint :post "/v2/execute-query" :- ::query-response
  "Run an MBQL query — the one entry point for a query the caller holds.

  Takes portable MBQL 5 JSON or a `query_handle`, validates it against the database's metadata with
  teaching errors, and runs it unless `validate_only`. Returns a `query_handle` either way, so a save
  or a visualization reuses the query that just ran rather than regenerating it."
  {:scope "agent:query:read"
   :tool  {:name  "execute_query"
           :title "Run a Query"
           :description
           (str "Run a query and get its rows. Pass `query` (MBQL 5 JSON, below) or a `query_handle` "
                "from an earlier call — exactly one.\n"
                "\n"
                "Every call returns a `query_handle` naming the query that ran. Pass it to "
                "`question_write` to save exactly what you just saw, to `visualize_query` to chart it, "
                "or back here with an `offset` to read the next page. `validate_only: true` checks the "
                "query and mints the handle without running it.\n"
                "\n"
                "`row_limit` defaults to " agent-api.results/default-row-limit " (max "
                agent-api.results/max-row-limit "). A page that would not fit the response budget "
                "comes back smaller than you asked for. A truncated page says so and names the next "
                "`offset`. To answer a question about many rows, aggregate — do not page through them.\n"
                "\n"
                "**The query format.** Every clause is `[\"op\", {}, ...args]` — the options map at "
                "position 1 is mandatory, even when empty. Every field reference is "
                "`[\"field\", {}, [<database>, <schema>, <table>, <column>]]`: names, never numeric ids "
                "(`schema` is null for databases without schemas). A reference to an earlier stage's "
                "output is the bare column name: `[\"field\", {}, \"count\"]`. Use `search` and "
                "`browse_data` to learn the exact names first; never invent them.\n"
                "\n"
                "The top level is `{\"lib/type\": \"mbql/query\", \"stages\": [...]}`. Each stage is "
                "`{\"lib/type\": \"mbql.stage/mbql\", ...}`, and the *first* one carries either "
                "`source-table` (a `[<database>, <schema>, <table>]` name array) or `source-card` (a "
                "question, model, or metric `entity_id`); later stages read the previous stage's "
                "output. Per-stage keys: `filters`, `aggregation`, `breakout`, `expressions`, `fields`, "
                "`joins`, `order-by`, `limit`.\n"
                "\n"
                "```\n"
                "{\"lib/type\": \"mbql/query\",\n"
                " \"stages\": [{\"lib/type\": \"mbql.stage/mbql\",\n"
                "             \"source-table\": [\"Sample Database\", \"PUBLIC\", \"ORDERS\"],\n"
                "             \"aggregation\": [[\"count\", {}]],\n"
                "             \"breakout\": [[\"field\", {\"temporal-unit\": \"month\"},\n"
                "                           [\"Sample Database\", \"PUBLIC\", \"ORDERS\", \"CREATED_AT\"]]]}]}\n"
                "```\n"
                "\n"
                "Pitfalls: a missing `{}` options map; a numeric id where a name array belongs; and "
                "filtering on an aggregation (`[\">\", {}, [\"aggregation\", {}, 0], 10]`) in the same "
                "stage that aggregates — that needs a second stage.\n"
                "\n"
                "Raw SQL goes to `execute_sql`; a saved question goes to `run_saved_question`.")
           :annotations       {:read-only? true :idempotent? true}
           :structured-output ::query-structured-output
           :input-examples
           [{:query {:lib/type "mbql/query"
                     :stages   [{:lib/type     "mbql.stage/mbql"
                                 :source-table ["Sample Database" "PUBLIC" "ORDERS"]
                                 :aggregation  [["count" {}]]}]}}
            {:query_handle "1c9d2f3a-5b6e-4a7c-8d9e-0f1a2b3c4d5e" :offset 100}
            {:query {:lib/type "mbql/query"
                     :stages   [{:lib/type     "mbql.stage/mbql"
                                 :source-table ["Sample Database" "PUBLIC" "ORDERS"]}]}
             :validate_only true}]}}
  [_route-params
   _query-params
   body :- ::execute-query-request]
  (agent-api.execute-query/execute-query body))

;;; -------------------------------------------------- Execute SQL ---------------------------------------------------

(mr/def ::execute-sql-request
  "Arguments to the `execute_sql` tool. Exactly one of `sql` | `query_handle` names the query, and which one is
  a runtime rule rather than a schema combinator: strict clients reject a top-level `oneOf`."
  [:map
   [:database_id
    {:optional true
     :tool/description (str "The database to run the SQL against — required with `sql`. Accepts a numeric id "
                            "or a 21-character entity_id. A `query_handle` already names its database.")}
    [:maybe agent-api.tools/IdRef]]
   [:sql
    {:optional true
     :tool/description (str "The SQL to run, in the target database's own dialect. Use `query_handle` instead "
                            "when you have one.")}
    [:maybe ms/NonBlankString]]
   [:query_handle
    {:optional true
     :tool/description (str "A handle returned by a previous `execute_sql` — it names the SQL, and the values "
                            "that call gave its variables. Required to page: pass it with the `offset` the "
                            "truncation message named.")}
    [:maybe ms/UUIDString]]
   [:template_tag_values
    {:optional true
     :tool/description (str "The values for the SQL's `{{variables}}`, as {variable_name: value}. A value is "
                            "a string, a number, or a boolean, and is substituted as the type it is. Only "
                            "with `sql`.")}
    [:maybe [:map-of ms/NonBlankString [:or :string number? :boolean]]]]
   [:validate_only
    {:optional true
     :tool/description (str "Mint the query's handle without running it (default false). The template tags "
                            "and your permissions are checked; the SQL itself is not — only the database can "
                            "say whether it parses.")}
    [:maybe :boolean]]
   [:row_limit
    {:optional true
     :tool/description (str "Rows to return (default " agent-api.results/default-row-limit
                            ", max " agent-api.results/max-row-limit "). A page that would exceed the "
                            "response budget comes back smaller, and says so.")}
    [:maybe [:int {:min 1 :max agent-api.results/max-row-limit}]]]
   [:offset
    {:optional true
     :tool/description (str "Rows to skip — page with the `query_handle` and the offset the truncation "
                            "message names. Bounded by the instance's row cap, because raw SQL is paged by "
                            "re-reading it: past the cap, page inside the SQL with `LIMIT`/`OFFSET`.")}
    [:maybe [:int {:min 0}]]]
   [:response_format
    {:optional true
     :tool/description (str "\"concise\" (default) describes each column by name, display name, description, "
                            "and type; \"detailed\" returns every field the query processor carries about it. "
                            "Rows are unaffected.")}
    agent-api.tools/ResponseFormatField]])

(api.macros/defendpoint :post "/v2/execute-sql" :- ::query-response
  "Run raw SQL — the one entry point for a query MBQL cannot express.

  Takes `sql` against a `database_id`, or a `query_handle` from an earlier call, and runs it unless
  `validate_only`. Requires native-query permission on the target database, and the whole tool can be turned
  off instance-wide, in which case it is absent from `tools/list` as well as refused here. Returns a
  `query_handle` either way, so SQL reaches a saved question or a chart with no construct step."
  {:scope "agent:query:read"
   :tool  {:name  "execute_sql"
           :title "Run SQL"
           :description
           (str "Run raw SQL against a database and get its rows. Pass `sql` with a `database_id`, or a "
                "`query_handle` from an earlier call — exactly one.\n"
                "\n"
                "Reach for SQL only when MBQL cannot say it — a window function, a recursive CTE, "
                "engine-specific syntax. `execute_query` is portable across engines and validates column "
                "names against the schema before it runs, so a typo comes back naming the column rather than "
                "as a database error. Read the real table and column names with `browse_data` first; never "
                "write them from memory.\n"
                "\n"
                "Every call returns a `query_handle` naming the query that ran. Pass it to `question_write` "
                "to save exactly what you just ran, to `visualize_query` to chart it, or back here with an "
                "`offset` to read the next page. `validate_only: true` mints the handle without running "
                "anything — but nothing checks the SQL itself, so run it before you save it.\n"
                "\n"
                "**Variables.** Write `{{name}}` in the SQL and pass `template_tag_values: {\"name\": value}`. "
                "The value is substituted by Metabase as the type it is — a number as a number, a string as a "
                "string — and rides on the saved question as the variable's default. `[[AND x = {{name}}]]` "
                "wraps a clause that is dropped when the variable has no value.\n"
                "\n"
                "`row_limit` defaults to " agent-api.results/default-row-limit " (max "
                agent-api.results/max-row-limit "). To answer a question about many rows, aggregate in the "
                "SQL — do not page through them.\n"
                "\n"
                "You need native-query permission on the database. If you do not have it, no rewrite of the "
                "SQL will help: answer with `execute_query` instead.")
           :annotations       {:destructive? true :idempotent? false}
           :structured-output ::query-structured-output
           :input-examples
           [{:database_id 1
             :sql "SELECT status, count(*) AS orders FROM orders GROUP BY status ORDER BY orders DESC"}
            {:database_id 1
             :sql "SELECT id, total FROM orders WHERE status = {{status}} ORDER BY id"
             :template_tag_values {:status "paid"}}
            {:query_handle "1c9d2f3a-5b6e-4a7c-8d9e-0f1a2b3c4d5e" :offset 100}]}}
  [_route-params
   _query-params
   body :- ::execute-sql-request]
  (agent-api.execute-sql/execute-sql body))

;;; ----------------------------------------------- Run Saved Question -----------------------------------------------

(mr/def ::saved-question-parameter
  "One filter value: which of the card's parameters, and what to set it to."
  [:map
   [:id
    {:optional true
     :tool/description (str "The parameter's id — `get_content(include: [\"parameters\"])` lists them. Give "
                            "this or `slug`, not both.")}
    [:maybe ms/NonBlankString]]
   [:slug
    {:optional true
     :tool/description "The parameter's slug, which is what it is called in the question's filter widget."}
    [:maybe ms/NonBlankString]]
   [:value
    {:tool/description (str "The value to filter by. `get_parameter_values` lists the values the column "
                            "actually holds — a value the warehouse does not spell that way matches no rows.")}
    :any]])

(mr/def ::run-saved-question-request
  "Arguments to the `run_saved_question` tool."
  [:map
   [:id
    {:tool/description "The question, model, or metric to run. A numeric id or a 21-character entity_id."}
    agent-api.tools/IdRef]
   [:parameters
    {:optional true
     :tool/description (str "Values for the filters the question declares. Each names one by `id` or `slug` "
                            "and gives its `value`; a filter you name no value for keeps its default.")}
    [:maybe [:sequential ::saved-question-parameter]]]
   [:export
    {:optional true
     :tool/description (str "Return the whole result as a downloadable file instead of rows. Answers with a "
                            "link and a row count, never with the file's bytes.")}
    [:maybe (into [:enum] agent-api.run-saved-question/export-formats)]]
   [:row_limit
    {:optional true
     :tool/description (str "Rows to return (default " agent-api.results/default-row-limit
                            ", max " agent-api.results/max-row-limit "). A page that would exceed the "
                            "response budget comes back smaller, and says so. Not for use with `export`.")}
    [:maybe [:int {:min 1 :max agent-api.results/max-row-limit}]]]
   [:offset
    {:optional true
     :tool/description (str "Rows to skip — page with the offset the truncation message names. Not for use "
                            "with `export`.")}
    [:maybe [:int {:min 0}]]]
   [:response_format
    {:optional true
     :tool/description (str "\"concise\" (default) describes each column by name, display name, description, "
                            "and type; \"detailed\" returns every field the query processor carries about it. "
                            "Rows are unaffected.")}
    agent-api.tools/ResponseFormatField]])

(mr/def ::saved-question-response
  "The dataset REST shape and the steer to the next page — or, under `export`, the link to the file and nothing
  of what is in it."
  [:map {:closed true}
   [:cols               {:optional true} [:sequential :map]]
   [:rows               {:optional true} [:sequential [:sequential :any]]]
   [:row_count          {:optional true} :int]
   [:truncated          {:optional true} :boolean]
   [:truncation_message {:optional true} :string]
   [:download_url       {:optional true} :string]
   [:filename           {:optional true} :string]
   [:expires_at         {:optional true} :string]])

(mr/def ::saved-question-structured-output
  "The `structuredContent` of `run_saved_question`: the rows travel once, in the text block, and what a next call
  or a person acts on rides here — the count, the truncation steer, and the download link."
  [:map
   [:row_count    {:optional true :tool/description "Rows in this page, or in the exported file."} [:maybe :int]]
   [:truncated    {:optional true :tool/description "Whether more rows sit behind this page."} [:maybe :boolean]]
   [:truncation_message
    {:optional true :tool/description "How to reach the rest: the next offset, and what narrows the result."}
    [:maybe :string]]
   [:download_url {:optional true
                   :tool/description "`export` only: the URL that downloads the file. Give it to the user."}
    [:maybe :string]]
   [:filename     {:optional true :tool/description "`export` only: the name the file downloads under."}
    [:maybe :string]]
   [:expires_at   {:optional true :tool/description "`export` only: when the download link stops working."}
    [:maybe :string]]])

(api.macros/defendpoint :post "/v2/run-saved-question" :- ::saved-question-response
  "Run a saved question, model, or metric — with values for the filters it declares.

  Runs the card's stored query under the caller's permissions, exactly as opening it in the app does.
  `parameters` set the filters the card declares, named by id or by slug and resolved against the card's own
  parameter list. `export` generates the whole result as a file and answers with a TTL'd download link."
  {:scope "agent:query:read"
   :tool  {:name  "run_saved_question"
           :title "Run a Saved Question"
           :description
           (str "Run a saved question, model, or metric and get its rows. Prefer this over rebuilding the "
                "query: a saved question is the one somebody already got right, and its number is the one "
                "their team agrees on.\n"
                "\n"
                "`id` takes the numeric id or the entity_id `search` and `browse_collection` return.\n"
                "\n"
                "**Filters.** If the question declares parameters, set them with `parameters`: "
                "`[{\"slug\": \"category\", \"value\": \"Gadget\"}]`. Name each one by `slug` or by `id` — "
                "`get_content` with `include: [\"parameters\"]` lists both. Read the values a filter accepts "
                "with `get_parameter_values` first: a value the warehouse does not spell that way matches no "
                "rows, and an empty result looks like an answer. A filter you give no value for keeps its "
                "default.\n"
                "\n"
                "**Rows.** `row_limit` defaults to " agent-api.results/default-row-limit " (max "
                agent-api.results/max-row-limit "); a truncated page says so and names the next `offset`. To "
                "answer a question about many rows, do not page through them — run a question that aggregates "
                "them, or build one with `execute_query`.\n"
                "\n"
                "**Files.** `export: \"csv\" | \"xlsx\" | \"json\"` returns the *whole* result as a file: a "
                "`download_url` to give the user, the `row_count` it holds, and when the link expires. The "
                "rows in that file are the rows this call counted. It needs download permission on the data, "
                "and it does not take `row_limit` or `offset`.")
           :annotations       {:read-only? true :idempotent? true}
           :structured-output ::saved-question-structured-output
           :input-examples [{:id 42}
                            {:id 42 :parameters [{:slug "category" :value "Gadget"}]}
                            {:id 42 :export "csv"}]}}
  [_route-params
   _query-params
   body :- ::run-saved-question-request]
  (agent-api.run-saved-question/run-saved-question body))

;;; ------------------------------------------------- Card Writes ----------------------------------------------------

(mr/def ::card-write-response
  "The card a write saved, in the concise projection `get_content` returns it in: a save answers the question a
  read would have asked, so the agent can say what it saved and where without a follow-up call."
  [:map {:closed true}
   [:id             ms/PositiveInt]
   [:name           :string]
   [:type           [:or :keyword :string]]
   [:display        {:optional true} [:maybe [:or :keyword :string]]]
   [:description    {:optional true} [:maybe :string]]
   [:database_id    {:optional true} [:maybe :int]]
   [:table_id       {:optional true} [:maybe :int]]
   [:source_card_id {:optional true} [:maybe :int]]
   [:collection_id  {:optional true} [:maybe :int]]
   [:archived       :boolean]])

(mr/def ::card-write-structured-output
  "The `structuredContent` of a card write: what the card now is, and what a next call addresses it by."
  [:map
   [:id            {:tool/description "The card's id. `get_content` reads it; `dashboard_write` places it."}
    :int]
   [:name          {:tool/description "The name it was saved under."} :string]
   [:type          {:tool/description "\"question\", \"model\", or \"metric\"."} [:or :keyword :string]]
   [:collection_id {:optional true
                    :tool/description "The collection it lives in — null is the top level, \"Our analytics\"."}
    [:maybe :int]]
   [:archived      {:tool/description "Whether it is in the trash."} :boolean]])

(mr/def ::native-source
  "A native SQL question's query: the SQL, the database it speaks, and the variables it declares."
  [:map
   [:database_id
    {:optional true
     :tool/description "The database the SQL runs against. A numeric id or a 21-character entity_id."}
    [:maybe agent-api.tools/IdRef]]
   [:sql
    {:optional true
     :tool/description "The SQL to save, in that database's own dialect."}
    [:maybe ms/NonBlankString]]
   [:template_tags
    {:optional true
     :tool/description
     (str "The `{{variables}}` the SQL declares, as {variable_name: {...}}. Each takes a `type`: "
          "\"text\", \"number\", \"date\", or \"dimension\" (a filter on a column, which also needs "
          "`field_id` and `widget_type`). Optional per variable: `display_name`, `default`, `required`. "
          "A variable the SQL does not declare is an error — write `{{name}}` into the SQL to create it.")}
    [:maybe [:map-of ms/NonBlankString
             [:map
              [:type         {:optional true}
               [:maybe (into [:enum] agent-api.card-write/template-tag-types)]]
              [:display_name {:optional true} [:maybe :string]]
              [:default      {:optional true} [:maybe :any]]
              [:required     {:optional true} [:maybe :boolean]]
              [:field_id     {:optional true} [:maybe ms/PositiveInt]]
              [:widget_type  {:optional true} [:maybe ms/NonBlankString]]]]]]])

(mr/def ::question-write-request
  "Arguments to the `question_write` tool. Only `method` is schema-required: a strict client sends `null` for
  every argument a call does not set, so an absent argument and a null one arrive the same way and the
  per-method requirements are runtime-enforced with teaching errors."
  [:map
   [:method
    {:tool/description "\"create\" saves a new question or model; \"update\" changes an existing one."}
    agent-api.tools/MethodField]
   [:id
    {:optional true
     :tool/description (str "The question or model to change — required for `update`, and never given on "
                            "`create`. A numeric id or a 21-character entity_id.")}
    [:maybe agent-api.tools/IdRef]]
   [:card_type
    {:optional true
     :tool/description (str "\"question\" (default) or \"model\" — a model is a curated, reusable table other "
                            "questions are built on. On `update`, changing this converts the card.")}
    [:maybe (into [:enum] agent-api.card-write/card-types)]]
   [:name
    {:optional true :tool/description "The name it is saved under — required for `create`."}
    [:maybe ms/NonBlankString]]
   [:description
    {:optional true :tool/description "What it answers, in a sentence."}
    [:maybe :string]]
   [:query_handle
    {:optional true
     :tool/description (str "The query to save, as a handle from `execute_query`, `execute_sql`, or "
                            "`run_saved_question`. Prefer this: it saves exactly the query that ran.")}
    [:maybe ms/UUIDString]]
   [:query
    {:optional true
     :tool/description (str "The query to save, as MBQL 5 JSON in the portable dialect `execute_query` takes. "
                            "Use `query_handle` instead when you have one.")}
    [:maybe :map]]
   [:native
    {:optional true
     :tool/description (str "The query to save, as raw SQL: `{database_id, sql, template_tags?}`. Needs "
                            "native-query permission on the database.")}
    [:maybe ::native-source]]
   [:collection_id
    {:optional true
     :tool/description (str "The collection to save it in, or to move it to. A numeric id, a 21-character "
                            "entity_id, or \"root\" for the top level (\"Our analytics\"). Omit it on "
                            "`create` and it is saved to your personal collection.")}
    [:maybe agent-api.tools/CollectionRef]]
   [:dashboard_id
    {:optional true
     :tool/description (str "Save the question inside this dashboard instead of a collection — a dashboard "
                            "question, which only that dashboard uses. Not with `collection_id`.")}
    [:maybe agent-api.tools/IdRef]]
   [:collection_position
    {:optional true
     :tool/description "Pin it in its collection, at this position. 1 is the first pin."}
    [:maybe [:int {:min 1}]]]
   [:display
    {:optional true
     :tool/description "How it is visualized — \"table\" (default), \"bar\", \"line\", \"pie\", and so on."}
    [:maybe (into [:enum] agent-api.card-write/displays)]]
   [:visualization_settings
    {:optional true
     :tool/description "The visualization's settings, in the REST shape. Defaults to none."}
    [:maybe :map]]
   [:cache_ttl
    {:optional true :tool/description "How many hours to cache its results for."}
    [:maybe [:int {:min 1}]]]
   [:column_metadata
    {:optional true
     :tool/description
     (str "Curate the columns of a **model** — `[{name, display_name?, description?, semantic_type?, "
          "visibility_type?}]`, one entry per column you are changing, `name` being the column's own name "
          "as the query returns it. Models only. The columns you do not name keep what the query says they "
          "are.")}
    [:maybe [:sequential
             [:map
              [:name            ms/NonBlankString]
              [:display_name    {:optional true} [:maybe :string]]
              [:description     {:optional true} [:maybe :string]]
              [:semantic_type   {:optional true} [:maybe ms/NonBlankString]]
              [:visibility_type {:optional true} [:maybe ms/NonBlankString]]]]]]
   [:archived
    {:optional true
     :tool/description (str "`update` only: `true` moves it to the trash — the soft delete, and the only "
                            "delete there is — and `false` restores it.")}
    [:maybe :boolean]]])

(api.macros/defendpoint :post "/v2/question-write" :- ::card-write-response
  "Create or update a question or a model — one tool for both, keyed by `method`.

  `create` needs a `name` and exactly one query source (`query_handle`, `query`, or `native`); `update` needs
  an `id` and changes only the fields it names. Every check the app's own save runs, this runs: run permission
  on the query, write permission on the collection it lands in and the one it leaves."
  {:scope "agent:author:write"
   :tool  {:name  "question_write"
           :title "Create or Update a Question"
           :description
           (str "Save a question or a model in Metabase.\n"
                "\n"
                "`method: \"create\"` makes a new one: it needs a `name` and exactly one query source.\n"
                "`method: \"update\"` changes an existing one: it needs its `id`, and changes only the "
                "fields you pass.\n"
                "\n"
                "**The query.** Give it exactly one of:\n"
                "- `query_handle` — the handle `execute_query` or `execute_sql` returned. Prefer this: it "
                "saves byte-for-byte the query whose rows you just saw, rather than a rebuilt near-miss.\n"
                "- `query` — MBQL 5 JSON, in the same portable dialect `execute_query` takes.\n"
                "- `native` — `{database_id, sql, template_tags?}` for raw SQL. Needs native-query "
                "permission. `template_tags` types the `{{variables}}` the SQL declares: \"text\", "
                "\"number\", \"date\", or \"dimension\" (a filter on a column, which also needs a "
                "`field_id` and a `widget_type`).\n"
                "\n"
                "**Where it lands.** Omit `collection_id` and it is saved to your personal collection. Pass "
                "a collection's id, or \"root\" for the top level (\"Our analytics\"). `dashboard_id` "
                "instead saves it inside a dashboard, where only that dashboard uses it. On an `update`, "
                "`collection_id` *moves* it and `collection_position` pins it — there is no separate move "
                "tool.\n"
                "\n"
                "**Models.** `card_type: \"model\"` saves it as a model, the curated table other questions "
                "build on. `column_metadata` renames and retypes its columns: one entry per column you are "
                "changing, keyed by the column's `name`. It is a model-only field.\n"
                "\n"
                "**Trash.** `archived: true` on an update moves it to the trash — that is the delete, and it "
                "is reversible with `archived: false`. There is no hard delete.\n"
                "\n"
                "Metrics have their own tool: `metric_write`.")
           :annotations       {:idempotent? false}
           :structured-output ::card-write-structured-output
           :input-examples
           [{:method "create" :name "Orders by month" :query_handle "1c9d2f3a-5b6e-4a7c-8d9e-0f1a2b3c4d5e"
             :display "line"}
            {:method "create" :name "Paid orders" :card_type "model"
             :native {:database_id 1
                      :sql "SELECT id, total FROM orders WHERE status = {{status}}"
                      :template_tags {:status {:type "text" :default "paid"}}}
             :column_metadata [{:name "TOTAL" :display_name "Order total" :semantic_type "type/Currency"}]}
            {:method "update" :id 42 :name "Orders by month, 2026" :collection_id 7}
            {:method "update" :id 42 :archived true}]}}
  [_route-params
   _query-params
   body :- ::question-write-request]
  (agent-api.card-write/question-write body))

(mr/def ::metric-write-request
  "Arguments to the `metric_write` tool. Only `method` is schema-required; the per-method requirements are
  runtime-enforced with teaching errors."
  [:map
   [:method
    {:tool/description "\"create\" saves a new metric; \"update\" changes an existing one."}
    agent-api.tools/MethodField]
   [:id
    {:optional true
     :tool/description (str "The metric to change — required for `update`, and never given on `create`. A "
                            "numeric id or a 21-character entity_id.")}
    [:maybe agent-api.tools/IdRef]]
   [:name
    {:optional true :tool/description "The name it is saved under — required for `create`."}
    [:maybe ms/NonBlankString]]
   [:description
    {:optional true :tool/description "What it measures, and how it is meant to be read."}
    [:maybe :string]]
   [:definition
    {:optional true
     :tool/description (str "The metric's query — MBQL 5 JSON, in the portable dialect `execute_query` takes. "
                            "Exactly one aggregation, and at most one date grouping. Required for `create`.")}
    [:maybe :map]]
   [:collection_id
    {:optional true
     :tool/description (str "The collection to save it in, or to move it to. A numeric id, a 21-character "
                            "entity_id, or \"root\" for the top level. Omit it on `create` and it is saved to "
                            "your personal collection.")}
    [:maybe agent-api.tools/CollectionRef]]
   [:collection_position
    {:optional true :tool/description "Pin it in its collection, at this position."}
    [:maybe [:int {:min 1}]]]
   [:archived
    {:optional true
     :tool/description "`update` only: `true` trashes it, `false` restores it."}
    [:maybe :boolean]]])

(api.macros/defendpoint :post "/v2/metric-write" :- ::card-write-response
  "Create or update a metric — a card whose query the product constrains to one aggregation.

  `create` needs a `name` and a `definition`; `update` needs an `id`. A definition that is not a metric — two
  aggregations, two date groupings — is refused with the change to make, exactly as the app refuses it."
  {:scope "agent:author:write"
   :tool  {:name  "metric_write"
           :title "Create or Update a Metric"
           :description
           (str "Save a metric in Metabase: a named number a team agrees on — \"Revenue\", \"Active "
                "customers\" — that anybody can then group and filter without rebuilding the arithmetic.\n"
                "\n"
                "`method: \"create\"` needs a `name` and a `definition`. `method: \"update\"` needs the "
                "metric's `id` and changes only the fields you pass.\n"
                "\n"
                "**The definition** is the metric's query, as MBQL 5 JSON in the portable dialect "
                "`execute_query` takes. It must have exactly one aggregation (a count, a sum, an average) "
                "and at most one date grouping — that is what makes it a metric rather than a question. "
                "Build it with `execute_query` first and check the number, then save that query here.\n"
                "\n"
                "**Where it lands.** Omit `collection_id` and it is saved to your personal collection; pass "
                "a collection's id, or \"root\" for the top level. On an `update`, `collection_id` moves it "
                "and `archived: true` trashes it.\n"
                "\n"
                "A metric is not a *measure*. A measure is a reusable aggregation expression attached to one "
                "table (`measure_write`); a metric is a standalone saved query anybody can run and drill "
                "into. If you were asked for something a question could answer, save a question with "
                "`question_write` instead — a metric is a commitment the whole team reads.")
           :annotations       {:idempotent? false}
           :structured-output ::card-write-structured-output
           :input-examples
           [{:method "create" :name "Total revenue"
             :definition {:lib/type "mbql/query"
                          :stages   [{:lib/type     "mbql.stage/mbql"
                                      :source-table ["Sample Database" "PUBLIC" "ORDERS"]
                                      :aggregation  [["sum" {} ["field" {} ["Sample Database" "PUBLIC"
                                                                            "ORDERS" "TOTAL"]]]]}]}}
            {:method "update" :id 10 :description "Gross revenue, before refunds." :collection_id 7}
            {:method "update" :id 10 :archived true}]}}
  [_route-params
   _query-params
   body :- ::metric-write-request]
  (agent-api.card-write/metric-write body))

;;; ------------------------------------------------ Dashboard Write -------------------------------------------------

(mr/def ::dashboard-write-response
  "The dashboard a write saved, as its editing skeleton — the same shape `get_content` returns for a dashboard. A
  write answers the question the next read would have asked, so the next op is authorable from the response."
  [:map {:closed true}
   [:id                   {:optional true} [:maybe ms/PositiveInt]]
   [:name                 {:optional true} [:maybe :string]]
   [:description          {:optional true} [:maybe :string]]
   [:collection_id        {:optional true} [:maybe :int]]
   [:archived             {:optional true} [:maybe :boolean]]
   [:validated            {:optional true} :boolean]
   [:tabs                 [:sequential :map]]
   [:parameters           [:sequential :map]]
   [:dashcards            [:sequential :map]]
   [:broken_subscriptions {:optional true} [:sequential :map]]])

(mr/def ::dashboard-write-structured-output
  "The `structuredContent` of a dashboard write: what the dashboard now is, and what a next call addresses it by."
  [:map
   [:id        {:optional true
                :tool/description "The dashboard's id. Absent on a `validate_only` create — nothing was saved."}
    [:maybe :int]]
   [:name      {:optional true :tool/description "The name it was saved under."} [:maybe :string]]
   [:validated {:optional true
                :tool/description "Present, and true, only on a `validate_only` call: the ops are valid, and
                                   nothing was written."}
    [:maybe :boolean]]
   [:broken_subscriptions
    {:optional true
     :tool/description (str "The subscriptions a `remove_parameter` broke, by id and name. Removing a filter a "
                            "subscription sends archives that subscription and mails its creator — tell the user "
                            "which ones went.")}
    [:maybe [:sequential :map]]]])

(mr/def ::dashboard-position
  "Where a card sits on the 24-column grid."
  [:map
   [:row {:optional true :tool/description "Rows from the top of the tab. 0 is the top."}
    [:maybe [:int {:min 0}]]]
   [:col {:optional true :tool/description "Columns from the left. 0 is the left edge, 23 the right."}
    [:maybe [:int {:min 0 :max 23}]]]])

(mr/def ::dashboard-size
  "How big a card is, in grid cells."
  [:map
   [:size_x {:optional true :tool/description "Width in columns, 1 to 24."} [:maybe [:int {:min 1 :max 24}]]]
   [:size_y {:optional true :tool/description "Height in rows."} [:maybe [:int {:min 1}]]]])

(mr/def ::dashboard-op
  "One op of a `dashboard_write` call. Flat, with `op` the only field every op takes: which of the other fields an
  op needs is the op's own contract, stated in `op`'s description and enforced at runtime with an error naming the
  op's index."
  [:map
   [:op
    {:tool/description
     (str "What this op does. Cards: `add_card` (`card_id`, and optionally `series`, `inline_parameters`); "
          "`add_text` (`markdown`); `add_heading` (`text`); `add_link` (`url` or `entity`); `add_iframe` "
          "(`src`); `add_action` (`action_id`, and optionally `label`, `display`); `duplicate_card` "
          "(`dashcard_id`); `replace_card` (`dashcard_id`, `card_id`); `move` (`dashcard_id`, and a `tab` or a "
          "`position`); `resize` (`dashcard_id`, `size`); `remove` (`dashcard_id`); `set_series` "
          "(`dashcard_id`, `card_ids`); `patch_dashcard` (`dashcard_id`, `patch`). Every add takes an optional "
          "`tab`, `position`, and `size`. Tabs: `add_tab` (`name`); `rename_tab` (`tab_id`, `name`); `move_tab` "
          "(`tab_id`, `index`); `duplicate_tab` (`tab_id`); `remove_tab` (`tab_id`, which deletes the cards on "
          "it). Filters: `add_parameter` (`name`, `type`); `update_parameter` (`parameter_id`, and the fields to "
          "change); `remove_parameter` (`parameter_id`); `move_parameter` (`parameter_id`, and an `index` or a "
          "`dashcard_id`); `wire_parameter` (`parameter_id`, a `dashcard_id` or the `card_id` it shows, and one of "
          "`target_field`, `target_tag`, `target` — plus `autowire` to filter the tab's other cards by the same "
          "column); `unwire_parameter` (`parameter_id`, and a `dashcard_id` to unwire one card).")}
    (into [:enum] agent-api.dashboard-write/ops)]
   [:card_id
    {:optional true
     :tool/description (str "The card to place, or to replace a dashcard's card with. On `wire_parameter`, it names "
                            "the dashcard *showing* that card — which is how a call wires a card it added in this "
                            "same list, whose dashcard id the save has not minted yet.")}
    [:maybe agent-api.tools/IdRef]]
   [:dashcard_id
    {:optional true
     :tool/description (str "The dashcard to act on — a card already on the dashboard. `get_content` and this "
                            "tool's own response list them with their ids.")}
    [:maybe :int]]
   [:tab
    {:optional true
     :tool/description (str "The tab to put the card on: its id, or its name. A tab an earlier op in this same "
                            "list added has no id yet, so name it. Omitted, the card goes on the first tab.")}
    [:maybe [:or :int ms/NonBlankString]]]
   [:position
    {:optional true
     :tool/description (str "Where to put it. Omit it and the card is placed in the first free slot, which is "
                            "what you want unless you are laying out a grid deliberately.")}
    [:maybe ::dashboard-position]]
   [:size
    {:optional true
     :tool/description "How big to make it. Omitted, a card gets the size the app gives its visualization."}
    [:maybe ::dashboard-size]]
   [:series
    {:optional true
     :tool/description "Extra cards to plot on this one, in order — a combined chart. Card ids."}
    [:maybe [:sequential agent-api.tools/IdRef]]]
   [:card_ids
    {:optional true
     :tool/description "`set_series`: the dashcard's whole series, in order. `[]` clears it."}
    [:maybe [:sequential agent-api.tools/IdRef]]]
   [:inline_parameters
    {:optional true
     :tool/description (str "Ids of the dashboard's filters to show on this card instead of at the top of the "
                            "page. They have to be filters the dashboard already has.")}
    [:maybe [:sequential ms/NonBlankString]]]
   [:markdown
    {:optional true :tool/description "`add_text`: the text of the card, as Markdown."}
    [:maybe ms/NonBlankString]]
   [:text
    {:optional true :tool/description "`add_heading`: the heading."}
    [:maybe ms/NonBlankString]]
   [:url
    {:optional true :tool/description "`add_link`: the URL to link to."}
    [:maybe ms/NonBlankString]]
   [:entity
    {:optional true
     :tool/description (str "`add_link`: something in this Metabase to link to, as `{type, id}` — a \"card\", "
                            "\"dashboard\", \"collection\", \"table\", or \"database\".")}
    [:maybe [:map
             [:type {:optional true} [:maybe ms/NonBlankString]]
             [:id   {:optional true} [:maybe :int]]]]]
   [:src
    {:optional true :tool/description "`add_iframe`: the URL to embed."}
    [:maybe ms/NonBlankString]]
   [:action_id
    {:optional true :tool/description "`add_action`: the action the button runs."}
    [:maybe agent-api.tools/IdRef]]
   [:label
    {:optional true :tool/description "`add_action`: what the button says."}
    [:maybe ms/NonBlankString]]
   [:display
    {:optional true
     :tool/description (str "`add_action`: \"button\" (default) shows a button that opens the action's form; "
                            "\"form\" lays the form out on the dashboard.")}
    [:maybe (into [:enum] agent-api.dashboard-write/action-displays)]]
   [:patch
    {:optional true
     :tool/description (str "`patch_dashcard`: settings to merge into the dashcard's `visualization_settings` — "
                            "the chart's settings, `column_settings`, `click_behavior`, a link's target. Layout "
                            "keys (`row`, `col`, `size_x`, `size_y`, `dashboard_tab_id`, `card_id`) are refused: "
                            "`move`, `resize`, and `replace_card` own those.")}
    [:maybe :map]]
   [:tab_id
    {:optional true
     :tool/description "The tab to rename, move, duplicate, or remove: its id, or its name."}
    [:maybe [:or :int ms/NonBlankString]]]
   [:name
    {:optional true
     :tool/description (str "`add_tab` and `rename_tab`: the tab's name. `add_parameter` and `update_parameter`: the "
                            "filter's name, which is what the widget is labelled with.")}
    [:maybe ms/NonBlankString]]
   [:index
    {:optional true
     :tool/description (str "`move_tab`: the tab's new place in the row of tabs. 0 is the first. `move_parameter`: the "
                            "filter's new place in the row of filters at the top of the dashboard.")}
    [:maybe [:int {:min 0}]]]
   [:parameter_id
    {:optional true
     :tool/description (str "The filter to change, move, wire, or remove: its id, or its name. A filter an earlier op "
                            "in this same list added has no id yet, so name it. `get_content` on the dashboard lists "
                            "the filters by id and name, and so does this tool's own response.")}
    [:maybe ms/NonBlankString]]
   [:type
    {:optional true
     :tool/description (str "`add_parameter` and `update_parameter`: what kind of filter it is. \"string/=\", "
                            "\"number/=\", \"number/between\", \"date/all-options\", \"id\", \"boolean/=\", and "
                            "\"temporal-unit\" (which re-groups a chart by day/week/month rather than filtering it) "
                            "are the ones to reach for. The type decides which columns the filter can be wired to: a "
                            "date filter reaches a date column and nothing else. Changing it on a filter that is "
                            "already wired clears the wiring it can no longer carry, and its default.")}
    [:maybe (into [:enum] agent-api.dashboard-write/parameter-types)]]
   [:default
    {:optional true
     :tool/description (str "The value the filter starts with. A `required` filter needs one — the dashboard cannot be "
                            "read without a value, so it has to bring its own.")}
    [:maybe :any]]
   [:required
    {:optional true
     :tool/description "Whether the dashboard refuses to run without a value for this filter. Needs a `default`."}
    [:maybe :boolean]]
   [:isMultiSelect
    {:optional true
     :tool/description "Whether the reader can pick several values at once (default true)."}
    [:maybe :boolean]]
   [:temporal_units
    {:optional true
     :tool/description (str "`type: \"temporal-unit\"`: the groupings the reader may choose between — for example "
                            "[\"day\", \"week\", \"month\"].")}
    [:maybe [:sequential ms/NonBlankString]]]
   [:values_query_type
    {:optional true
     :tool/description (str "How the widget offers its values: \"list\" (pick from all of them), \"search\" (type to "
                            "search), or \"none\" (type the value in).")}
    [:maybe (into [:enum] agent-api.dashboard-write/values-query-types)]]
   [:values_source_type
    {:optional true
     :tool/description (str "Where the values come from: \"static-list\" (a list you give in "
                            "`values_source_config.values`) or \"card\" (a column of a question, named in "
                            "`values_source_config` as `card_id` and `value_field`). Omitted, they come from the "
                            "column the filter is wired to.")}
    [:maybe (into [:enum] agent-api.dashboard-write/values-source-types)]]
   [:values_source_config
    {:optional true
     :tool/description (str "The values themselves — `{values: [...]}` for a static list, or `{card_id, value_field}` "
                            "for a column of a question.")}
    [:maybe :map]]
   [:filteringParameters
    {:optional true
     :tool/description (str "Ids of the filters that narrow this one — a linked filter. With the state filter listed "
                            "here, the city filter offers only the cities in the state that is chosen.")}
    [:maybe [:sequential ms/NonBlankString]]]
   [:target_field
    {:optional true
     :tool/description (str "`wire_parameter`: the column of the card the filter narrows, by its name or its field id. "
                            "This is the one to reach for. `get_content` with `include: [\"fields\"]` on the card "
                            "lists its columns, and a wrong name comes back with the columns the filter can reach.")}
    [:maybe [:or ms/PositiveInt ms/NonBlankString]]]
   [:target_tag
    {:optional true
     :tool/description (str "`wire_parameter`: the `{{tag}}` of the card the filter fills in — a variable or a field "
                            "filter in a SQL question, or a `{{tag}}` written into a text or heading card.")}
    [:maybe ms/NonBlankString]]
   [:target
    {:optional true
     :tool/description (str "`wire_parameter`: the raw mapping target, as `get_content` with `include: [\"layout\"]` "
                            "reports it. The escape hatch — prefer `target_field` and `target_tag`.")}
    [:maybe [:sequential :any]]]
   [:autowire
    {:optional true
     :tool/description (str "`wire_parameter`: also wire every other card on the same tab that has this column, which "
                            "is what makes one filter narrow the whole dashboard. A card without the column is left "
                            "alone.")}
    [:maybe :boolean]]])

(mr/def ::dashboard-write-request
  "Arguments to the `dashboard_write` tool. Only `method` is schema-required; the per-method requirements are
  runtime-enforced with teaching errors."
  [:map
   [:method
    {:tool/description "\"create\" builds a new dashboard; \"update\" changes an existing one."}
    agent-api.tools/MethodField]
   [:id
    {:optional true
     :tool/description (str "The dashboard to change — required for `update`, and never given on `create`. A "
                            "numeric id or a 21-character entity_id.")}
    [:maybe agent-api.tools/IdRef]]
   [:name
    {:optional true :tool/description "The name it is saved under — required for `create`."}
    [:maybe ms/NonBlankString]]
   [:description
    {:optional true :tool/description "What the dashboard is for, in a sentence."}
    [:maybe :string]]
   [:ops
    {:optional true
     :tool/description (str "The changes to make, in order: the cards and tabs of the dashboard. Each op names "
                            "only what it changes — the server holds the rest — so an op list can never delete a "
                            "card it does not mention. An op that fails aborts the whole call naming its index, "
                            "and nothing is written.")}
    [:maybe [:sequential ::dashboard-op]]]
   [:collection_id
    {:optional true
     :tool/description (str "The collection to save it in, or to move it to. A numeric id, a 21-character "
                            "entity_id, or \"root\" for the top level (\"Our analytics\"). Omit it on `create` "
                            "and it is saved to your personal collection.")}
    [:maybe agent-api.tools/CollectionRef]]
   [:collection_position
    {:optional true :tool/description "Pin it in its collection, at this position. 1 is the first pin."}
    [:maybe [:int {:min 1}]]]
   [:width
    {:optional true
     :tool/description "\"fixed\" (default) centers the dashboard; \"full\" lets it fill the browser window."}
    [:maybe [:enum "fixed" "full"]]]
   [:auto_apply_filters
    {:optional true
     :tool/description (str "Whether changing a filter re-runs the cards at once (the default), or waits for the "
                            "reader to hit Apply. Turn it off on a dashboard whose cards are slow.")}
    [:maybe :boolean]]
   [:cache_ttl
    {:optional true :tool/description "How many hours to cache its results for."}
    [:maybe [:int {:min 1}]]]
   [:archived
    {:optional true
     :tool/description (str "`update` only: `true` moves it to the trash — the soft delete, and the only delete "
                            "there is — and `false` restores it.")}
    [:maybe :boolean]]
   [:validate_only
    {:optional true
     :tool/description (str "Compile the ops and return the layout they would produce, without saving anything. "
                            "The dry run, for checking a build before committing to it.")}
    [:maybe :boolean]]])

(api.macros/defendpoint :post "/v2/dashboard-write" :- ::dashboard-write-response
  "Create or update a dashboard — its cards, its tabs, and its layout — through an ordered list of ops.

  The ops compile into the one save the app makes, so an op list either lands whole or does not land: a bad op names
  its index and nothing is written. The server holds the dashboard's current state, so a call names only what it is
  changing and can never delete a card it did not mention."
  {:scope "agent:author:write"
   :tool  {:name  "dashboard_write"
           :title "Create or Update a Dashboard"
           :description
           (str "Build a dashboard in Metabase, or edit one: its cards, its tabs, and how they are laid out.\n"
                "\n"
                "`method: \"create\"` needs a `name`. `method: \"update\"` needs the dashboard's `id`.\n"
                "\n"
                "**Ops.** `ops` is an ordered list of changes, and each op names only what it changes — never the "
                "rest of the dashboard. You do not have to read the dashboard, echo its cards back, or track their "
                "positions: the server holds all of that, and an op list cannot delete a card it does not "
                "mention.\n"
                "\n"
                "Cards: `add_card` (a saved question or model), `add_text`, `add_heading`, `add_link`, "
                "`add_iframe`, `add_action`, `duplicate_card`, `replace_card`, `move`, `resize`, `remove`, "
                "`set_series` (plot several cards on one chart), and `patch_dashcard` (the escape hatch for a "
                "card's *content* — its visualization settings, column settings, click behavior).\n"
                "\n"
                "Tabs: `add_tab`, `rename_tab`, `move_tab`, `duplicate_tab`, `remove_tab` — which deletes the "
                "cards on the tab along with it. `move` with a `tab` moves a card between tabs. Name a tab an "
                "earlier op created by its `name`: it has no id until the call is saved.\n"
                "\n"
                "Filters: `add_parameter` (a `name` and a `type`), `update_parameter`, `remove_parameter`, "
                "`move_parameter` (into the header at an `index`, or onto a card), `wire_parameter`, and "
                "`unwire_parameter`.\n"
                "\n"
                "**A filter does nothing until it is wired.** `add_parameter` makes the widget; `wire_parameter` "
                "connects it to one column of one card — `target_field` names the column, `target_tag` names a "
                "`{{tag}}` in a SQL or text card. Pass `autowire: true` and every other card on the tab that has "
                "that column is wired to it too, which is what makes one filter narrow the whole dashboard. So: "
                "`add_parameter`, then `wire_parameter` with `autowire`, in the same call — naming the filter by "
                "its `name` and the card by its `card_id`, since the dashboard's own ids are minted by the save.\n"
                "\n"
                "The filter's `type` decides what it can reach — a `date/all-options` filter reaches a date "
                "column and nothing else — so pick the type from the column you mean to filter. Removing a "
                "filter takes its wiring with it, and archives any subscription that was sending it; the "
                "response names those.\n"
                "\n"
                "**Position.** Omit `position` and the card lands in the first free slot on its tab, which is "
                "almost always what you want. The grid is 24 columns wide; pass `{row, col}` and `{size_x, "
                "size_y}` to place a card exactly.\n"
                "\n"
                "**All or nothing.** Ops are validated in order. A card you cannot read, a tab that is not there, "
                "a card that runs off the grid — any of them aborts the call, naming the op's index, and nothing "
                "is written. So a call that failed is safe to fix and send again: it cannot double-add the ops "
                "that were fine. `validate_only: true` compiles the ops and shows you the layout they would "
                "produce, without saving.\n"
                "\n"
                "**What it returns** is the dashboard's structure — its tabs, its filters, and one row per card "
                "with its `id`, position, and size. That is exactly what the next op needs, so a build never needs "
                "a read in between.\n"
                "\n"
                "A question saved *inside* a dashboard is `question_write` with a `dashboard_id`, not an op here. "
                "Filters are the other half of this tool; `archived: true` trashes the dashboard.")
           :annotations       {:idempotent? false}
           :structured-output ::dashboard-write-structured-output
           :input-examples
           [{:method "create" :name "Revenue" :collection_id 7
             :ops    [{:op "add_heading" :text "This quarter"}
                      {:op "add_card" :card_id 42}
                      {:op "add_card" :card_id 43 :size {:size_x 12 :size_y 6}}]}
            {:method "update" :id 9
             :ops    [{:op "add_tab" :name "Detail"}
                      {:op "move" :dashcard_id 101 :tab "Detail"}
                      {:op "remove" :dashcard_id 102}]}
            {:method "update" :id 9
             :ops    [{:op "add_parameter" :name "Created at" :type "date/all-options"}
                      {:op "wire_parameter" :parameter_id "Created at" :dashcard_id 101
                       :target_field "CREATED_AT" :autowire true}]}
            {:method "update" :id 9
             :ops    [{:op "patch_dashcard" :dashcard_id 101
                       :patch {:graph.dimensions ["CREATED_AT"] :graph.metrics ["count"]}}]}
            {:method "update" :id 9 :archived true}]}}
  [_route-params
   _query-params
   body :- ::dashboard-write-request]
  (agent-api.dashboard-write/dashboard-write body))

;;; ------------------------------------------------ Export Download -------------------------------------------------

(api.macros/defendpoint :get "/v2/export/:id" :- :any
  "Download the file a `run_saved_question` export generated.

  Carries no `:tool` metadata and so publishes no tool: this is the other end of the `download_url` that tool
  hands back, for the person in the chat to click. The link is not a capability — the request authenticates like
  every other one, and the export resolves for the user who generated it and for nobody else."
  {:scope "agent:query:read"}
  [{:keys [id]} :- [:map [:id ms/NonBlankString]]]
  (let [{:keys [content content_type filename]}
        (api/check-404 (agent-api.exports/read-export api/*current-user-id* id))]
    {:status  200
     :headers {"Content-Type"           content_type
               "Content-Disposition"    (format "attachment; filename=\"%s\"" filename)
               "X-Content-Type-Options" "nosniff"}
     :body    (ByteArrayInputStream. ^bytes content)}))

;;; ---------------------------------------------------- Routes ------------------------------------------------------

(def +auth
  "Agent API authentication middleware. Supports both session-based and stateless JWT authentication."
  agent-api.auth/+auth)

(def +agent-api-enabled
  "Wrap routes so they may only be accessed when the Agent API is enabled."
  agent-api.validation/+agent-api-enabled)

(def ^{:arglists '([request respond raise])} routes
  "`/api/agent/` routes: both tool generations, behind the Agent API's authentication."
  (+auth (handlers/routes (api.macros/ns-handler *ns*)
                          v1-api/routes)))
