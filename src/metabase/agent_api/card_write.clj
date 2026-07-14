(ns metabase.agent-api.card-write
  "The v2 `question_write` and `metric_write` tools: the card writes.

   A question, a model, and a metric are all cards, saved through one REST endpoint, so they share
   everything below the tool boundary — the query a call names, the collection it lands in, the checks it
   passes. They stay two tools because the *authoring contract* differs: a question takes a display, a
   visualization, a native SQL body, a model's column edits; a metric takes a definition whose shape the
   product constrains and whose name the catalog already confuses with a measure's. A single type-switch
   tool would make a model choose the type before it has chosen the query, and would make every field's
   description begin with the type it does not apply to.

   Each tool merges create and update behind `method` ([[metabase.agent-api.tools/validate-write!]]). What
   the flat schema cannot say — that a create needs a name and a query, that an update needs an id — the
   teaching errors say, and they are the contract: a model self-corrects from the message and nothing else.

   **The checks are the app's own.** The whole pre-check stack a card write must pass — run permission on
   the query being saved, create/write permission on the collection it lands in and the one it leaves, the
   cycle check, the type's shape rules — lives in [[metabase.queries.card-write]], and these tools call the
   same two functions `POST /api/card` and `PUT /api/card/:id` call. A tool that re-derived the stack would
   drift from it on the day someone adds a check to one and not the other, and the drift would be silent and
   in the direction of permitting more.

   A write returns the card's concise projection — the same shape `get_content` returns for it — so an
   agent that just saved something can report what it saved without a follow-up read."
  (:require
   [clojure.string :as str]
   [medley.core :as m]
   [metabase.agent-api.handles :as handles]
   [metabase.agent-api.projections :as projections]
   [metabase.agent-api.query :as agent-api.query]
   [metabase.agent-api.tools :as tools]
   [metabase.api.common :as api]
   [metabase.collections.models.collection :as collection]
   [metabase.lib-be.core :as lib-be]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.metabot.tools.construct :as metabot-construct]
   [metabase.queries.card-write :as card-write]
   [metabase.queries.core :as queries]
   [metabase.util.malli :as mu]))

(set! *warn-on-reflection* true)

(def card-types
  "The two flavors `question_write` writes. A metric is a card too, and it has its own tool."
  ["question" "model"])

(def displays
  "Every `display` a card may be saved with — the visualizations the app can render. A value outside this set
   is junk in the column and a broken card in the UI, so it is refused rather than persisted."
  ["table" "bar" "line" "pie" "scatter" "area" "row" "combo" "pivot"
   "scalar" "smartscalar" "gauge" "progress" "funnel" "map" "waterfall" "sankey"])

(def template-tag-types
  "The template-tag types a native question's `{{variables}}` take. `snippet` and `card` are absent: those
   tags are written into the SQL as `{{snippet: name}}` / `{{#42}}` and Metabase resolves them itself —
   there is nothing for a call to declare about them."
  ["text" "number" "date" "dimension"])

(def ^:private NativeSource
  [:map
   [:database_id  {:optional true} [:maybe [:or :int :string]]]
   [:sql          {:optional true} [:maybe :string]]
   [:template_tags {:optional true} [:maybe [:map-of :any :any]]]])

(def ^:private QuestionParams
  "The arguments [[question-write]] contracts on. `POST /v2/question-write` declares the wire schema, with
   the enums a client is held to; this is the looser shape the domain function accepts."
  [:map
   [:method                 :string]
   [:id                     {:optional true} [:maybe [:or :int :string]]]
   [:card_type              {:optional true} [:maybe :string]]
   [:name                   {:optional true} [:maybe :string]]
   [:description            {:optional true} [:maybe :string]]
   [:query                  {:optional true} [:maybe :map]]
   [:query_handle           {:optional true} [:maybe :string]]
   [:native                 {:optional true} [:maybe NativeSource]]
   [:collection_id          {:optional true} [:maybe [:or :int :string]]]
   [:dashboard_id           {:optional true} [:maybe [:or :int :string]]]
   [:collection_position    {:optional true} [:maybe :int]]
   [:display                {:optional true} [:maybe :string]]
   [:visualization_settings {:optional true} [:maybe :map]]
   [:cache_ttl              {:optional true} [:maybe :int]]
   [:column_metadata        {:optional true} [:maybe [:sequential :map]]]
   [:archived               {:optional true} [:maybe :boolean]]])

(def ^:private MetricParams
  "The arguments [[metric-write]] contracts on. `POST /v2/metric-write` declares the wire schema."
  [:map
   [:method              :string]
   [:id                  {:optional true} [:maybe [:or :int :string]]]
   [:name                {:optional true} [:maybe :string]]
   [:description         {:optional true} [:maybe :string]]
   [:definition          {:optional true} [:maybe :map]]
   [:collection_id       {:optional true} [:maybe [:or :int :string]]]
   [:collection_position {:optional true} [:maybe :int]]
   [:archived            {:optional true} [:maybe :boolean]]])

;;; ──────────────────────────────────────────────────────────────────
;;; The query a call names
;;; ──────────────────────────────────────────────────────────────────
;;
;; Three ways in, and a call picks exactly one. `query_handle` is the one to reach for: it names the query a
;; run already validated, so what gets saved is byte-identical to what the caller saw, where re-emitting the
;; MBQL is regeneration and regeneration can quietly save a near-miss of the query that produced the number.

(defn- from-handle
  "The serialized query a `query_handle` names. It resolved once already, when the handle was minted."
  [handle]
  (let [query-map (or (some-> (handles/read-query api/*current-user-id* handle) lib/normalize)
                      (tools/teaching-error!
                       (str "No query handle " (pr-str handle) ". A handle expires, and it belongs to the "
                            "user who minted it — run the query again with `execute_query` or `execute_sql` "
                            "and save the handle that call returns.")
                       404))]
    (agent-api.query/check-shape! query-map)
    query-map))

(defn- from-portable
  "The serialized query a portable `query` payload names, through the resolution pipeline `execute_query`
   runs — the same names resolve to the same query, so a query that ran saves as the query that ran."
  [query]
  (agent-api.query/check-mbql! query)
  (-> (metabot-construct/execute-representations-query query)
      (get-in [:structured-output :query])
      lib/prepare-for-serialization))

(defn- unknown-tag-message
  [tag-name tags]
  (str "This SQL declares no `{{" tag-name "}}` variable. "
       (if-let [declared (seq (sort (keys tags)))]
         (str "It declares: " (str/join ", " (map #(str "`" % "`") declared)) ".")
         (str "It declares none at all — write `{{" tag-name "}}` into the SQL to give it one."))))

(defn- dimension-field-id
  "The field a dimension tag filters on, checked against the database the SQL runs against. A field id from
   another database would compile into a filter on a column the query cannot see."
  [mp database-id tag-name field-id]
  (let [table (some->> (:table-id (lib.metadata/field mp field-id)) (lib.metadata/table mp))]
    (when-not (= database-id (:db-id table))
      (tools/teaching-error!
       (str "`" tag-name "` filters on field " (pr-str field-id) ", which is not a field of this database. "
            "`browse_data` with `action: \"get_fields\"` returns the field ids.")))
    field-id))

(defn- dimension-attributes
  "What a dimension tag carries beyond its type: the column it filters, and the filter widget the saved
   question shows for it."
  [mp database-id tag-name {:keys [field_id widget_type]}]
  (when-not field_id
    (tools/teaching-error!
     (str "`" tag-name "` is a dimension filter, so it needs a `field_id` — the column it filters. "
          "`browse_data` with `action: \"get_fields\"` returns the field ids.")))
  (when-not widget_type
    (tools/teaching-error!
     (str "`" tag-name "` is a dimension filter, so it needs a `widget_type` — the filter the question "
          "shows for it, for example \"string/=\", \"number/between\", or \"date/all-options\".")))
  {:dimension   [:field {:lib/uuid (str (random-uuid))} (dimension-field-id mp database-id tag-name field_id)]
   :widget-type (keyword widget_type)})

(defn- template-tag
  "One `{{variable}}` of the SQL, retyped and configured as the call asked. The tag itself — its name, its id
   — comes from the SQL; a call says what kind of value it takes, never that it exists."
  [mp database-id tag-name tag {:keys [type display_name default required] :as spec}]
  (when (#{:snippet :card} (:type tag))
    (tools/teaching-error!
     (str "`" tag-name "` is a " (name (:type tag)) " reference, not a variable: Metabase resolves it "
          "against the " (name (:type tag)) " it names, and it takes no type of its own.")))
  (when-not ((set template-tag-types) type)
    (tools/teaching-error!
     (str "`" tag-name "` needs a `type` — one of " (str/join ", " template-tag-types) ".")))
  (cond-> (assoc tag :type (keyword type))
    display_name       (assoc :display-name display_name)
    (some? default)    (assoc :default default)
    (some? required)   (assoc :required required)
    (= "dimension" type) (merge (dimension-attributes mp database-id tag-name spec))))

(defn- with-template-tags
  "`query` with each declared tag configured as the call asked. A tag the SQL does not declare is a teaching
   error naming the ones it does: a variable is created by writing `{{name}}` into the SQL, and a value bound
   to a variable that is not there would silently do nothing."
  [query mp database-id tags]
  (if (empty? tags)
    query
    (lib/with-template-tags
      query
      (reduce (fn [declared [tag-name spec]]
                (let [tag-name (name tag-name)
                      tag      (or (get declared tag-name)
                                   (tools/teaching-error! (unknown-tag-message tag-name declared)))]
                  (assoc declared tag-name (template-tag mp database-id tag-name tag spec))))
              (or (lib/template-tags query) {})
              tags))))

(defn- from-native
  "The serialized native query a `native` payload names: the SQL, and the variables the call typed.

   Native permission is checked here rather than left to the save, because parsing the SQL's template tags
   reads the snippets and cards it references, and a caller who may not query the database at all should not
   learn from a refusal which of those exist."
  [{:keys [database_id sql template_tags]}]
  (when-not database_id
    (tools/teaching-error! "`native` needs a `database_id` — the database the SQL runs against."))
  (when (str/blank? sql)
    (tools/teaching-error! "`native` needs `sql` — the query to save."))
  (let [database-id (tools/resolve-id :model/Database database_id)]
    (api/read-check :model/Database database-id)
    (agent-api.query/check-native-permissions!
     database-id
     (str "Build the question with `execute_query` instead and save its `query_handle`, which runs under "
          "the query permissions you do have."))
    (let [mp (lib-be/application-database-metadata-provider database-id)]
      (-> (lib/native-query mp sql)
          (with-template-tags mp database-id template_tags)
          lib/prepare-for-serialization))))

(def ^:private query-sources
  "The three ways a call names its query. A create names exactly one; an update names at most one, and naming
   none leaves the card's query as it was."
  [:query :query_handle :native])

(defn- dataset-query
  "The query the call names, or `nil` when it names none."
  [{:keys [query query_handle native]}]
  (cond
    query        (from-portable query)
    query_handle (from-handle query_handle)
    native       (from-native native)))

;;; ──────────────────────────────────────────────────────────────────
;;; Where a card lands
;;; ──────────────────────────────────────────────────────────────────

(defn- create-collection-id
  "The collection a create saves into: the one the call named, or — when it named none — the caller's own
   personal collection.

   Absent and `null` are the same argument (a strict client spells an unset one `null`), so the top level is
   named `\"root\"` and never reached by omission. Content an agent made lands in the user's own space rather
   than in shared \"Our analytics\", which is the one place everybody sees and nobody owns."
  [collection-ref]
  (if (= :null (:kind (tools/classify-ref collection-ref)))
    (:id (collection/user->personal-collection api/*current-user-id*))
    (tools/resolve-collection-id collection-ref)))

(defn- check-one-destination!
  "A card saved inside a dashboard takes its collection from the dashboard, so naming both is naming two
   destinations. REST answers that with a mismatch error the caller cannot act on; this names the choice."
  [{:keys [collection_id dashboard_id]}]
  (when (and (some? collection_id) (some? dashboard_id))
    (tools/teaching-error!
     (str "A question saved inside a dashboard lives in that dashboard's collection, so it takes "
          "`dashboard_id` or `collection_id`, not both. Drop one."))))

;;; ──────────────────────────────────────────────────────────────────
;;; A model's column metadata
;;; ──────────────────────────────────────────────────────────────────

(def ^:private column-overrides
  "The properties a call may set on a model's column. The rest of the column — its name, its type as the
   warehouse reports it — is what the query returns and is not a call's to rewrite."
  [:display_name :description :semantic_type :visibility_type])

(defn- column-override
  [column]
  (-> (m/remove-vals nil? (select-keys column column-overrides))
      (m/update-existing :semantic_type keyword)
      (m/update-existing :visibility_type keyword)))

(defn- result-metadata
  "The card's `result_metadata` with the call's column edits merged into it.

   A model's curated columns *are* its result metadata, so an edit has to travel as the whole column list the
   query yields, not as the handful of columns the call mentioned: hand the save a partial list and it reads
   as a model with three columns."
  [query column-metadata]
  (let [inferred (or (queries/infer-metadata (lib-be/normalize-query query))
                     (tools/teaching-error!
                      (str "This query's columns cannot be read without running it, so its `column_metadata` "
                           "cannot be applied. Save the model first, then set the column metadata on it.")))
        columns  (into #{} (map :name) inferred)
        by-name  (m/index-by :name column-metadata)]
    (doseq [{column-name :name} column-metadata
            :when               (not (columns column-name))]
      (tools/teaching-error!
       (str "This query returns no column named " (pr-str column-name) ". It returns: "
            (str/join ", " (sort columns)) ".")))
    (mapv (fn [column]
            (merge column (column-override (by-name (:name column)))))
          inferred)))

(defn- check-model-columns!
  [card-type column-metadata]
  (when (and (seq column-metadata) (not= "model" card-type))
    (tools/teaching-error!
     (str "`column_metadata` curates a model's columns, and this is a " card-type
          ". Pass `card_type: \"model\"`, or drop `column_metadata`."))))

;;; ──────────────────────────────────────────────────────────────────
;;; The card a write returns
;;; ──────────────────────────────────────────────────────────────────

(defn- saved-card
  "The card a write just saved, in the projection `get_content` returns it in — so the agent can say what it
   saved, and where, without reading it back."
  [card]
  (tools/project "concise" (projections/spec :card) card))

;;; ──────────────────────────────────────────────────────────────────
;;; The card a write changes
;;; ──────────────────────────────────────────────────────────────────

(defn- writable-card
  "The card an update names, checked against the flavor the tool writes. `question_write` and `metric_write`
   are two tools because they are two contracts, and the guard is what keeps them from becoming one: without
   it, `question_write` would push a metric's query through the question path, where nothing enforces the
   single aggregation that makes it a metric."
  [id types other-tool]
  (let [card   (api/write-check :model/Card (tools/resolve-id :model/Card id))
        actual (name (:type card))]
    (when-not (types actual)
      (tools/teaching-error!
       (str "Card " (:id card) " is a " actual ", and this tool writes " (str/join " or " (sort types))
            ". Change it with `" other-tool "`.")
       400))
    card))

(defn- updates
  "The patch a call makes: the fields it named, and nothing else. A `nil` is not a value — a strict client
   sends one for every argument the call did not set — so an update changes exactly what the call spelled out
   and leaves the rest of the card as it was."
  [params ks]
  (reduce (fn [patch k]
            (cond-> patch
              (some? (get params k)) (assoc k (get params k))))
          {}
          ks))

;;; ──────────────────────────────────────────────────────────────────
;;; question_write
;;; ──────────────────────────────────────────────────────────────────

(defn- create-question!
  [{card-name :name
    :keys     [card_type description collection_id dashboard_id collection_position display
               visualization_settings cache_ttl column_metadata]
    :as       params}]
  (check-one-destination! params)
  (let [card-type (or card_type "question")
        query     (dataset-query params)]
    (check-model-columns! card-type column_metadata)
    (saved-card
     (card-write/create-card!
      (cond-> {:name                   card-name
               :type                   (keyword card-type)
               :dataset_query          query
               :display                (or display "table")
               :visualization_settings (or visualization_settings {})}
        description           (assoc :description description)
        collection_position   (assoc :collection_position collection_position)
        cache_ttl             (assoc :cache_ttl cache_ttl)
        (seq column_metadata) (assoc :result_metadata (result-metadata query column_metadata))
        dashboard_id          (assoc :dashboard_id (tools/resolve-id :model/Dashboard dashboard_id))
        (not dashboard_id)    (assoc :collection_id (create-collection-id collection_id)))))))

(defn- update-question!
  [{:keys [id card_type display column_metadata collection_id dashboard_id] :as params}]
  (check-one-destination! params)
  (let [card      (writable-card id #{"question" "model"} "metric_write")
        card-type (or card_type (name (:type card)))
        query     (dataset-query params)]
    (check-model-columns! card-type column_metadata)
    (saved-card
     (card-write/update-card!
      (:id card)
      (cond-> (updates params [:name :description :collection_position :visualization_settings :cache_ttl
                               :archived])
        card_type             (assoc :type (keyword card_type))
        display               (assoc :display display)
        query                 (assoc :dataset_query query)
        (seq column_metadata) (assoc :result_metadata
                                     (result-metadata (or query (:dataset_query card)) column_metadata))
        (some? collection_id) (assoc :collection_id (tools/resolve-collection-id collection_id))
        (some? dashboard_id)  (assoc :dashboard_id (tools/resolve-id :model/Dashboard dashboard_id)))
      false))))

(mu/defn question-write :- :map
  "Create or update a question or a model. See the tool's description on `POST /v2/question-write` for the
   argument contract."
  [{:keys [method] :as params} :- QuestionParams]
  (tools/validate-write! params {"create" [:name] "update" []})
  (if (= "create" method)
    (create-question! (tools/check-exactly-one! params query-sources))
    (update-question! (tools/check-at-most-one! params query-sources))))

;;; ──────────────────────────────────────────────────────────────────
;;; metric_write
;;; ──────────────────────────────────────────────────────────────────

(defn- check-metric-query!
  "Refuse a query that is not a metric. A metric is a single number a team agrees on: one aggregation, and at
   most one date grouping to trend it by. The app refuses the same query with `lib/can-save?`; this refusal
   says which part of the query to change."
  [query]
  (let [mp (lib-be/application-database-metadata-provider (:database query))]
    (when-not (lib/can-save? (lib/query mp query) :metric)
      (tools/teaching-error!
       (str "This query cannot be saved as a metric: a metric has exactly one aggregation (a count, a sum, "
            "an average) and at most one date grouping. Summarize by one thing, drop the other groupings, "
            "and save the rest of the query as a question with `question_write`.")))))

(defn- metric-query
  "The metric's query, resolved and checked. `nil` on an update that named none — the metric's own query
   stands."
  [definition]
  (when definition
    (let [query (from-portable definition)]
      (check-metric-query! query)
      query)))

(defn- create-metric!
  [{card-name :name :keys [description definition collection_id collection_position]}]
  (saved-card
   (card-write/create-card!
    (cond-> {:name                   card-name
             :type                   :metric
             :dataset_query          (metric-query definition)
             :display                "scalar"
             :visualization_settings {}
             :collection_id          (create-collection-id collection_id)}
      description         (assoc :description description)
      collection_position (assoc :collection_position collection_position)))))

(defn- update-metric!
  [{:keys [id definition collection_id] :as params}]
  (let [card  (writable-card id #{"metric"} "question_write")
        query (metric-query definition)]
    (saved-card
     (card-write/update-card!
      (:id card)
      (cond-> (updates params [:name :description :collection_position :archived])
        query                 (assoc :dataset_query query)
        (some? collection_id) (assoc :collection_id (tools/resolve-collection-id collection_id)))
      false))))

(mu/defn metric-write :- :map
  "Create or update a metric. See the tool's description on `POST /v2/metric-write` for the argument
   contract."
  [{:keys [method] :as params} :- MetricParams]
  (tools/validate-write! params {"create" [:name :definition] "update" []})
  (if (= "create" method)
    (create-metric! params)
    (update-metric! params)))
