;; -----------------------------------------------------------------------
;; Tool metadata example: POST /api/card/:id/query
;;
;; How descriptions work
;; ---------------------
;; Three things in the generated MCP tool carry descriptions:
;;
;; 1. Top-level tool description (MCP `description`)
;;    Falls back to the defendpoint docstring. Start with just the docstring
;;    and override :description only when it doesn't convey *when and why*
;;    an LLM should pick this tool. Later we can add a linter requiring
;;    explicit :description on all tools.
;;
;; 2. Input parameter descriptions (MCP `inputSchema` property descriptions)
;; 3. Output field descriptions (MCP `outputSchema` property descriptions)
;;    Both derived from malli schemas. :tool/description on a schema
;;    overrides :description when the base text is too terse or uses
;;    internal jargon an LLM won't know (e.g. "card" vs "saved question").
;;    Fallback chain: :tool/description → :description → generated from
;;    the JSON Schema type (e.g. "An integer", "An array of objects with
;;    keys: name (string), base_type (string)").
;; -----------------------------------------------------------------------

;; -----------------------------------------------------------------------
;; Schema definitions
;;
;; These are the malli schemas that the endpoint references. The tool
;; generation walks these to produce MCP inputSchema and outputSchema.
;; Use :tool/description on fields to override :description for LLM-facing
;; text; both flow into the generated JSON Schema `description` fields.
;; -----------------------------------------------------------------------

(def ParameterOverride
  [:map
   [:type   [:string {:tool/description "Parameter type, e.g. 'date/single', 'string/=', 'number/='"}]]
   [:target [:any    {:tool/description "Target template tag or dimension the parameter binds to"}]]
   [:value  [:any    {:tool/description "The value to use for this parameter"}]]])

(def RunCardParams
  [:map
   [:id         [:int {:description      "Card ID"
                       :tool/description "The ID of the saved question to run"}]]
   [:parameters {:optional true}
    [:sequential
     {:description      "Parameter overrides"
      :tool/description "Optional filter/parameter values to override the
                          question's defaults. Each entry needs :type,
                          :target, and :value."}
     ParameterOverride]]])

(def QueryResult
  [:map
   [:data [:map {:tool/description "The query result payload"}
           [:rows [:sequential [:sequential :any]]
            {:tool/description "Result rows, each a vector of values in column order"}]
           [:cols [:sequential [:map
                                [:name :string]
                                [:base_type :string]]]
            {:tool/description "Column metadata: name and type for each column"}]]]
   [:row_count {:optional true} :int]
   [:status [:enum "completed" "failed"]]])

;; -----------------------------------------------------------------------
;; Endpoint definition
;; -----------------------------------------------------------------------

(api/defendpoint POST "/:id/query"
  "Execute a saved question (card) and return results."
  ;; The :tool key opts this endpoint into tool exposure.
  ;; If :tool is absent, the endpoint is not exposed as a tool.
  ;; Use :tool true to expose with all defaults, or a map to override.
  {:tool
   {;; OPTIONAL — override the auto-generated tool name.
    ;; Fallback: derived from HTTP method + route namespace + route path.
    ;;   POST /api/card/:id/query → "run-card-query"
    ;;   GET  /api/card/:id       → "get-card"
    ;;   GET  /api/card           → "list-cards"
    ;; Path params like :id are stripped. Method is prefixed. Namespace comes from
    ;; the `define-routes` context. This works well ~80% of the time.
    ;; Override when the result is misleading (e.g. this is really "create a question").
    ;; → MCP field: `name`
    :name "run-saved-question"

    ;; OPTIONAL — override the defendpoint docstring for LLM-facing tool selection.
    ;; Fallback: the docstring above ("Execute a saved question (card) and return results.")
    ;; Override when the docstring doesn't help an LLM decide *when* to pick this tool.
    ;; Start by relying on the docstring; add explicit :description later as needed.
    ;; → MCP field: `description`
    :description
    "Run a saved question (query) by its ID, optionally overriding its filter parameters.
     Use this when the user wants to see results from an existing question, possibly
     with different filter values than the defaults. Returns row data."

    ;; OPTIONAL — MCP tool annotations for agent safety/planning decisions.
    ;; These map directly to MCP ToolAnnotations (2025-11-25 spec):
    ;;   :read-only?   → readOnlyHint   (default: false)
    ;;   :destructive? → destructiveHint (default: true, only meaningful when not read-only)
    ;;   :idempotent?  → idempotentHint  (default: false, only meaningful when not read-only)
    ;;   :open-world?  → openWorldHint   (default: true)
    ;; We infer defaults from the HTTP method before falling back to MCP defaults:
    ;;   GET/HEAD   → {:read-only? true,  :idempotent? true}
    ;;   PUT        → {:destructive? false, :idempotent? true}
    ;;   DELETE     → {:destructive? true,  :idempotent? true}
    ;;   POST/PATCH → MCP defaults (read-only false, destructive true, idempotent false)
    ;; Individual sub-keys can be overridden without restating the rest.
    ;; Override here because this POST is actually read-only and idempotent.
    ;; → MCP field: `annotations`
    :annotations
    {:read-only?  true
     :idempotent? true}

    ;; OPTIONAL — premium feature gates. Metabase-specific, not an MCP field.
    ;; If not declared, the tool is shown to all users who have endpoint-level
    ;; permissions (via scope). Declaring here lets us hide the tool from the
    ;; tool list entirely when the feature is absent, rather than letting the
    ;; LLM call it and get a 402.
    ;;
    ;; NOTE: this is not a security boundary — we still rely on middleware or
    ;; the handler itself to enforce the feature check. It would be good to
    ;; DRY this up: define it in top-level metadata, enforce via middleware,
    ;; and migrate older endpoints over time.
    :feature-flags [:sandboxes]

    ;; OPTIONAL — tells agents to ask for user confirmation before calling.
    ;; Metabase-specific, not an MCP field.
    ;; Fallback: derived from annotations.
    ;;   destructive? true  → requires-confirmation? true
    ;;   read-only? true    → requires-confirmation? false
    ;;   else               → requires-confirmation? false
    ;; Override for expensive/slow read-only operations, or safe writes that
    ;; don't need a speed bump.
    ;; Here the fallback gives us false (read-only), which is correct.
    :requires-confirmation? false

    ;; OPTIONAL — grouping for filtering which tools an agent sees.
    ;; Metabase-specific, not an MCP field.
    ;; Fallback: inferred from route namespace.
    ;;   /api/card/*       → :questions
    ;;   /api/dashboard/*  → :dashboards
    ;;   /api/database/*   → :databases
    ;;   /api/table/*      → :tables
    ;;   /api/collection/* → :collections
    ;; Override when the route doesn't reflect the logical domain (e.g. an
    ;; endpoint under /api/dataset that's really about questions).
    ;; Here the fallback gives us :questions from /api/card/*, which is correct.
    :category :questions

    ;; OPTIONAL — MCP execution hints for long-running operations.
    ;; Maps to MCP `execution.taskSupport` (2025-11-25 spec):
    ;;   :forbidden — tool does not support task-augmented execution (default)
    ;;   :optional  — tool may be called with or without task support
    ;;   :required  — tool requires task-augmented execution
    ;; Fallback: :forbidden (MCP default). Most endpoints are fast enough
    ;; that this isn't needed. Use :optional or :required for endpoints that
    ;; may take a long time (e.g. running large queries, exports, syncs).
    ;; → MCP field: `execution.taskSupport`
    :task-support :optional

    ;; OPTIONAL — example invocations. Metabase-specific, not an MCP field.
    ;; No fallback, can't be inferred.
    ;; High value for LLM accuracy, especially for complex parameter shapes.
    ;; Prioritize adding these for tools with nested/polymorphic params.
    :examples
    [{:description "Run question 42 with default parameters"
      :params      {:id 42}}
     {:description "Run question 42 with a date filter override"
      :params      {:id         42
                    :parameters [{:type   "date/single"
                                  :target [:variable [:template-tag "start_date"]]
                                  :value  "2024-01-01"}]}}]}

   ;; Input params and response schemas are defined separately (see below)
   ;; and referenced by the endpoint. :tool/description on schema fields
   ;; feeds into the generated MCP inputSchema/outputSchema descriptions.
   })

;; -----------------------------------------------------------------------
;; For comparison: a simple endpoint where inference handles everything.
;; The docstring is good enough for :description, so we just provide :tool {}.
;; -----------------------------------------------------------------------

(api/defendpoint GET "/:id"
  "Retrieve a saved question's definition, including its query, visualization
   settings, and metadata. Use this to inspect how a question is configured,
   not to run it."
  {:tool true}
  ;; name:                  "get-card" (inferred)
  ;; description:           from docstring above (inferred)
  ;; annotations:           {:read-only? true, :idempotent? true} (inferred from GET)
  ;; requires-confirmation: false (inferred from read-only)
  ;; category:              :questions (inferred from /api/card)
  )

;; -----------------------------------------------------------------------
;; Generated MCP tool definition (2025-11-25 spec)
;;
;; This is what the above POST endpoint produces after inference and
;; schema translation. This is the JSON that gets served to MCP clients.
;; -----------------------------------------------------------------------
{"name"         "run-saved-question"
 "title"        "Run saved question"               ; derived from name
 "description"  "Run a saved question (query) by its ID, optionally overriding
                 its filter parameters. Use this when the user wants to see
                 results from an existing question, possibly with different
                 filter values than the defaults. Returns row data."

 "inputSchema"
 {"type"       "object"
  "properties" {"id"         {"type"        "integer"
                              "description" "The ID of the saved question to run"}
                "parameters" {"type"        "array"
                              "description" "Optional filter/parameter values to override
                                             the question's defaults. Each entry needs
                                             type, target, and value."
                              "items"       {"type"       "object"
                                             "properties" {"type"   {"type"        "string"
                                                                     "description" "Parameter type, e.g. 'date/single', 'string/=', 'number/='"}
                                                           "target" {"description" "Target template tag or dimension the parameter binds to"}
                                                           "value"  {"description" "The value to use for this parameter"}}}}}
  "required"   ["id"]}

 "outputSchema"
 {"type"       "object"
  "properties" {"data"      {"type"        "object"
                             "description" "The query result payload"
                             "properties"  {"rows" {"type"        "array"
                                                    "description" "Result rows, each a vector of values in column order"
                                                    "items"       {"type" "array"}}
                                            "cols" {"type"        "array"
                                                    "description" "Column metadata: name and type for each column"
                                                    "items"       {"type"       "object"
                                                                   "properties" {"name"      {"type" "string"}
                                                                                 "base_type" {"type" "string"}}}}}}
                "row_count" {"type" "integer"}
                "status"    {"type" "string"
                             "enum" ["completed" "failed"]}}}

 "execution"
 {"taskSupport" "optional"}       ; query may take a while

 "annotations"
 {"readOnlyHint"    true    ; overridden — POST is normally not read-only
  "destructiveHint" false   ; meaningless when read-only, but set false to be safe
  "idempotentHint"  true    ; overridden
  "openWorldHint"   true}   ; inferred default

 ;; Metabase-specific fields, used internally but not sent to MCP clients:
 ;; feature-flags          [:sandboxes]
 ;; requires-confirmation? false (derived from read-only)
 ;; category               :questions (derived from /api/card)
 ;; examples               [{...} {...}]
 }

