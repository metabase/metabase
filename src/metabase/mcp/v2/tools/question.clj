(ns metabase.mcp.v2.tools.question
  "The v2 MCP `question` write tool: resolves one of three query sources — `query_handle`
   (a handle from an execute tool), inline `query` (MBQL 5), or `native` (raw SQL) — into a
   `dataset_query` map, then mirrors REST `POST /api/card/`'s pre-checks to create a saved
   question."
  (:require
   [clojure.string :as str]
   [metabase.api.common :as api]
   [metabase.channel.urls :as channel.urls]
   [metabase.collections.models.collection :as collection]
   [metabase.lib-be.core :as lib-be]
   [metabase.lib.core :as lib]
   [metabase.mcp.v2.common :as common]
   [metabase.mcp.v2.registry :as registry]
   [metabase.metabot.scope :as metabot.scope]
   [metabase.queries.core :as queries]
   [metabase.query-permissions.core :as query-perms]
   [metabase.util :as u]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(def ^:private tag-type->kw
  {"text" :text "number" :number "date" :date "dimension" :dimension})

(defn- ->lib-template-tag
  "Map the tool's tag shape onto `existing-tag` (the lib-extracted template-tag map, which
   already carries `:id`/`:name`/`:display-name`). `dimension` tags additionally carry a
   `field_id` (numeric id or 21-char entity_id, resolved here and built into a pMBQL field
   ref) and a widget type (`widget_type`) — a JSON caller cannot construct a pMBQL ref
   directly since it requires a `:lib/uuid`."
  [existing-tag {tag-type :type :keys [display_name field_id widget_type required default]}]
  (let [t (or (tag-type->kw tag-type)
              (common/throw-teaching-error
               (format "Invalid template tag type %s — use \"text\", \"number\", \"date\", or \"dimension\"."
                       (pr-str tag-type))))]
    (cond-> (assoc existing-tag :type t)
      display_name (assoc :display-name display_name)
      (some? required) (assoc :required (boolean required))
      (some? default) (assoc :default default)
      (= t :dimension) (assoc :dimension [:field {:lib/uuid (str (random-uuid))}
                                          (common/resolve-id-or-404 :model/Field field_id)]
                              :widget-type (keyword widget_type)))))

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
              (map (fn [[tag-name tag]]
                     (let [nm (name tag-name)]
                       [nm (->lib-template-tag (get existing-by-name nm) tag)])))
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

(defn- resolve-query-source
  "Resolve exactly one query source to a `dataset_query` map. `query_handle` re-runs the
   save-path guards (native allowed); `query` is inline MBQL 5; `native` is built from raw SQL."
  [{:keys [query_handle query native]} session-id]
  (let [sources (cond-> []
                  query_handle (conj :query_handle)
                  query        (conj :query)
                  native       (conj :native))]
    (when-not (= 1 (count sources))
      (common/throw-teaching-error
       "Pass exactly one query source: `query_handle` (a handle from an execute tool), `query` (inline MBQL 5), or `native` ({database_id, sql})."))
    (cond
      query_handle
      (:query (common/resolve-query-handle-for-save! session-id api/*current-user-id* query_handle))

      query
      (try
        (lib-be/normalize-query nil (ensure-pmbql-type query) {:strict? true})
        (catch clojure.lang.ExceptionInfo e
          (common/throw-teaching-error
           (str "Invalid inline query — pass a well-formed MBQL 5 query. " (ex-message e)))))

      native
      (let [{:keys [database_id sql template_tags]} native
            mp (lib-be/application-database-metadata-provider database_id)]
        (-> (lib/native-query mp sql)
            (apply-template-tags template_tags))))))

;;; ------------------------------------------------------ Create --------------------------------------------------

(def ^:private card-display-enum
  [:enum "table" "bar" "line" "pie" "scatter" "area" "row" "combo" "pivot"
   "scalar" "smartscalar" "gauge" "progress" "funnel" "map" "waterfall" "sankey"])

(defn- frontend-url
  "Prefix a `channel.urls` relative `path` with the configured site URL, returning it relative
   when site-url is unset so the tool never emits an absolute URL with an empty host."
  [path]
  (let [base (channel.urls/site-url)]
    (if (str/blank? base)
      path
      (str base path))))

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
              (if-let [{:keys [display_name description semantic_type visibility_type]}
                       (get overrides (:name col))]
                (cond-> col
                  display_name    (assoc :display_name display_name)
                  description     (assoc :description description)
                  semantic_type   (assoc :semantic_type (keyword semantic_type))
                  visibility_type (assoc :visibility_type (keyword visibility_type)))
                col))
            computed-columns))))

(defn- create!
  "Mirror REST `POST /api/card/`'s pre-checks — run permissions on the resolved query, create
   permission on the target collection — then save a `question` (or `model`) card. Returns the
   create response: [[card-response]] plus the saved card's `:url`."
  [{:keys [name description display visualization_settings cache_ttl collection_position
           card_type column_metadata] :as args}
   session-id]
  (let [dataset-query (resolve-query-source args session-id)
        collection-id (if (contains? args :collection_id)
                        (common/resolve-collection-id (:collection_id args))
                        (:id (collection/user->personal-collection api/*current-user-id*)))]
    (query-perms/check-run-permissions-for-query dataset-query)
    (api/create-check :model/Card {:collection_id collection-id})
    (let [result-metadata (when (seq column_metadata)
                            (merge-column-metadata (queries/infer-metadata dataset-query) column_metadata))
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
                  result-metadata (assoc :result_metadata result-metadata))
                {:id api/*current-user-id*})]
      (assoc (card-response card)
             :url (frontend-url (channel.urls/card-path (:id card)))))))

(defn- update!
  [_id _args _session-id]
  (common/throw-teaching-error "Updating questions is not yet implemented."))

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
             [:template_tags {:optional true} [:maybe :map]]]]]
   [:name {:optional true} [:maybe [:string {:min 1}]]]
   [:description {:optional true} [:maybe :string]]
   [:collection_id {:optional true} [:maybe [:or :int :string]]]
   [:collection_position {:optional true} [:maybe :int]]
   [:display {:optional true} [:maybe card-display-enum]]
   [:visualization_settings {:optional true} [:maybe :map]]
   [:cache_ttl {:optional true} [:maybe :int]]
   [:archived {:optional true} [:maybe :boolean]]
   [:column_metadata {:optional true}
    [:maybe [:sequential
             [:map
              [:name [:string {:min 1}]]
              [:display_name {:optional true} [:maybe :string]]
              [:description {:optional true} [:maybe :string]]
              [:semantic_type {:optional true} [:maybe :string]]
              [:visibility_type {:optional true} [:maybe :string]]]]]]])

(registry/deftool question-write-tool
  "Create, update, or archive a saved question or model. method: \"create\" | \"update\". On create, pass a name and exactly one query source: query_handle (a handle from an execute tool — MBQL or native SQL), query (inline MBQL 5), or native ({database_id, sql, template_tags?}). Optional: card_type (\"question\" default, or \"model\"), description, collection_id (omit to save to your personal collection; pass \"root\" to save to the root collection), display, visualization_settings, cache_ttl, column_metadata (list of {name, display_name?, description?, semantic_type?, visibility_type?} — sets the card's result_metadata; typically used with card_type \"model\"). On update, pass id and any fields to change; archived: true trashes, false restores."
  {:name         "question_write"
   :scope        metabot.scope/agent-question-create
   :update-scope metabot.scope/agent-question-update
   :annotations  {:readOnlyHint false :destructiveHint false}
   :args         question-write-args-schema}
  [args {:keys [token-scopes session-id]}]
  (let [[op a b] (common/dispatch-write
                  {:tool-name "question_write"
                   :update-scope metabot.scope/agent-question-update
                   :create-required [:name]}
                  token-scopes args)
        payload (case op
                  :create (create! a session-id)
                  :update (update! a b session-id))]
    (common/success-content payload payload)))
