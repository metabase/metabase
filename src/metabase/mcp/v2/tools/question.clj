(ns metabase.mcp.v2.tools.question
  "The v2 MCP `question` write tool: resolves one of three query sources — `query_handle`
   (a handle from an execute tool), inline `query` (MBQL 5), or `native` (raw SQL) — into a
   `dataset_query` map, then mirrors REST `POST /api/card/`'s pre-checks to create a saved
   question."
  (:require
   [clojure.string :as str]
   [metabase.agent-api.query-guards :as query-guards]
   [metabase.api.common :as api]
   [metabase.channel.urls :as channel.urls]
   [metabase.collections.models.collection :as collection]
   [metabase.lib-be.core :as lib-be]
   [metabase.lib.core :as lib]
   [metabase.mcp.scope :as mcp.scope]
   [metabase.mcp.v2.common :as common]
   [metabase.mcp.v2.queries :as v2.queries]
   [metabase.mcp.v2.registry :as registry]
   [metabase.mcp.v2.resolve :as v2.resolve]
   [metabase.mcp.v2.skills :as skills]
   [metabase.mcp.v2.write :as v2.write]
   [metabase.metabot.scope :as metabot.scope]
   [metabase.queries.core :as queries]
   [metabase.util :as u]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(def ^:private tag-type->kw
  {"text" :text "number" :number "date" :date "boolean" :boolean
   "dimension" :dimension "temporal-unit" :temporal-unit})

(defn- tag-field-id
  "The field the tag binds: `field_id` (the write dialect), or the id embedded in a read-shape
   `dimension` ref — `[\"field\", <id>, opts]` legacy or `[\"field\", opts, <id>]` MBQL 5 — so the
   tags `get_content` returns round-trip through this tool unchanged."
  [{:keys [field_id dimension]}]
  (or field_id
      (when (sequential? dimension)
        (some #(when (or (int? %) (v2.resolve/entity-id? %)) %) (rest dimension)))))

(defn- ->lib-template-tag
  "Map the tool's tag shape onto `existing-tag` (the lib-extracted template-tag map, which
   already carries `:id`/`:name`/`:display-name`). `dimension` and `temporal-unit` tags
   additionally carry a field (`field_id` — numeric id or 21-char entity_id, resolved here and
   built into a pMBQL field ref, since a JSON caller cannot construct one directly: it requires
   a `:lib/uuid`); `dimension` tags also carry a widget type (`widget_type`). Alongside the
   underscore write dialect, the kebab-case read shape `get_content` emits (`display-name`,
   `widget-type`, a `dimension` ref) is accepted, so a read-modify-write round-trip needs no
   translation."
  [existing-tag {tag-type :type :keys [display_name widget_type required default] :as tag}]
  (let [t            (or (tag-type->kw tag-type)
                         (common/throw-teaching-error
                          (format "Invalid template tag type %s — use \"text\", \"number\", \"date\", \"boolean\", \"dimension\", or \"temporal-unit\".\n%s"
                                  (pr-str tag-type) skills/template-tag-contract)))
        display-name (or display_name (:display-name tag))
        widget-type  (or widget_type (:widget-type tag))
        field-ref?   (contains? #{:dimension :temporal-unit} t)
        field-id     (when field-ref? (tag-field-id tag))]
    (when (and (= t :dimension) (str/blank? widget-type))
      (common/throw-teaching-error
       (str "A dimension template tag requires a widget_type, e.g. \"string/=\", \"number/=\", or \"date/all-options\".\n"
            skills/template-tag-contract)))
    (when (and field-ref? (nil? field-id))
      (common/throw-teaching-error
       (format "A %s template tag requires a field_id — the numeric id or 21-character entity_id of the column it binds.\n%s"
               (name t) skills/template-tag-contract)))
    (cond-> (assoc existing-tag :type t)
      display-name (assoc :display-name display-name)
      (some? required) (assoc :required (boolean required))
      (some? default) (assoc :default default)
      field-ref? (assoc :dimension [:field {:lib/uuid (str (random-uuid))}
                                    (v2.resolve/resolve-id-or-404 :model/Field field-id)])
      (and (= t :dimension) widget-type) (assoc :widget-type (keyword widget-type)))))

(def ^:private reference-tag-types
  "Tag types that reference server-side SQL text — `{{snippet: …}}`, `{{#42}}` card refs, and
   source-table tags. They carry no caller-configurable value, but `get_content` emits them
   alongside the value tags, so a verbatim round-trip must accept them; entries of these types
   are skipped and the auto-extracted tag stands."
  #{"snippet" "card" "table"})

(defn- apply-template-tags
  "Apply caller-supplied `template_tags` to a native `query`. Every supplied tag name must
   appear in the SQL (i.e. among the tags `lib/native-query` auto-extracted); unknown names
   are a teaching error naming the tag."
  [query template_tags]
  (if (empty? template_tags)
    query
    (let [extracted (get-in query [:stages 0 :template-tags])
          present (into #{} (map :name) extracted)
          existing-by-name (into {} (map (juxt :name identity)) extracted)]
      (doseq [tag-name (keys template_tags)]
        (when-not (contains? present (name tag-name))
          (common/throw-teaching-error
           (format "Template tag %s does not appear in the SQL — add {{%s}} to the query or drop the tag."
                   (str "{{" (name tag-name) "}}") (name tag-name)))))
      (lib/with-template-tags
        query
        (into {}
              (keep (fn [[tag-name tag]]
                      (let [nm (name tag-name)]
                        (when-not (contains? reference-tag-types (:type tag))
                          [nm (->lib-template-tag (get existing-by-name nm) tag)]))))
              template_tags)))))

(defn- ensure-pmbql-type
  "Fill in the pMBQL `:lib/type` discriminators a hand-written JSON `query` can't be expected to
   supply: `:mbql/query` at the top level (unless the query is already legacy MBQL 4, carrying
   `:type`), and `:mbql.stage/native` or `:mbql.stage/mbql` on each stage. A query that already
   carries `:lib/type` throughout — e.g. one round-tripped through a lib helper — passes through
   unchanged."
  [query]
  (cond-> query
    (not (or (:lib/type query) (:type query)))
    (assoc :lib/type :mbql/query)

    (:stages query)
    (update :stages
            (fn [stages]
              (mapv #(cond-> % (not (:lib/type %))
                             (assoc :lib/type (if (:native %) :mbql.stage/native :mbql.stage/mbql)))
                    stages)))))

(defn- check-native-source-gates!
  "The gates an inline `native` source passes: the `agent:sql:run` scope and the
   `mcp-execute-sql-enabled` kill switch — `execute_sql`'s own two, because the stored card is raw
   SQL a later `run_saved_question` executes, so accepting one under the content write scope alone
   would rebuild `execute_sql` without its scope or its kill switch. A `query_handle` needs neither
   here: minting one already passed them. No-op on the scope half for unscoped callers (cookie
   sessions bind the unrestricted sentinel, which matches everything)."
  [token-scopes]
  (when-not (mcp.scope/matches? token-scopes metabot.scope/agent-sql-run)
    (throw (ex-info (format (str "Saving a native (SQL) query requires the %s scope — this token can "
                                 "write content but not author raw SQL.")
                            metabot.scope/agent-sql-run)
                    {:status-code 403 ::common/error-code common/error-code-invalid-request})))
  (v2.queries/check-execute-sql-enabled! "Saving a native (SQL) query"))

(defn- resolve-query-source
  "Resolve exactly one query source to a `dataset_query` map. `query_handle` re-runs the
   save-path guards (native allowed); `query` is inline MBQL 5; `native` is built from raw SQL
   once `token-scopes` clears [[check-native-source-gates!]].

   Every branch returns genuine normalized pMBQL: the save path feeds `dataset_query` into
   strictly schema-checked functions (`queries/check-allowed-to-create-card!` and friends), so
   the JSON-shaped maps a handle or inline source yields — keyword *values* flattened to strings
   by the JSON round-trip — must be restored first."
  [{:keys [query_handle query native]} session-id token-scopes]
  (let [sources (cond-> []
                  query_handle (conj :query_handle)
                  query        (conj :query)
                  native       (conj :native))]
    (when-not (= 1 (count sources))
      (common/throw-teaching-error
       "Pass exactly one query source: `query_handle` (a handle from an execute tool), `query` (an inline query), or `native` ({database_id, sql})."))
    (cond
      query_handle
      (lib-be/normalize-query
       nil
       (:query (v2.queries/resolve-query-handle-for-save! session-id api/*current-user-id* query_handle))
       {:strict? true})

      query
      (let [resolved (try
                       (lib-be/normalize-query nil (ensure-pmbql-type query) {:strict? true})
                       (catch clojure.lang.ExceptionInfo e
                         (common/throw-teaching-error
                          (str "Invalid inline query — see learn(\"query-dialect\"). " (ex-message e)))))]
        ;; `native` on the source arg is not the same thing as native in the resolved query: an inline
        ;; `query` can carry a native stage (`ensure-pmbql-type` stamps `:mbql.stage/native` on any stage
        ;; with `:native`), and that stored card is raw SQL a later run_saved_question executes. Gate on
        ;; the resolved query's shape, whole-tree (nested native too), so the `query` source can't be a
        ;; back door around the scope + kill switch the `native` source enforces.
        (when (query-guards/native-query? resolved)
          (check-native-source-gates! token-scopes))
        resolved)

      native
      (do
        (check-native-source-gates! token-scopes)
        (let [{:keys [database_id sql template_tags]} native
              mp (lib-be/application-database-metadata-provider database_id)]
          (-> (lib/native-query mp sql)
              (apply-template-tags template_tags)))))))

;;; ------------------------------------------------------ Create --------------------------------------------------

(defn- collection-path
  "Permission-filtered location breadcrumb of `collection-id`, e.g. \"Our analytics / Marketing
   / Q3\". Ancestors the caller can't read are omitted, matching the app breadcrumb. A `nil`
   `collection-id` is the root collection (\"Our analytics\"), not a personal collection."
  [collection-id]
  (if-not collection-id
    (:name (collection/root-collection-with-ui-details nil))
    (let [coll      (t2/select-one [:model/Collection :id :name :location :personal_owner_id
                                    :namespace :archived_directly]
                                   collection-id)
          ancestors (cond->> (:effective_ancestors (t2/hydrate coll :effective_ancestors))
                      (collection/is-personal-collection-or-descendant-of-one? coll)
                      (remove #(= "root" (:id %))))
          chain     (collection/personal-collections-with-ui-details (conj (vec ancestors) coll))]
      (str/join " / " (map :name chain)))))

(defn- card-response
  "The card fields the create and (eventually) update responses share."
  [card]
  {:id              (:id card)
   :name            (:name card)
   :display         (name (:display card))
   :collection_id   (:collection_id card)
   :collection_path (collection-path (:collection_id card))
   :description     (:description card)})

(def ^:private visibility-type-strs
  "String form of `::lib.schema.metadata/column.visibility-type`'s enum — the args schema and the
   value check below both need the string set the caller writes."
  #{"normal" "details-only" "hidden" "sensitive" "retired"})

(defn- check-semantic-type!
  "`semantic_type` names a keyword in the open `type/…` hierarchy (`type/Currency`,
   `type/PK`, …) — too large to enumerate in the args schema — so validate it here instead
   of letting an unrecognized value fail deep in the insert as a sanitized internal error."
  [semantic_type]
  (let [k (keyword semantic_type)]
    (when-not (isa? k :Semantic/*)
      (common/throw-teaching-error
       (format "Invalid semantic_type %s — pass a type in the \"type/…\" namespace, e.g. \"type/Currency\" or \"type/PK\"."
               (pr-str semantic_type))))
    k))

(defn- apply-column-override
  "Apply one caller-supplied override map onto `col`. A key's presence (even with an explicit
   `null`, which — unlike top-level args — survives the registry's nil-stripping on nested
   values) sets or clears that property; an absent key leaves `col`'s existing value alone."
  [col {:keys [display_name description semantic_type visibility_type] :as override}]
  (cond-> col
    (contains? override :display_name)    (assoc :display_name display_name)
    (contains? override :description)     (assoc :description description)
    (contains? override :semantic_type)   (assoc :semantic_type (some-> semantic_type check-semantic-type!))
    (contains? override :visibility_type) (assoc :visibility_type (some-> visibility_type keyword))))

(defn- merge-column-metadata
  "Overlay caller-supplied `column_metadata` overrides onto `computed-columns` (the query's
   real, inferred result metadata), matching by `:name`. Only the override keys
   (display_name, description, semantic_type, visibility_type) are changed on a matched
   column — base_type, id, field_ref, fingerprints, and every non-annotated column pass
   through untouched. Every `column_metadata` name must match a computed column, or a
   teaching error names the offending one."
  [computed-columns column_metadata]
  (let [by-name (into {} (map (juxt :name identity)) computed-columns)]
    (doseq [{col-name :name} column_metadata]
      (when-not (contains? by-name col-name)
        (common/throw-teaching-error
         (format "Column %s is not in the query results — column_metadata names must match the query's output columns."
                 (pr-str col-name)))))
    (let [overrides (into {} (map (juxt :name identity)) column_metadata)]
      (mapv (fn [col]
              (if-let [override (get overrides (:name col))]
                (apply-column-override col override)
                col))
            computed-columns))))

(defn- resolve-result-metadata
  "Compute `dataset-query`'s real column metadata — folding in `card`'s already-stored model
   overrides (so a partial update keeps annotations on columns the caller didn't resend) — then
   overlay the caller's `column_metadata` overrides by name. `card` carries `:type` and any existing
   `:result_metadata`; for create it's just the pending `{:type ...}`. Throws a teaching error for a
   native query (no inferable columns) or an unknown column name."
  [dataset-query card column_metadata]
  (let [computed-columns (queries/infer-metadata-with-model-overrides dataset-query card)]
    (when (empty? computed-columns)
      ;; infer-metadata swallows preprocess errors and returns nothing, so distinguish the two ways
      ;; to get here: a native query (columns genuinely can't be inferred) vs. an MBQL query that
      ;; failed to analyze (a real problem the caller should hear about, not a "native" red herring).
      (if (lib/native-only-query? dataset-query)
        (common/throw-teaching-error
         "column_metadata isn't supported for models built from a native (SQL) query — Metabase can't determine column types without running the SQL. Omit column_metadata; you can annotate the model's columns after it's created.")
        (common/throw-teaching-error
         "Couldn't determine the query's result columns, so column_metadata can't be applied — check that the query is valid and returns columns.")))
    (merge-column-metadata computed-columns column_metadata)))

(defn- check-dashboard-collection-exclusive!
  "`dashboard_id` and `collection_id` are mutually exclusive — a dashboard question's collection
   is the dashboard's collection, not a caller-chosen one."
  [dashboard_id args]
  (when (and dashboard_id (contains? args :collection_id))
    (common/throw-teaching-error
     "Pass either collection_id or dashboard_id, not both — a dashboard question's collection is the dashboard's collection.")))

(defn- resolve-dashboard!
  "Resolve `dashboard_id` to `{:dashboard-id id :collection-id (its collection_id)}`, or nil when
   `dashboard_id` is absent. [[v2.resolve/resolve-id-or-404]] is translation only — a numeric id
   passes straight through with no lookup — so an explicit existence check is needed here (mirrors
   [[v2.resolve/resolve-collection-id]]) or a bad numeric id reaches the DB as a raw FK violation."
  [dashboard_id]
  (when dashboard_id
    (let [id  (v2.resolve/resolve-id-or-404 :model/Dashboard dashboard_id)
          row (t2/select-one [:model/Dashboard :collection_id] :id id)]
      (when-not row
        (common/throw-not-found :model/Dashboard dashboard_id))
      {:dashboard-id id :collection-id (:collection_id row)})))

(defn- create!
  "Run the shared REST create check stack ([[metabase.queries.core/check-allowed-to-create-card!]])
   on the resolved query and target collection, then save a `question` (or `model`) card. Returns
   the create response: [[card-response]] plus the saved card's `:url`."
  [{:keys [name description display visualization_settings cache_ttl collection_position
           card_type column_metadata dashboard_id] :as args}
   session-id token-scopes]
  (check-dashboard-collection-exclusive! dashboard_id args)
  (let [dataset-query (resolve-query-source args session-id token-scopes)
        dashboard     (resolve-dashboard! dashboard_id)
        dashboard-id  (:dashboard-id dashboard)
        collection-id (if dashboard
                        (:collection-id dashboard)
                        (v2.resolve/resolve-collection-id-or-personal (:collection_id args)))]
    (queries/check-allowed-to-create-card! {:dataset_query dataset-query :collection_id collection-id}
                                           (keyword (or card_type "question")))
    (let [result-metadata (when (seq column_metadata)
                            (resolve-result-metadata dataset-query
                                                     {:type (keyword (or card_type "question"))}
                                                     column_metadata))
          card (queries/create-card!
                (cond-> (u/remove-nils
                         {:name                   name
                          :type                   (keyword (or card_type "question"))
                          :dataset_query          dataset-query
                          :display                (keyword (or display "table"))
                          :description            description
                          :collection_id          collection-id
                          :collection_position    collection_position
                          :cache_ttl              cache_ttl
                          :visualization_settings (or visualization_settings {})})
                  result-metadata (assoc :result_metadata result-metadata)
                  dashboard-id    (assoc :dashboard_id dashboard-id))
                {:id api/*current-user-id*})]
      (assoc (card-response card)
             :url (common/frontend-url (channel.urls/card-path (:id card)))))))

(defn- update-card-response
  "The update response: [[card-response]] plus `:archived`."
  [card]
  (assoc (card-response card) :archived (boolean (:archived card))))

(defn- check-is-question!
  "Refuse to write a question's contract onto a metric, so a caller can't retype a card by
   addressing it with the wrong tool. Questions and models both pass — this tool owns both, and
   converting between them stays a legitimate update."
  [card]
  (when-not (contains? #{:question :model} (:type card))
    (common/throw-teaching-error
     (format "Card %d is a %s, not a question — use metric_write to update it."
             (:id card) (name (:type card))))))

(defn- force-restore-on-dashboard-move
  "Mirrors REST's `update-card!` guard: when `card-updates` moves the card into a dashboard
   (`:dashboard_id` changing to non-nil), a caller-requested `archived true` in the same patch is
   refused — archiving and moving-into-a-dashboard are separate operations — and an already
   `archived` card being moved is force-restored (`archived false`, `archived_directly false`).
   Without this, a trashed card can be re-parented under a dashboard while `archived` (and
   `archived_directly`) stay true,
   since the model layer's `apply-dashboard-question-updates` re-derives `:collection_id` from
   the dashboard whenever `:dashboard_id` is present, independent of `:archived`."
  [card-before card-updates]
  (cond-> card-updates
    (and (api/column-will-change? :dashboard_id card-before card-updates)
         (:dashboard_id card-updates))
    (as-> updates
          (do
            (when (:archived updates)
              (common/throw-teaching-error
               "Can't move a card into a dashboard while also archiving it — archive and move are separate operations."))
            (assoc updates :archived false :archived_directly false)))))

(defn- update!
  "Write-check the existing card, patch only the caller-supplied fields (archiving/restoring via
   `archived`; moving into a dashboard via `dashboard_id`, which forces the card's collection to
   the dashboard's — the model layer enforces the dashboard-question move rules), then run the
   shared REST update check stack ([[metabase.queries.core/check-allowed-to-update-card!]] plus the
   save-cycle guard) before persisting. Returns [[update-card-response]].

   Moving a card OUT of a dashboard isn't expressible here: a `nil` `dashboard_id` is
   indistinguishable from an omitted one once JSON-RPC args are stripped of nulls."
  [id {:keys [name description display visualization_settings cache_ttl collection_position
              card_type archived column_metadata dashboard_id] :as args}
   session-id token-scopes]
  (check-dashboard-collection-exclusive! dashboard_id args)
  (let [card-before  (v2.resolve/resolve-and-read-with
                      :model/Card id
                      (fn [cid] (api/write-check :model/Card cid)))
        _            (check-is-question! card-before)
        dashboard    (resolve-dashboard! dashboard_id)
        dashboard-id (:dashboard-id dashboard)
        new-query    (when (or (:query_handle args) (:query args) (:native args))
                       (resolve-query-source args session-id token-scopes))
        raw-updates  (cond-> {}
                       (contains? args :name)                   (assoc :name name)
                       (contains? args :description)            (assoc :description description)
                       (contains? args :collection_id)          (assoc :collection_id (v2.resolve/resolve-collection-id (:collection_id args)))
                       dashboard-id                             (assoc :dashboard_id dashboard-id
                                                                       :collection_id (:collection-id dashboard))
                       (contains? args :collection_position)    (assoc :collection_position collection_position)
                       (contains? args :display)                (assoc :display (some-> display keyword))
                       (contains? args :visualization_settings) (assoc :visualization_settings visualization_settings)
                       (contains? args :cache_ttl)              (assoc :cache_ttl cache_ttl)
                       (contains? args :card_type)              (assoc :type (keyword card_type))
                       (contains? args :archived)               (assoc :archived (boolean archived))
                       (seq column_metadata)                    (assoc :result_metadata
                                                                       (resolve-result-metadata
                                                                        (or new-query (:dataset_query card-before))
                                                                        card-before
                                                                        column_metadata))
                       new-query                                (assoc :dataset_query new-query))
        card-updates (api/updates-with-archived-directly card-before raw-updates)
        card-updates (force-restore-on-dashboard-move card-before card-updates)]
    ;; the type the card will have once written: the patch's when the caller is converting, else the
    ;; stored one. Never the raw request, which is nil whenever `card_type` is omitted.
    (queries/check-card-can-be-saved! (:dataset_query card-updates)
                                      (or (:type card-updates) (:type card-before)))
    (when-some [query (:dataset_query card-updates)]
      (queries/check-no-save-cycle! id query))
    (queries/check-allowed-to-update-card! card-before card-updates)
    (queries/update-card! {:card-before-update    card-before
                           :card-updates          card-updates
                           :actor                 @api/*current-user*
                           :delete-old-dashcards? false})
    (update-card-response (t2/select-one :model/Card :id id))))

(def ^:private question-write-args-schema
  [:map {:closed true}
   [:method [:enum "create" "update"]]
   [:id {:optional true} [:maybe [:or :int :string]]]
   [:card_type {:optional true} [:maybe [:enum "question" "model"]]]
   [:query_handle {:optional true} [:maybe :string]]
   [:query {:optional true} [:maybe :map]]
   [:native {:optional true}
    [:maybe [:map
             [:database_id [:or :int :string]]
             [:sql [:string {:min 1}]]
             [:template_tags {:optional true}
              [:maybe [:map-of
                       {:description (str "One entry per {{tag}} in the SQL, keyed by tag name; a name "
                                          "absent from the SQL is an error. The shape get_content "
                                          "returns round-trips verbatim.")}
                       :keyword
                       [:map
                        [:type [:enum {:description (str "\"dimension\" = field filter, a widget bound to a column — "
                                                         "write it bare in SQL (WHERE {{tag}}); \"temporal-unit\" = "
                                                         "time-bucket picker for a datetime column; text/number/date/"
                                                         "boolean = raw variables spliced as literals (you write the "
                                                         "operator: WHERE total > {{tag}}); snippet/card/table "
                                                         "reference entries are accepted and ignored — the SQL text "
                                                         "configures them.")}
                                "text" "number" "date" "boolean" "dimension" "temporal-unit"
                                "snippet" "card" "table"]]
                        [:display_name {:optional true} [:maybe [:string {:description "Widget label."}]]]
                        [:field_id {:optional true}
                         [:maybe [:or {:description (str "Required for dimension/temporal-unit: the bound column, as "
                                                         "a numeric field id or 21-char entity_id.")}
                                  :int :string]]]
                        [:widget_type {:optional true}
                         [:maybe [:string {:description (str "Required for dimension: widget/operator matched to the "
                                                             "column's type — e.g. \"string/=\", \"string/contains\", "
                                                             "\"number/between\", \"date/all-options\", \"category\", "
                                                             "\"id\".")}]]]
                        [:required {:optional true} [:maybe :boolean]]
                        [:default {:optional true} [:maybe :any]]]]]]]]]
   [:name {:optional true} [:maybe [:string {:min 1}]]]
   [:description {:optional true} [:maybe :string]]
   [:collection_id {:optional true} [:maybe [:or :int :string]]]
   [:dashboard_id {:optional true} [:maybe [:or :int :string]]]
   [:collection_position {:optional true} [:maybe :int]]
   [:display {:optional true} [:maybe common/card-display-enum]]
   [:visualization_settings {:optional true} [:maybe :map]]
   [:cache_ttl {:optional true} [:maybe :int]]
   [:archived {:optional true} [:maybe :boolean]]
   [:clear {:optional true}
    [:maybe [:sequential [:enum {:description "Update only: property names to unset (description, collection_position, cache_ttl). Needed because a null cannot say \"clear this\" — strict clients fill every unset property with null, so nulls are stripped at the boundary."}
                          "description" "collection_position" "cache_ttl"]]]]
   [:column_metadata {:optional true}
    [:maybe [:sequential
             [:map
              [:name [:string {:min 1}]]
              [:display_name {:optional true} [:maybe :string]]
              [:description {:optional true} [:maybe :string]]
              [:semantic_type {:optional true}
               [:maybe [:string {:description (str "A type in the \"type/…\" namespace, e.g. \"type/Currency\", "
                                                   "\"type/PK\", \"type/Email\".")}]]]
              [:visibility_type {:optional true}
               [:maybe (into [:enum {:description "How the column shows up in the UI."}]
                             visibility-type-strs)]]]]]]])

(registry/deftool question-write-tool
  "Create, update, or archive a saved question or model. method: \"create\" | \"update\". On create, pass a name and exactly one query source: query_handle (from an execute tool — MBQL or native SQL), query (an inline query — numeric ids and a top-level database id, learn(\"query-dialect\"); prefer query_handle, which saves exactly the query execute_query validated), or native ({database_id, sql, template_tags?} — the template_tags shape is MCP-specific and not guessable: before first passing it, call learn(\"native-parameters\") unless already read; on create or update, native additionally requires the agent:sql:run scope and the instance-level mcp-execute-sql-enabled setting, since the saved card is raw SQL). Optional: card_type (\"question\" default, or \"model\"), description, collection_id (omit = your personal collection; \"root\" = the root collection) or dashboard_id (saves the question inside that dashboard, whose collection it inherits — passing both is an error), display, visualization_settings (learn(\"visualization-settings\") covers display choice and settings keys), cache_ttl, column_metadata (list of {name, display_name?, description?, semantic_type?, visibility_type?} — sets result_metadata; typically used with card_type \"model\"). On update, pass id and the fields to change; archived: true trashes, false restores; dashboard_id moves the card into that dashboard (collection follows; a question saved in another dashboard can't move to a different one; moving a card OUT of a dashboard isn't supported yet). Updating a card that is a metric is refused rather than retyping it — use metric_write."
  {:name         "question_write"
   :scope        metabot.scope/agent-content-write
   ;; `archived: true` trashes the card, so this is not the additive-only update
   ;; `destructiveHint false` would assert.
   :annotations  {:readOnlyHint false :destructiveHint true}
   :args         question-write-args-schema}
  [args {:keys [token-scopes session-id]}]
  (let [[op a b] (v2.write/dispatch-write
                  {:create-required [:name]
                   :clearable       #{:description :collection_position :cache_ttl}}
                  args)
        payload (v2.write/readback token-scopes [metabot.scope/agent-content-read]
                                   (case op
                                     :create (create! a session-id token-scopes)
                                     :update (update! a b session-id token-scopes)))]
    (common/success-content payload payload)))
