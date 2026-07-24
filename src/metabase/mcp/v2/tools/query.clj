(ns metabase.mcp.v2.tools.query
  "The v2 MCP query-execution tools.

   `execute_query`: one surface where v1 shipped three (`construct_query` + `query` +
   `execute_query`). A fresh portable MBQL 5 `query` runs the representations pipeline
   (validate → repair → resolve against database metadata, with teaching errors); a
   `query_handle` or `cursor` resolves through the handle store with the fresh-query guards
   re-run. Every call mints a handle — what the agent later saves or visualizes through it is
   byte-identical to what ran — and a truncated MBQL page mints a keyset `next_cursor` so the
   model continues with one opaque string, never a hand-written keyset filter.

   `execute_sql`: raw SQL in the same response envelope, gated by the `mcp-execute-sql-enabled`
   kill switch and native-query permission. It also mints a handle on every call (including
   `validate_only`, which replaces v1's `construct_native_query`), so saving or visualizing SQL
   needs no separate construct step. Never a cursor: arbitrary SQL can't be rewritten with a
   server-side keyset predicate — the server can't know whether the SQL has a total order. The
   caller does, so truncation steers it to page the SQL itself with a keyset filter, or to narrow
   the query / raise `row_limit`.

   `run_saved_question`: a stored card by numeric id or entity_id, with parameters resolved
   server-side against the card's own parameter list — the stored target and type always
   apply, and a client-supplied target is ignored, so a caller can set a filter's value but
   never repoint it at another field. No handle and no cursor: a truncated result steers the
   caller to narrow through the card's own parameters or to raise `row_limit`."
  (:require
   [clojure.string :as str]
   [medley.core :as m]
   [metabase.agent-api.query-guards :as query-guards]
   [metabase.agent-api.settings :as agent-api.settings]
   [metabase.api.common :as api]
   [metabase.lib-be.core :as lib-be]
   [metabase.lib.core :as lib]
   [metabase.mcp.v2.common :as common]
   [metabase.mcp.v2.query :as v2.query]
   [metabase.mcp.v2.registry :as registry]
   [metabase.metabot.scope :as metabot.scope]
   [metabase.metabot.tools.construct :as metabot.construct]
   [metabase.models.interface :as mi]
   [metabase.query-processor.card :as qp.card]
   [metabase.query-processor.core :as qp]
   [metabase.query-processor.middleware.permissions :as qp.perms]
   [metabase.util :as u]
   [metabase.util.json :as json]))

(set! *warn-on-reflection* true)

(def ^:private default-row-limit 100)

(def ^:private max-row-limit 2000)

;;; ------------------------------------------------ Query inputs --------------------------------------------------

(defn- query-input
  "Which of the three mutually exclusive query inputs was supplied. Runtime-enforced rather
   than schema `oneOf` — strict MCP clients bar `oneOf` in tool input schemas."
  [{:keys [query query_handle cursor]}]
  (let [provided (cond-> []
                   query        (conj :query)
                   query_handle (conj :query_handle)
                   cursor       (conj :cursor))]
    (when-not (= 1 (count provided))
      (common/throw-teaching-error
       (str "Pass exactly one of query | query_handle | cursor: `query` for a fresh portable "
            "MBQL query, `query_handle` to re-run a stored query, `cursor` to continue a "
            "truncated result.")))
    (first provided)))

(defn- resolve-input
  "Resolve the supplied input to `{:query <serialized MBQL map> :prompt <string-or-nil>}`.

   The fresh path rejects native stages up front, then runs the representations pipeline
   (validate → repair → resolve; permission-checked, teaching errors on unknown names) and
   serializes the resolved query. The handle and cursor paths resolve through the handle store,
   which re-runs the native/shape/permission guards — a stored handle never grants access the
   caller has since lost. A cursor is an ordinary handle whose stored query already embeds the
   next-page keyset boundary, so the two resolve identically."
  [input {:keys [query query_handle cursor prompt]} session-id]
  (case input
    :query
    (do
      (query-guards/reject-native-query! query)
      {:query  (-> (metabot.construct/execute-representations-query query)
                   (get-in [:structured-output :query])
                   lib/prepare-for-serialization)
       :prompt prompt})

    (:query_handle :cursor)
    (let [{stored :query stored-prompt :prompt}
          (common/resolve-query-handle! session-id api/*current-user-id* (or query_handle cursor))]
      ;; Prompts ride handle chains: a cursor page minted without an explicit `prompt` keeps
      ;; the original request for the visualization feedback flow.
      {:query stored :prompt (or prompt stored-prompt)})))

;;; ------------------------------------------------- Execution ----------------------------------------------------

(defn- execute!
  "Run a serialized MBQL query through the QP with the standard agent userland preparation,
   capping this call's rows at `row-limit` (within the backend's 2000/10000 userland
   ceilings). Returns the QP result; surfaces a failed run as a teaching error."
  [serialized-query row-limit]
  (let [result (qp/process-query
                (-> serialized-query
                    (update-in [:middleware :js-int-to-string?] (fnil identity true))
                    qp/userland-query-with-default-constraints
                    (assoc :constraints {:max-results           row-limit
                                         :max-results-bare-rows row-limit})
                    (update :info merge {:executed-by api/*current-user-id*
                                         :context     :agent})))]
    (when-not (= (:status result) :completed)
      (common/throw-teaching-error (str "Query failed: " (or (:error result) "unknown error"))))
    result))

(defn- execute-page!
  "Run `serialized-query` for one page of at most `row-limit` rows. Fetches one row past the
   limit so truncation is *observed* rather than inferred from a full page: a result that fills
   the page exactly is complete, and is reported that way. Returns
   `{:cols :rows :returned :truncated?}` with the probe row already dropped, so `rows` is the
   page and `(last rows)` is a real page boundary."
  [serialized-query row-limit]
  (let [result     (execute! serialized-query (inc row-limit))
        all-rows   (vec (get-in result [:data :rows]))
        truncated? (> (count all-rows) row-limit)
        rows       (cond-> all-rows truncated? (subvec 0 row-limit))]
    {:cols       (get-in result [:data :cols])
     :rows       rows
     :returned   (count rows)
     :truncated? truncated?}))

(defn- last-stage
  [serialized-query]
  (peek (vec (:stages serialized-query))))

(defn- aggregated-last-stage?
  [serialized-query]
  (let [stage (last-stage serialized-query)]
    (boolean (or (seq (:aggregation stage))
                 (seq (:breakout stage))))))

(defn- remaining-rows
  "Rows still owed by the query's own last-stage limit once `returned` of them have been served,
   or nil when the query carries no limit of its own. That limit bounds the whole result set, so
   paging has to spend it down across pages rather than reapply it to each one."
  [serialized-query returned]
  (when-let [limit (:limit (last-stage serialized-query))]
    (- limit returned)))

(defn- cursor-query
  "The query the next-page cursor stores: the page's own query carrying `remaining` — the rows
   still owed by the query's own limit — as its last-stage limit, so a `limit 500` query pages
   to row 500 and stops there. A query that set no limit of its own stores none either: a limit
   at this position reads as the caller's whole-result budget, so embedding the page size there
   would make the next page look complete the moment it filled, and the chain would stop one
   page in. Page size is `row_limit`'s job, and a cursor call takes it like any other. An
   aggregated last stage is passed through unchanged — an embedded limit there would cut the
   base set before the keyset order can pin it down, and
   [[metabase.mcp.v2.query/next-page-cursor!]] would rightly refuse to mint."
  [serialized-query remaining]
  (if (or (nil? remaining) (aggregated-last-stage? serialized-query))
    serialized-query
    (assoc-in serialized-query [:stages (dec (count (:stages serialized-query))) :limit] remaining)))

;;; ------------------------------------------------- Response -----------------------------------------------------

(defn- response-cols
  [cols]
  (mapv (fn [{:keys [name base_type effective_type display_name]}]
          (cond-> {:name         name
                   :base_type    (u/qualified-name base_type)
                   :display_name display_name}
            effective_type (assoc :effective_type (u/qualified-name effective_type))))
        cols))

(defn- steering-line
  [returned next-cursor]
  (if next-cursor
    (format "returned %d rows, more available — continue with `cursor`, or narrow the query (filter/aggregate)"
            returned)
    (format "returned %d rows, more available — narrow the query (filter/aggregate), or raise `row_limit` (max %d)"
            returned max-row-limit)))

(defn- mint-handle!
  [session-id serialized-query prompt]
  (common/mint-query-handle! session-id
                             api/*current-user-id*
                             (common/encode-serialized-query serialized-query)
                             prompt))

(defn- validate-only-response!
  [session-id serialized-query prompt]
  (let [counts {:query_handle (mint-handle! session-id serialized-query prompt)
                :returned     0
                :truncated    false}]
    (common/success-content
     (str (json/encode counts)
          "\nQuery validated, not executed — execute or save it later by passing this query_handle."))))

(defn- execute-response!
  [session-id serialized-query prompt row-limit]
  (let [{:keys [cols rows returned truncated?]} (execute-page! serialized-query row-limit)
        ;; `truncated?` is observed, so the query's own limit needs no separate accounting here:
        ;; a `limit 3` query can never yield a 4th row to trip the probe. `remaining` is still
        ;; needed to spend that limit down across cursor pages.
        remaining   (remaining-rows serialized-query returned)
        handle      (mint-handle! session-id serialized-query prompt)
        next-cursor (when truncated?
                      (v2.query/next-page-cursor! session-id
                                                  api/*current-user-id*
                                                  (cursor-query serialized-query remaining)
                                                  (last rows)
                                                  {:result-cols cols :prompt prompt}))
        counts      (cond-> {:query_handle handle
                             :returned     returned
                             :truncated    truncated?}
                      next-cursor (assoc :next_cursor next-cursor))
        payload     (assoc counts
                           :cols (response-cols cols)
                           :rows rows)]
    (common/success-content
     (cond-> (json/encode payload)
       truncated? (str "\n" (steering-line returned next-cursor))))))

;;; -------------------------------------------------- The tool ----------------------------------------------------

(def ^:private execute-query-args-schema
  [:map {:closed true}
   [:query {:optional true}
    [:maybe [:map {:description "A fresh query in the portable MBQL 5 dialect (see the tool description): named refs, not numeric ids, never base64. Exactly one of query | query_handle | cursor."}]]]
   [:query_handle {:optional true}
    [:maybe [:string {:min 1 :description "A query_handle from a previous call — re-validates and re-runs the exact stored query. Exactly one of query | query_handle | cursor."}]]]
   [:cursor {:optional true}
    [:maybe [:string {:min 1 :description "The next_cursor from a previous truncated response — fetches the next page. Pass it alone. Exactly one of query | query_handle | cursor."}]]]
   [:prompt {:optional true}
    [:maybe [:string {:min 1 :max 10000 :description "The user's original request, stored with the minted query_handle so visualize_query can surface it in the feedback flow."}]]]
   [:validate_only {:optional true}
    [:maybe [:boolean {:description "true validates against schema + database metadata and mints a query_handle without executing (default false)."}]]]
   [:row_limit {:optional true}
    [:maybe [:int {:min 1 :max max-row-limit :description "Maximum rows to return in this call (default 100, max 2000)."}]]]])

(registry/deftool execute-query
  "Validate and execute an MBQL query, returning rows plus a query_handle. Pass exactly one of: query (a fresh portable MBQL 5 query), query_handle (re-run a stored query), or cursor (continue a truncated result). Every call returns a query_handle — what you later save or visualize through it is exactly the query that ran. validate_only: true checks the query against schema + database metadata and mints a handle without executing. Results are cols + rows with returned/truncated counts; when a response carries next_cursor, fetch the next page by calling again with cursor (pass row_limit alongside it to keep the same page size), otherwise narrow the query (filter/aggregate) or raise row_limit (max 2000).

Query dialect (portable MBQL 5, JSON): discover exact database/schema/table/column NAMES first (search, browse_data) — never invent identifiers, never use numeric ids, never base64. Top level: {\"lib/type\": \"mbql/query\", \"stages\": [...]}. Each stage has \"lib/type\": \"mbql.stage/mbql\" plus either source-table: [\"<db>\", \"<schema-or-null>\", \"<table>\"] or source-card: \"<entity_id>\" on the FIRST stage only; later stages implicitly read the previous stage's output. Every clause is [\"op\", {}, ...args] with a MANDATORY options map at position 1. Field refs are [\"field\", {}, [\"<db>\", \"<schema-or-null>\", \"<table>\", \"<column>\"]] — a 4-segment portable name array — or a bare column-name string for a previous stage's output ([\"field\", {}, \"count\"]). Per-stage clause keys: filters, aggregation, breakout, expressions, fields, joins, order-by, limit. Minimal example (order count by month): {\"lib/type\": \"mbql/query\", \"stages\": [{\"lib/type\": \"mbql.stage/mbql\", \"source-table\": [\"Sample Database\", \"PUBLIC\", \"ORDERS\"], \"aggregation\": [[\"count\", {}]], \"breakout\": [[\"field\", {\"temporal-unit\": \"month\"}, [\"Sample Database\", \"PUBLIC\", \"ORDERS\", \"CREATED_AT\"]]]}]}. The full grammar (operators, joins, expressions, multi-stage queries) is available as an MCP resource. Native SQL is rejected at any depth — use execute_sql for raw SQL."
  {:name        "execute_query"
   :scope       metabot.scope/agent-query-execute
   :annotations {:readOnlyHint true}
   :args        execute-query-args-schema}
  [{:keys [validate_only row_limit] :as args} {:keys [session-id]}]
  (let [input (query-input args)
        {resolved :query prompt :prompt} (resolve-input input args session-id)
        ;; The total order goes on before the query runs, not when the cursor is minted: a page
        ;; is continuable only if it was served in the order the keyset seeks past. Handles are
        ;; minted from this query, so what a later call re-runs is what ran here.
        serialized-query (v2.query/with-total-order resolved)]
    (if (true? validate_only)
      (validate-only-response! session-id serialized-query prompt)
      (execute-response! session-id serialized-query prompt (or row_limit default-row-limit)))))

;;; ------------------------------------------------ execute_sql ---------------------------------------------------

(defn- check-execute-sql-gates!
  "The execute_sql pre-checks, in order: the `mcp-execute-sql-enabled` kill switch, the
   collapsed not-found for a database the caller can't see (identical for \"doesn't exist\" and
   \"exists but unreadable\", so the response never forms an existence oracle), then native-query
   permission. The permission error is only reachable for a database the caller can already
   browse — native permission implies `can-read?` — so its distinct message discloses nothing.
   All three run on the execute AND `validate_only` paths — a handle minted without them would
   make `validate_only` a kill-switch bypass and a native-permission oracle. Running them on
   `validate_only` is a deliberate tightening over v1's `construct_native_query`, which only
   read-checked the database. They run at the tool layer (the QP permissions middleware
   re-checks inside `process-query`) so a refusal short-circuits before any query machinery
   spins up."
  [database-id]
  (when-not (agent-api.settings/mcp-execute-sql-enabled)
    (throw (ex-info (str "execute_sql is disabled on this instance — an admin can re-enable it "
                         "with the mcp-execute-sql-enabled setting.")
                    {:status-code 403})))
  (when-not (mi/can-read? :model/Database database-id)
    (common/throw-not-found :model/Database database-id))
  (when-not (qp.perms/current-user-has-adhoc-native-query-perms? {:database database-id})
    (throw (ex-info "You do not have permission to run native queries against this database."
                    {:status-code 403 :database_id database-id}))))

(defn- value->tag-type
  "The template-tag (and parameter) type for a supplied binding value, from its JSON type. The
   tag type drives the QP's value parsing, so a number value must flip the extracted tag's
   default `:text` to `:number` to bind as a numeric prepared-statement parameter."
  [value]
  (cond
    (number? value)  :number
    (boolean? value) :boolean
    :else            :text))

(defn- bind-template-tag-values
  "Bind `template-tag-values` into `query` (a live lib native query whose `{{tag}}` occurrences
   are already extracted as `:text` tag declarations). Returns
   `{:query <query with retyped tags> :parameters <parameter list>}` — the parameters ride
   outside the query because [[metabase.lib.core/prepare-for-serialization]] strips
   `:parameters` at every level as runtime-only; the caller re-attaches them top-level after
   serializing, where the QP's parameter middleware picks them up and compiles them to
   driver-level prepared-statement bind params. A name with no matching `{{tag}}` in the SQL
   is a teaching error, as is naming a snippet or card-reference tag — those splice
   server-side SQL text, never caller values."
  [query template-tag-values]
  (let [tags     (lib/template-tags query)
        by-name  (m/index-by :name tags)
        bindings (mapv (fn [[k value]]
                         (let [tag-name (u/qualified-name k)
                               {tag-type :type :as tag} (get by-name tag-name)]
                           (cond
                             (nil? tag)
                             (common/throw-teaching-error
                              (format "No {{%s}} template tag in the SQL — template_tag_values keys must name a {{tag}} placeholder that appears in sql. Tags found: %s."
                                      tag-name
                                      (if-let [names (seq (map :name tags))]
                                        (str/join ", " names)
                                        "none")))

                             (contains? #{:card :snippet} tag-type)
                             (common/throw-teaching-error
                              (format "{{%s}} is a %s-reference tag — it splices server-side SQL text and cannot be populated through template_tag_values, which binds only plain {{tag}} variables."
                                      tag-name (name tag-type)))

                             :else
                             {:tag (assoc tag :type (value->tag-type value)) :value value})))
                       template-tag-values)]
    {:query      (lib/with-template-tags query (mapv :tag bindings))
     :parameters (mapv (fn [{:keys [tag value]}]
                         {:type   (:type tag)
                          :target [:variable [:template-tag (:name tag)]]
                          :value  value})
                       bindings)}))

(defn- sql-steering-line
  [returned]
  ;; The keyset hint is execute_sql's alone. The MBQL dead end it mirrors is the fan-out join,
  ;; where a keyset is unsound — that is why that path refuses to mint a cursor — so suggesting
  ;; one there would hand back the gapped pagination the refusal exists to prevent. Here the
  ;; caller wrote the SQL and knows its key, which is the information the server lacks.
  (format (str "returned %d rows, more available — narrow the SQL (add filters/aggregation), "
               "raise `row_limit` (max %d), or page with `ORDER BY <unique key>` + "
               "`WHERE <key> > <last value returned>`")
          returned max-row-limit))

(defn- validate-sql-response!
  [session-id serialized-query prompt]
  (let [counts {:query_handle (mint-handle! session-id serialized-query prompt)
                :returned     0
                :truncated    false}]
    (common/success-content
     (str (json/encode counts)
          "\nSQL accepted, not executed — template tags and permissions were checked; the SQL text itself was not validated. Execute, save, or visualize it later by passing this query_handle."))))

(defn- execute-sql-response!
  [session-id serialized-query prompt row-limit]
  (let [;; The probe row matters more here than on the MBQL path: with no cursor to page, a
        ;; complete result mis-reported as truncated would steer the agent to rewrite SQL that
        ;; was already right, and nothing downstream could correct it.
        {:keys [cols rows returned truncated?]} (execute-page! serialized-query row-limit)
        counts     {:query_handle (mint-handle! session-id serialized-query prompt)
                    :returned     returned
                    :truncated    truncated?}
        payload    (assoc counts
                          :cols (response-cols cols)
                          :rows rows)]
    (common/success-content
     (cond-> (json/encode payload)
       truncated? (str "\n" (sql-steering-line returned))))))

(def ^:private execute-sql-args-schema
  [:map {:closed true}
   [:database_id
    [:int {:min 1 :description "Numeric id of the database to run the SQL against. Requires native-query permission on it."}]]
   [:sql
    [:string {:min 1 :description "The raw SQL text, run verbatim against the database. Put caller-supplied values behind {{tag}} placeholders bound via template_tag_values — never splice them into this string."}]]
   [:template_tag_values {:optional true}
    [:maybe [:map-of {:description "Values for the {{tag}} placeholders in sql, keyed by tag name. Each value binds as a driver-level prepared-statement parameter (injection-safe): strings bind as text, numbers as numbers. Snippet ({{snippet: …}}) and card-reference ({{#123}}) tags cannot be populated here."}
             ;; No date case: a date value arrives as a JSON string and binds as `:text`, which
             ;; the warehouse coerces. A `:date` tag type would change the QP's parsing, so it
             ;; needs an explicit caller signal rather than a guess at the string's shape.
             :keyword [:or :string number? :boolean]]]]
   [:prompt {:optional true}
    [:maybe [:string {:min 1 :max 10000 :description "The user's original request, stored with the minted query_handle so visualize_query can surface it in the feedback flow."}]]]
   [:validate_only {:optional true}
    [:maybe [:boolean {:description "true mints a query_handle without executing — template tags and permissions are checked, the SQL text itself is not (default false)."}]]]
   [:row_limit {:optional true}
    [:maybe [:int {:min 1 :max max-row-limit :description "Maximum rows to return in this call (default 100, max 2000)."}]]]])

(registry/deftool execute-sql
  "Execute a raw SQL string against a database, returning rows plus a query_handle. Requires native-query permission on the target database and the instance-level mcp-execute-sql-enabled setting — both enforced even with validate_only: true. Prefer execute_query for anything MBQL can express. The sql string runs verbatim against the warehouse, so it is the injection surface — never splice caller-supplied or user-supplied values into it. Put values behind {{tag}} placeholders and pass them in template_tag_values instead: they bind as driver-level prepared-statement parameters, injection-safe for the values. {{snippet: …}} and {{#123}} card-reference tags splice server-side SQL text and can never be populated through template_tag_values. validate_only: true mints a query_handle without executing (template tags and permissions checked; the SQL text itself is not validated) — use it to stage SQL for saving or visualizing without pulling rows into context. Every call returns a query_handle accepted by question_write and visualize_query; execute_query is MBQL-only and rejects it. Results are cols + rows with returned/truncated counts. No cursor pagination for SQL: the server cannot page arbitrary SQL soundly, because it cannot know whether your query has a total order. You can, so page it yourself — re-run with ORDER BY on a unique key and a WHERE <key> > <last value returned> filter, which is exact where an offset would silently repeat or skip rows. Otherwise narrow the SQL (add filters/aggregation) or raise row_limit (max 2000)."
  ;; No `:readOnlyHint` — unlike execute_query, arbitrary SQL can write. MCP's defaults for an
  ;; unannotated tool (not read-only, possibly destructive) are the honest ones here.
  {:name  "execute_sql"
   :scope metabot.scope/agent-sql-execute
   :args  execute-sql-args-schema}
  [{:keys [database_id sql template_tag_values prompt validate_only row_limit]} {:keys [session-id]}]
  (check-execute-sql-gates! database_id)
  (let [mp    (lib-be/application-database-metadata-provider database_id)
        query (lib/native-query mp sql)
        {:keys [query parameters]} (if (seq template_tag_values)
                                     (bind-template-tag-values query template_tag_values)
                                     {:query query})
        ;; Re-attached after serialization (which strips `:parameters` as runtime-only) so the
        ;; execution and the minted handle both carry the bound values: what the agent later
        ;; visualizes or re-runs through the handle is exactly what ran here.
        ;;
        ;; This makes the stored query deliberately wider than the app-DB shape —
        ;; [[metabase.lib.schema]]'s serialize-query strips `:parameters` because it "doesn't get
        ;; saved along with the query in the app DB". Re-run and visualize want it; a consumer
        ;; that saves the handle as a card must lift these into the card's own `:parameters` (or
        ;; template-tag `:default`s) rather than storing them inside `dataset_query`.
        serialized (cond-> (lib/prepare-for-serialization query)
                     (seq parameters) (assoc :parameters parameters))]
    (if (true? validate_only)
      (validate-sql-response! session-id serialized prompt)
      (execute-sql-response! session-id serialized prompt (or row_limit default-row-limit)))))

;;; --------------------------------------------- run_saved_question -----------------------------------------------

(defn- card-parameter-label
  [{:keys [id slug]}]
  (if slug
    (format "%s (slug %s)" (pr-str id) (pr-str slug))
    (pr-str id)))

(defn- throw-unknown-parameter
  [card-params requested]
  (common/throw-teaching-error
   (if (seq card-params)
     (format "Unknown parameter %s — pass one of this card's parameter ids or slugs: %s."
             (pr-str requested)
             (str/join ", " (map card-parameter-label card-params)))
     (format "Unknown parameter %s — this card has no parameters." (pr-str requested)))))

(defn- check-parameter-value!
  "Reject a value whose JSON type can't satisfy the parameter's stored type, as a teaching
   error naming the expectation rather than an opaque QP substitution failure. Multi-value
   parameters arrive as arrays; each element is checked."
  [{param-type :type :keys [id slug]} value]
  (let [family   (or (namespace param-type) (name param-type))
        expected (case family
                   "number"                 "a number"
                   "boolean"                "a boolean"
                   ("date" "temporal-unit") "a string"
                   "a string, number, or boolean")]
    (doseq [v (if (sequential? value) value [value])]
      (let [ok? (case family
                  "number"                 (or (number? v)
                                               (and (string? v) (re-matches #"-?\d+(\.\d+)?([eE][+-]?\d+)?" v)))
                  "boolean"                (or (boolean? v) (contains? #{"true" "false"} v))
                  ("date" "temporal-unit") (string? v)
                  (or (string? v) (number? v) (boolean? v)))]
        (when-not ok?
          (common/throw-teaching-error
           (format "Invalid value %s for parameter %s of type %s — expected %s."
                   (pr-str v) (pr-str (or slug id)) (u/qualified-name param-type) expected)))))))

(defn- resolve-card-parameters
  "Resolve each caller-supplied `{id|slug, value}` against the card's own parameter list (its
   declared parameters merged with the query's template-tag parameters), returning bare
   `{:id :value}` entries. Every `:id` resolves against the same
   [[qp.card/combined-parameters-and-template-tags]] set the QP enriches from, so an accepted
   id is always one the card itself declares; an unknown id is a teaching error here rather
   than a downstream QP failure.

   Forwarding value-only — never the caller's `:type` or `:target` — is the load-bearing
   security property, and what lets [[run-card!]] enable arbitrary-MBQL parameters:
   [[qp.card/process-query-for-card]] fills type and target back in from the card's own
   declaration, so a caller can set a declared parameter's value but can never point it at a
   different field. This covers both native template-tag parameters and a saved question's
   declared filter-widget (MBQL dimension) parameters with one rule."
  [card parameters]
  (let [card-params (qp.card/combined-parameters-and-template-tags card)]
    (mapv (fn [{:keys [id slug value]}]
            (let [requested (or id slug)
                  _         (when (nil? requested)
                              (common/throw-teaching-error
                               "Each parameter needs an `id` — the parameter's id or slug — and a `value`."))
                  stored    (or (m/find-first #(= (:id %) requested) card-params)
                                (m/find-first #(= (:slug %) requested) card-params)
                                (throw-unknown-parameter card-params requested))]
              (check-parameter-value! stored value)
              {:id (:id stored) :value value}))
          parameters)))

(defn- run-card!
  "Run the saved card through [[qp.card/process-query-for-card]] — the same domain entry the
   REST card-query endpoint uses, so the read check, sandboxing, and impersonation all apply —
   with `row-limit` injected as the userland constraints. Returns the QP result; surfaces a
   failed run as a teaching error.

   Binds [[qp.card/*allow-arbitrary-mbql-parameters*]] true so a saved question's declared
   MBQL filter-widget parameters run, not just native template tags — the same relaxation the
   dashboard path takes once it has validated parameters. It is safe here only because
   [[resolve-card-parameters]] forwards value-only entries resolved against the card's own
   parameter list, so every parameter's target comes from the card and none from the caller:
   the arbitrary-parameter door this opens has nothing arbitrary to walk through."
  [card parameters row-limit]
  (let [result (binding [qp.card/*allow-arbitrary-mbql-parameters* true]
                 (qp.card/process-query-for-card
                  card :api
                  :parameters  parameters
                  :context     :question
                  :constraints {:max-results           row-limit
                                :max-results-bare-rows row-limit}
                  :middleware  {:process-viz-settings? false}
                  :make-run    (fn [qp _export-format]
                                 (fn [query info]
                                   (qp (update query :info merge info) nil)))))]
    (when-not (= (:status result) :completed)
      (common/throw-teaching-error (str "Query failed: " (or (:error result) "unknown error"))))
    result))

(defn- saved-question-steering-line
  [returned]
  (format "returned %d rows, more available — narrow with `parameters`, or raise `row_limit` (max %d)"
          returned max-row-limit))

(def ^:private run-saved-question-args-schema
  [:map {:closed true}
   [:id [:or
         [:int {:min 1 :description "Numeric card id."}]
         [:string {:min 1 :description "A 21-character entity_id."}]]]
   [:parameters {:optional true}
    [:maybe [:sequential
             [:map
              [:id {:optional true}
               [:maybe [:string {:min 1 :description "The parameter's id (or slug) from the card's parameter list."}]]]
              [:slug {:optional true}
               [:maybe [:string {:min 1 :description "The parameter's slug — equivalent to passing it as id."}]]]
              [:value {:description "The parameter value; an array for multi-value parameters. The parameter's stored target and type always apply."}
               :any]]]]]
   [:row_limit {:optional true}
    [:maybe [:int {:min 1 :max max-row-limit :description "Maximum rows to return in this call (default 100, max 2000)."}]]]])

(registry/deftool run-saved-question
  "Run a saved question (card) by numeric id or entity_id and return its rows inline. Parameters are resolved server-side against the card's own parameter list: pass each as {id, value} where id is the parameter's id or slug — the stored target and type always apply and any client-supplied target or type is ignored, so you can set a filter's value but never repoint it at another field. Both native template-tag parameters ({{variable}} and field-filter tags) and a saved question's declared filter-widget parameters can be set; value types are checked per parameter. Discover a card's parameters with get_content (a question's concise shape carries its template tags and materialized parameters). Results are cols + rows with returned/truncated counts, capped by row_limit. No query_handle and no cursor: when a result is truncated, narrow it through the card's parameters or raise row_limit (max 2000)."
  {:name        "run_saved_question"
   :scope       metabot.scope/agent-query-execute
   :annotations {:readOnlyHint true}
   :args        run-saved-question-args-schema}
  [{:keys [id parameters row_limit]} _context]
  (let [row-limit   (or row_limit default-row-limit)
        card        (common/resolve-and-read :model/Card id
                                             (fn [card-id]
                                               (api/read-check :model/Card card-id)))
        mbql-params (when (seq parameters)
                      (resolve-card-parameters card parameters))
        ;; One row past the limit, so truncation is *observed* rather than inferred from a full
        ;; page: a card whose result fills `row_limit` exactly is complete, and says so.
        result      (run-card! card mbql-params (inc row-limit))
        cols        (get-in result [:data :cols])
        ;; The constraints injected by [[run-card!]] don't bind every display type — a
        ;; `:display :pivot` card routes through `qp.pivot/run-pivot-query`, which replaces
        ;; `:max-results` with its own pivot ceiling — so the cap is enforced on the result
        ;; rows here, where it holds regardless of which QP path ran.
        all-rows    (vec (get-in result [:data :rows]))
        truncated?  (> (count all-rows) row-limit)
        rows        (cond-> all-rows truncated? (subvec 0 row-limit))
        returned    (count rows)
        counts      {:returned returned :truncated truncated?}
        payload     (assoc counts
                           :cols (response-cols cols)
                           :rows rows)]
    (common/success-content
     (cond-> (json/encode payload)
       truncated? (str "\n" (saved-question-steering-line returned))))))
