(ns metabase.mcp.v2.tools.transform
  "The v2 MCP `transform_write` tool. A transform materializes a query into a table in the
   warehouse; this tool creates and edits the query kind, routing through the same domain fns and
   check stack `POST`/`PUT /api/transform` run ([[metabase.transforms.core]]), so feature gating,
   transforms permissions, target-table conflicts, schema requirements, and cycle detection are
   inherited rather than reimplemented.

   Its own work is the transform authoring contract: one query source (a `definition` in the same
   shape `get_content`'s \"definition\" include returns, or a `query_handle` from an execute tool),
   a `target` patched rather than replaced so a rename keeps its schema, and refusing the two shapes
   it cannot author — python sources and incremental targets — instead of silently rewriting them."
  (:require
   [metabase.agent-api.query-guards :as query-guards]
   [metabase.api.common :as api]
   [metabase.channel.urls :as channel.urls]
   [metabase.lib-be.core :as lib-be]
   [metabase.mcp.scope :as mcp.scope]
   [metabase.mcp.v2.common :as common]
   [metabase.mcp.v2.projections :as projections]
   [metabase.mcp.v2.queries :as v2.queries]
   [metabase.mcp.v2.registry :as registry]
   [metabase.mcp.v2.resolve :as v2.resolve]
   [metabase.mcp.v2.write :as v2.write]
   [metabase.metabot.scope :as metabot.scope]
   [metabase.transforms.core :as transforms]
   [metabase.util :as u]))

(set! *warn-on-reflection* true)

(def ^:private accepted-shapes
  "The sentence every source-shape teaching error ends with, naming what `definition` accepts."
  (str "`definition` is a transform source: {\"type\": \"query\", \"query\": …} — exactly what "
       "get_content's \"definition\" include returns for a transform. The query inside is either "
       "the same numeric-id dialect execute_query takes. "
       "Alternatively pass a query_handle from execute_query or execute_sql instead of "
       "`definition`."))

(def ^:private python-note
  "transform_write authors query transforms only — python transforms are written in Metabase.")

;;; ----------------------------------------------- Source handling ------------------------------------------------

(defn- normalize-transform-query
  "Normalize a numeric-ref query — hand-written MBQL 5, MBQL 4 (which normalizes into it), a
   resolved portable query, or a handle's stored query — into the canonical MBQL 5 the transform
   stores. Strict, so a malformed query is a teaching error here rather than a failure at the next
   run."
  [query]
  (try
    (lib-be/normalize-query nil query {:strict? true})
    (catch Exception e
      (common/throw-teaching-error
       (format "The transform's query is not valid MBQL: %s %s"
               (common/ellipsize (ex-message e) 300) accepted-shapes)))))

(defn- definition->query
  "The query inside a caller-supplied `definition`, resolved to canonical MBQL 5. Source kinds this
   tool can't author are refused here rather than stored in a degraded form."
  [definition]
  (let [source-type (some-> (:type definition) name)]
    (cond
      ;; A legacy MBQL query carries `:type "query"` and `:query` too, so it reads as a source map
      ;; and fails much later on the inner query. Name the wrap instead.
      (or (contains? definition :database) (contains? definition :stages))
      (common/throw-teaching-error
       (str "`definition` is a query, not a transform source — wrap it: "
            "{\"type\": \"query\", \"query\": <your query>}."))

      (= "python" source-type)
      (common/throw-teaching-error (str "This is a python transform's definition. " python-note))

      (not= "query" source-type)
      (common/throw-teaching-error
       (format "`definition.type` is %s. %s" (pr-str source-type) accepted-shapes))

      (contains? definition :source-incremental-strategy)
      (common/throw-teaching-error
       (str "`definition.source-incremental-strategy` sets up incremental (checkpoint) loading, which "
            "transform_write can't author — configure it in Metabase, and edit the query here without it."))

      :else
      (let [query (or (:query definition)
                      (common/throw-teaching-error (str "`definition` has no `query`. " accepted-shapes)))]
        (normalize-transform-query
         (if (v2.queries/portable-query? query)
           (v2.queries/resolve-external-query query accepted-shapes)
           query))))))

(defn- check-native-source-gates!
  "The gates an inline native `definition` passes: the `agent:sql:run` scope and the
   `mcp-execute-sql-enabled` kill switch — `execute_sql`'s own two. A stored native transform is raw
   SQL the transform runner later executes against the warehouse as a CTAS, so accepting one under the
   content write scope alone would rebuild `execute_sql` (with a write to the warehouse on top) without
   its scope or its kill switch. Same gate `question_write` puts on its native sources. A
   `query_handle` needs neither here: minting one already passed them. No-op on the scope half for
   unscoped callers (cookie sessions bind the unrestricted sentinel, which matches everything)."
  [token-scopes]
  (when-not (mcp.scope/matches? token-scopes metabot.scope/agent-sql-run)
    (throw (ex-info (format (str "Saving a native (SQL) transform requires the %s scope — this token can "
                                 "write content but not author raw SQL.")
                            metabot.scope/agent-sql-run)
                    {:status-code 403 ::common/error-code common/error-code-invalid-request})))
  (v2.queries/check-execute-sql-enabled! "Saving a native (SQL) transform"))

(defn- resolve-source
  "Resolve the caller's query source to the `source` map the transform stores. Exactly one of
   `definition` and `query_handle` (a handle from an execute tool, re-checked for shape and
   permissions on resolve — native included, so an execute_sql handle saves as a SQL transform) may
   be present; `nil` when neither is, which on update means \"leave the stored source alone\".
   An inline `definition` that carries native SQL — a legacy `:type :native` or an MBQL 5 native
   stage, however nested — clears [[check-native-source-gates!]] first."
  [{:keys [definition query_handle]} session-id token-scopes]
  (when (and definition query_handle)
    (common/throw-teaching-error
     "Pass exactly one query source: `definition` (the transform's source) or `query_handle` (a handle from an execute tool)."))
  (when-let [query (cond
                     definition   (let [query (definition->query definition)]
                                    (when (query-guards/native-query? query)
                                      (check-native-source-gates! token-scopes))
                                    query)
                     query_handle (-> (v2.queries/resolve-query-handle-for-save!
                                       session-id api/*current-user-id* query_handle)
                                      :query
                                      normalize-transform-query))]
    {:type "query" :query query}))

;;; ----------------------------------------------- Target handling ------------------------------------------------

(defn- resolve-target
  "The `target` to store: the caller's fields laid over `existing` (nil on create), so
   `target: {\"name\": …}` on update renames the output table without dropping its schema. Always a
   plain `table` target — an incremental target carries a load strategy this tool can't author, and
   overwriting one would silently turn an incremental transform into a full rebuild.

   `type`, `database`, and the incremental strategy are derived rather than authored, but a read
   hands them back on every target, so they are accepted to keep read-modify-write working and
   refused only when they disagree with what this tool would write. `source-db-id` is the database
   the query runs on, which the target always follows.

   Nils are stripped first: the registry boundary only strips top-level nils, so a strict
   client's nulls arrive inside `target` and would otherwise read as \"set this to nil\"."
  [existing target source-db-id]
  (let [{target-name :name, :keys [schema database] :as target} (u/remove-nils target)
        existing-type (some-> (:type existing) name)
        target-type   (some-> (:type target) name)]
    (when (and existing (not= "table" existing-type))
      (common/throw-teaching-error
       (format (str "This transform writes to a %s target, which transform_write can't edit — change it in "
                    "Metabase, or omit `target` to leave it alone.")
               existing-type)))
    (when (and target-type (not= "table" target-type))
      (common/throw-teaching-error
       (format (str "`target.type` is %s — transform_write authors plain \"table\" targets, rebuilt in full on "
                    "every run. Incremental targets are configured in Metabase; omit `target.type`.")
               (pr-str target-type))))
    (when (:target-incremental-strategy target)
      (common/throw-teaching-error
       (str "`target.target-incremental-strategy` sets up incremental (append/merge) loading, which "
            "transform_write can't author — configure it in Metabase, and edit the transform here without it.")))
    (when (and database source-db-id (not= database source-db-id))
      (common/throw-teaching-error
       (format (str "`target.database` is %d but the query reads from database %d — a transform writes to the "
                    "database its query reads, so the target database follows the query rather than being set "
                    "separately. Omit `target.database`, or point the query at database %d.")
               database source-db-id database)))
    (when (and (nil? existing) (nil? target-name))
      (common/throw-teaching-error "`target.name` is required when method is \"create\" — it names the table the transform writes."))
    (cond-> (assoc (select-keys existing [:schema :database]) :type "table"
                   :name (or target-name (:name existing)))
      schema (assoc :schema schema))))

(defn- check-target-free!
  "Refuse a target table that already exists, as the REST create and update check stacks both do.
   Restated as a teaching error naming the fix — the REST 403 (\"A table with that name already
   exists.\") says neither which table clashed nor what to do about it."
  [{:keys [target] :as body}]
  (when (transforms/target-table-exists? body)
    (common/throw-teaching-error
     (format (str "A table named %s already exists in the target database. Pick a different `target.name` "
                  "(or schema) — a transform creates its output table, it doesn't adopt one.")
             (pr-str (str (when-let [s (:schema target)] (str s ".")) (:name target)))))))

(defn- check-target-move!
  "Run [[check-target-free!]] over the transform `updates` would produce, but only when the target is
   actually moving — REST guards on the same condition, and it is load-bearing: a transform that has
   already built its own output table would otherwise clash with itself and become uneditable."
  [transform updates]
  (when (contains? updates :target)
    (let [where #(select-keys (:target %) [:schema :name])]
      (when (not= (where transform) (where updates))
        (check-target-free! (merge transform updates))))))

;;; -------------------------------------------------- Responses ---------------------------------------------------

(defn- write-result
  "The created/updated transform echoed to the caller: the `:transform` concise read projection — so
   every field the echo carries is named and shaped exactly as a concise `get_content` read names
   it — plus `:entity_id` (a portable id to update by), the transform's URL, and `:tag_ids` — the
   one write arg the concise projection omits — so every field this tool accepts is confirmed back
   rather than silently dropped.

   A confirmation of the write, not a read of the result: `:last_run` is the one concise key the
   echo never carries, because it is hydrated state the write neither sets nor loads. Its absence
   here means \"not fetched\" rather than \"never run\" — run state comes from `get_content`."
  [transform]
  ;; The :transform projection is registered by metabase.mcp.v2.tools.content, which the v2 api ns
  ;; requires alongside this one — so the registry is populated before any tool dispatch reaches here.
  (assoc (projections/project :transform :concise transform)
         :entity_id (:entity_id transform)
         :url       (common/frontend-url (channel.urls/transform-path (:id transform)))
         :tag_ids   (vec (:tag_ids transform))))

;;; --------------------------------------------------- Create -----------------------------------------------------

(defn- create!
  "Run the shared REST create check stack on the resolved source and target, then save the
   transform. An omitted `collection_id` leaves the transform at the root of the transforms tree,
   as REST create does."
  [{:keys [name description tag_ids] :as args} session-id token-scopes]
  (let [source (or (resolve-source args session-id token-scopes)
                   (common/throw-teaching-error
                    "Pass the transform's query: `definition` (inline) or `query_handle` (from an execute tool)."))
        body   (u/remove-nils
                {:name          name
                 :description   description
                 :source        source
                 :target        (resolve-target nil (:target args) (-> source :query :database))
                 :collection_id (when (contains? args :collection_id)
                                  (v2.resolve/resolve-collection-id (:collection_id args)))
                 :tag_ids       tag_ids})]
    (transforms/check-feature-enabled! body)
    (api/create-check :model/Transform body)
    (transforms/check-database-feature body)
    (check-target-free! body)
    (write-result (transforms/create-transform! body))))

;;; --------------------------------------------------- Update -----------------------------------------------------

(defn- check-is-query-transform!
  "Refuse to write a query transform's contract onto a python one, so an update can't retype a
   transform by addressing it with the wrong tool — or silently drop its source tables."
  [transform]
  (when-not (transforms/query-transform? transform)
    (common/throw-teaching-error
     (format "Transform %d is a %s transform. %s"
             (:id transform) (name (:source_type transform)) python-note))))

(defn- check-source-replaceable!
  "Refuse to replace a source that loads incrementally. The strategy lives on the source, and a
   source is stored whole — so writing the plain `{type, query}` source this tool builds over one
   would drop the strategy and silently turn an incremental transform into a full read."
  [transform]
  (when-let [strategy (get-in transform [:source :source-incremental-strategy])]
    (common/throw-teaching-error
     (format (str "This transform's source loads incrementally (%s), which transform_write can't author — "
                  "replacing its query here would drop that. Edit the query in Metabase, or omit "
                  "`definition`/`query_handle` to leave the source alone.")
             (name (:type strategy))))))

(defn- update!
  "Write-check the existing transform, patch only the caller-supplied fields, then hand the patch to
   the shared REST update path, which re-runs feature, database, schema, target-conflict, and cycle
   checks against the merged transform."
  [id {:keys [name description tag_ids] :as args} session-id token-scopes]
  (let [transform  (v2.resolve/resolve-and-read-with
                    :model/Transform id
                    (fn [tid] (api/write-check :model/Transform tid)))
        _          (check-is-query-transform! transform)
        ;; Refuse before resolving, so a doomed source doesn't pay for the query pipeline first.
        _          (when (or (:definition args) (:query_handle args))
                     (check-source-replaceable! transform))
        new-source (resolve-source args session-id token-scopes)
        ;; The target follows the query being stored — the new one when the source is changing in
        ;; this same call, otherwise the one already there.
        source-db  (-> (or new-source (:source transform)) :query :database)
        updates    (cond-> {}
                     (contains? args :name)          (assoc :name name)
                     (contains? args :description)   (assoc :description description)
                     (contains? args :collection_id) (assoc :collection_id (v2.resolve/resolve-collection-id (:collection_id args)))
                     (contains? args :tag_ids)       (assoc :tag_ids (vec tag_ids))
                     (contains? args :target)        (assoc :target (resolve-target (:target transform) (:target args) source-db))
                     new-source                      (assoc :source new-source))]
    (when (empty? updates)
      (common/throw-teaching-error
       (str "Nothing to update — pass at least one of name, description, definition, query_handle, target, "
            "collection_id, or tag_ids.")))
    (check-target-move! transform updates)
    (write-result (transforms/update-transform! (:id transform) updates))))

;;; -------------------------------------------------- The tool ----------------------------------------------------

(def ^:private transform-write-args-schema
  [:map {:closed true}
   [:method
    [:enum {:description (str "\"create\" makes a new transform (requires `name`, `target`, and one query "
                              "source); \"update\" edits the one named by `id`.")}
     "create" "update"]]
   [:id {:optional true}
    [:maybe [:or
             [:int {:description "Numeric id of the transform to update."}]
             [:string {:description "21-character entity_id of the transform to update."}]]]]
   [:name {:optional true}
    [:maybe [:string {:min 1 :description "Create only (editable on update): display name of the transform."}]]]
   [:definition {:optional true}
    [:maybe [:map {:description (str "The transform's source: {\"type\": \"query\", \"query\": …}, the shape "
                                     "get_content's \"definition\" include returns for a transform. The query "
                                     "inside is the same numeric-id dialect execute_query takes, and may be "
                                     "native SQL. Pass this or "
                                     "query_handle, not both.")}]]]
   [:query_handle {:optional true}
    [:maybe [:string {:min 1 :description (str "A query_handle from execute_query or execute_sql — saves exactly "
                                               "the query that ran. Pass this or definition, not both.")}]]]
   [:target {:optional true}
    [:maybe [:map {:closed true
                   :description (str "The table the transform writes, recreated on every run. On update this "
                                     "patches the current target, so passing only `name` renames the table and "
                                     "keeps its schema. A target read back from get_content can be passed back "
                                     "unchanged.")}
             [:name {:optional true}
              [:maybe [:string {:min 1 :description "Name of the output table. Required on create."}]]]
             [:schema {:optional true}
              [:maybe [:string {:min 1 :description (str "Schema to write the table into. Required on databases "
                                                         "that have schemas.")}]]]
             ;; `type`, `database`, and the incremental strategy are derived, not authored — but a read
             ;; hands all three back, so the schema tolerates them and resolve-target does the teaching.
             [:type {:optional true}
              [:maybe [:string {:min 1 :description (str "Always \"table\" — a full rebuild each run. Incremental "
                                                         "targets are configured in Metabase, not here.")}]]]
             [:database {:optional true}
              [:maybe [:int {:description (str "Numeric id of the database the table is written to. Not a choice — "
                                               "it always follows the query's database. Accepted so a target can "
                                               "be passed back unchanged.")}]]]
             [:target-incremental-strategy {:optional true}
              [:maybe [:map {:description (str "Incremental (append/merge) loading, configured in Metabase, not "
                                               "here. Accepted only so passing a target back unchanged reports "
                                               "what can't be edited rather than a schema error.")}]]]]]]
   [:description {:optional true}
    [:maybe [:string {:description "Optional human-readable description."}]]]
   [:collection_id {:optional true}
    [:maybe [:or
             [:int {:description "Numeric id of the transform folder to file the transform in."}]
             [:string {:description (str "21-character entity_id of the transform folder, or \"root\" for the top "
                                         "level of the transforms tree.")}]]]]
   [:tag_ids {:optional true}
    [:maybe [:sequential {:description (str "Numeric ids of transform tags to label the transform with; jobs select "
                                            "transforms by tag. Replaces the current list — pass [] to clear it.")}
             :int]]]
   [:clear {:optional true}
    [:maybe [:sequential [:enum {:description "Update only: property names to unset (description). Needed because a null cannot say \"clear this\" — strict clients fill every unset property with null, so nulls are stripped at the boundary."}
                          "description"]]]]])

(def ^:private transform-write-entry
  {:create-required [:name :target]
   :clearable       #{:description}})

(registry/deftool transform-write
  "Create or update a transform: a saved query that Metabase runs to materialize its results into a real table in your
  warehouse, which questions and other transforms can then query. method: \"create\" requires name, target, and one
  query source; method: \"update\" requires id and changes only the fields you pass. Pass the query as definition
  ({\"type\": \"query\", \"query\": …} — the shape get_content's \"definition\" include returns, with the query in the
  same numeric-id dialect execute_query takes) or as a query_handle from execute_query or
  execute_sql — one or the other, not both. Native SQL is fine: save an execute_sql handle. target is the output table,
  {name, schema?}; a schema is required on databases that have schemas, and on update target patches the current one,
  so passing only name renames the table. The target database always follows the query's database. Creating a transform
  whose target table already exists is refused — a transform creates its table, it doesn't adopt one. Optional:
  description, collection_id (a transform folder; omit for the top level of the transforms tree), tag_ids (replaces
  the current list; jobs select transforms by tag). Two things this tool deliberately can't do: python transforms and
  incremental (checkpoint/append/merge) loading are authored in Metabase, and an update that would rewrite either is
  refused rather than degrading it. There is no archive or delete here either — transforms have no trash, so removing
  one is done in Metabase. Running a transform is separate from writing it. Requires transforms permission on the
  source database and the transforms feature enabled. Before your first transform_write, read learn(\"transforms\")
  unless already in context — the source shapes, what patching `target` renames, and the refusals above in full."
  {:name        "transform_write"
   :scope       metabot.scope/agent-content-write
   :annotations {:readOnlyHint false :destructiveHint false}
   :args        transform-write-args-schema}
  [args {:keys [token-scopes session-id]}]
  (let [[op a b] (v2.write/dispatch-write transform-write-entry args)
        payload  (v2.write/readback token-scopes [metabot.scope/agent-content-read]
                                    (case op
                                      :create (create! a session-id token-scopes)
                                      :update (update! a b session-id token-scopes)))]
    (common/success-content payload payload)))
