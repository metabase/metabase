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
