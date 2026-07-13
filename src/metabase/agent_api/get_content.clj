(ns metabase.agent-api.get-content
  "The v2 `get_content` tool: the generic typed fetch.

   The agent already holds `{type, id}` — `search` handed it one, `browse_collection` listed one — and
   this is where it cashes it in. One tool for all thirteen content types, because the input contract does
   not vary with the type: `{type, id}` in, that type's projection out. There is deliberately no symmetric
   `set_content`; a write's payload *does* vary with the type, and that is where genericity stops paying.

   The response is a heterogeneous array — each element echoes `type` and `id` and carries its own type's
   fields. Heterogeneity is free on a read because the server authors it and a model reads a discriminated
   union without being taught how.

   Three properties the batch has to hold, all inherited from v1's `read_resource`, which read a dashboard
   and its questions in one call:

   - **Fault isolation.** An id that names nothing, or names something the caller may not read, comes back
     as an error in its own element. It does not sink the other nine.
   - **Per-item permission filtering.** Every type reads through the domain function its REST endpoint
     calls, so the check is the app's own and cannot drift from it.
   - **Complete units.** The response budget cuts whole items and names the rest in `omitted`; half an
     entity reads as a whole entity, which is worse than an entity that says it was left out.

   Two projections are more than a subset of the REST record, and both earn it. A **dashboard**'s concise
   read is the editing skeleton — tabs, parameters, and one summary row per dashcard — never the raw
   `dashcards` array, whose every element nests the card's whole `dataset_query` and visualization
   settings, which no `dashboard_write` op consumes. The litmus: any structural op is authorable from the
   concise read alone. A **document**'s body comes back as Markdown, the dialect `document_write` takes,
   because its stored ProseMirror tree is not something an agent should have to read or write.

   `include` sections are call-level, not per-item — one list applied to every item where the section means
   something, skipped-and-named where it does not. `definition` is the one that earns its keep: it converts
   the stored numeric-ref `dataset_query` into the same portable dialect the write tools accept, so
   read → modify → write round-trips without the agent ever meeting a numeric field ref."
  (:require
   [metabase.agent-api.projections :as projections]
   [metabase.agent-api.tools :as tools]
   [metabase.agent-lib.representations.resolve :as repr.resolve]
   [metabase.api.common :as api]
   [metabase.collections.core :as collections]
   [metabase.dashboards.read :as dashboards.read]
   [metabase.documents.core :as documents]
   [metabase.lib-be.core :as lib-be]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.measures.api :as measures.api]
   [metabase.metabot.tools.shared.content-store :as content-store]
   [metabase.metrics.api :as metrics.api]
   [metabase.native-query-snippets.core :as snippets]
   [metabase.pulse.core :as pulse]
   [metabase.queries.core :as queries]
   [metabase.revisions.core :as revisions]
   [metabase.segments.api :as segments.api]
   [metabase.timeline.core :as timeline]
   [metabase.transforms.core :as transforms]
   [metabase.util :as u]
   [metabase.util.i18n :refer [tru]]
   [metabase.util.log :as log]))

(set! *warn-on-reflection* true)

(def max-items
  "The most entities one call may name. Past this the response budget decides what comes back anyway, and a
   batch an agent cannot hold in its head is worse than two it can."
  10)

;;; ──────────────────────────────────────────────────────────────────
;;; Reading one entity
;;; ──────────────────────────────────────────────────────────────────

(def ^:private card-types
  "The three card flavors, spelled the way the tool speaks. A card row's REST `type` is already this word,
   so a `search` hit names its own type and a mismatched read can be told exactly what to ask for."
  #{"question" "model" "metric"})

(defn- read-card
  "The card `id` names, checked against the flavor the caller asked for. A metric is re-read through the
   metric endpoint's own function, which carries the semantic dimensions a plain card read does not."
  [type id]
  (let [card   (queries/get-card id)
        actual (name (:type card))]
    (when-not (= actual type)
      (tools/teaching-error
       (tru "{0} is a {1}, not a {2}. Ask for it with type \"{3}\"." (str id) actual type actual)
       404))
    (if (= "metric" type)
      (metrics.api/get-metric id)
      card)))

(defn- read-dashboard
  [id]
  (tools/publish-read-event! :model/Dashboard (dashboards.read/get-dashboard id)))

(defn- read-collection
  "The collection `id` names. No read event: `GET /api/collection/:id` publishes none — a collection is
   marked viewed by opening it, which is the item listing `browse_collection` serves, not by reading its
   name off a batch."
  [id]
  (collections/get-collection (api/read-check :model/Collection id)))

(defn- read-timeline
  "A timeline with its events. The events ride the read rather than an include because their ids are the
   only handle `timeline_event_write` has, and a timeline without them is a name and nothing to act on."
  [id]
  (timeline/get-timeline id {:include-events? true}))

;;; ──────────────────────────────────────────────────────────────────
;;; The two projections that are more than a field set
;;; ──────────────────────────────────────────────────────────────────

(defn- dashcard-kind
  "What a dashcard *is*: a saved card, or one of the virtual cards the editor places — text, heading, link,
   iframe, action. The kind lives in the virtual card's `display`; a dashcard without one shows a card."
  [dashcard]
  (or (some-> (get-in dashcard [:visualization_settings :virtual_card :display]) name)
      "card"))

(defn- dashcard-row
  "One dashcard, summarized to what `dashboard_write`'s ops take: which card, where, on which tab, with what
   series and inline parameters. Everything the summary drops — the nested card, its query, its
   visualization settings — is what `include: [\"layout\"]` is for."
  [{:keys [id card_id dashboard_tab_id row col size_x size_y series inline_parameters] :as dashcard}]
  (cond-> {:id               id
           :kind             (dashcard-kind dashcard)
           :dashboard_tab_id dashboard_tab_id
           :row              row
           :col              col
           :size_x           size_x
           :size_y           size_y}
    card_id                 (assoc :card_id card_id :card_name (get-in dashcard [:card :name]))
    (seq series)            (assoc :series_card_ids (mapv :id series))
    (seq inline_parameters) (assoc :inline_parameter_ids (vec inline_parameters))))

(defn- parameter-row
  "One dashboard parameter, and the dashcards it filters. A parameter wired to nothing is a widget that does
   nothing, and that is exactly what an agent asked to fix the dashboard needs to see."
  [wired {:keys [id] :as parameter}]
  (assoc (select-keys parameter [:id :name :type])
         :dashcard_ids (vec (wired id))))

(defn- wired-dashcard-ids
  "Parameter id → the ids of the dashcards its mappings reach."
  [dashcards]
  (reduce (fn [wired {dashcard-id :id :keys [parameter_mappings]}]
            (reduce (fn [wired {:keys [parameter_id]}]
                      (update wired parameter_id (fnil conj []) dashcard-id))
                    wired
                    parameter_mappings))
          {}
          dashcards))

(defn- dashboard-skeleton
  "The concise dashboard: what a dashboard *is* structurally, and every input `dashboard_write`'s op grammar
   takes. `dashboard_write` returns this same shape on success, so a build is authorable from the write's
   own response as well as from a read."
  [{:keys [dashcards tabs parameters]} projected]
  (let [wired (wired-dashcard-ids dashcards)]
    (assoc projected
           :tabs       (mapv #(select-keys % [:id :name]) tabs)
           :parameters (mapv #(parameter-row wired %) parameters)
           :dashcards  (mapv dashcard-row dashcards))))

(defn- timeline-events
  "A timeline's events, projected. Their ids are the only handle `timeline_event_write` has on an event, so
   a timeline that listed its events without them would be a list of things nobody can edit."
  [record projected]
  (assoc projected
         :events (tools/project-all "concise" (projections/spec :timeline-event) (:events record))))

(defn- document-markdown
  "A document's prose as Markdown — the dialect `document_write` takes, and the one an agent can actually
   edit."
  [record projected]
  (assoc projected :content_markdown (documents/ast->markdown (:document record))))

(defn- whole-document
  "The document record with its body as Markdown, and without the stored ProseMirror tree: the tree is large,
   it says nothing the Markdown does not, and no agent can edit it."
  [record]
  (dissoc (document-markdown record record) :document))

;;; ──────────────────────────────────────────────────────────────────
;;; The type table
;;; ──────────────────────────────────────────────────────────────────

(def ^:private entity-types
  "Every `type` the tool reads.

   `:read` is the domain function the type's REST endpoint calls, so the permission check is the app's own.
   `:model` is what its `entity_id` translates against. `:spec` names its projection in
   [[metabase.agent-api.projections/specs]]. `:concise` and `:detailed` reshape that projection for the
   three types whose read is more than a field set — a dashboard's skeleton, a document's Markdown body, a
   timeline's events.

   `alert` has no `:model` because a notification carries no `entity_id`: it takes a numeric id, and says
   so when handed anything else."
  {"question"     {:read #(read-card "question" %) :model :model/Card       :spec :card}
   "model"        {:read #(read-card "model" %)    :model :model/Card       :spec :card}
   "metric"       {:read #(read-card "metric" %)   :model :model/Card       :spec :card}
   "measure"      {:read measures.api/get-measure  :model :model/Measure    :spec :measure}
   "segment"      {:read segments.api/get-segment  :model :model/Segment    :spec :segment}
   "collection"   {:read read-collection           :model :model/Collection :spec :collection}
   "transform"    {:read transforms/get-transform  :model :model/Transform  :spec :transform}
   "subscription" {:read pulse/get-pulse           :model :model/Pulse      :spec :subscription}
   "alert"        {:read pulse/get-alert                                    :spec :alert}
   "snippet"      {:read snippets/get-native-query-snippet
                   :model :model/NativeQuerySnippet
                   :spec  :snippet}
   "dashboard"    {:read    read-dashboard         :model :model/Dashboard  :spec :dashboard
                   :concise dashboard-skeleton}
   "timeline"     {:read    read-timeline          :model :model/Timeline   :spec :timeline
                   :concise timeline-events}
   "document"     {:read     documents/get-document :model :model/Document  :spec :document
                   :concise  document-markdown
                   :detailed whole-document}})

(def types
  "Every `type` the tool accepts."
  (vec (sort (keys entity-types))))

(defn- resolve-item-id
  "The numeric id an item names. A type whose model carries no `entity_id` column takes numbers only, and the
   refusal says so rather than 404ing on a value that was never translatable."
  [{:keys [type id]}]
  (if-let [model (:model (entity-types type))]
    (tools/resolve-id model id)
    (if (integer? id)
      id
      (tools/teaching-error
       (tru "An {0} takes a numeric id; {1} is not one. `search` returns the ids." type (pr-str id))))))

(defn- project-record
  "The item's fields: its concise projection, the whole record, or the dot-paths `fields` picked out of the
   record. `fields` picks against the detailed shape, so a document's `content_markdown` is as pickable as
   any REST property is."
  [type record {:keys [response_format fields]}]
  (let [{:keys [spec concise detailed]} (entity-types type)
        full                            ((or detailed identity) record)]
    (cond
      (seq fields)
      (first (tools/pick-fields fields [full]))

      (tools/detailed? response_format)
      full

      :else
      (let [projected (tools/project "concise" (projections/spec spec) record)]
        (if concise
          (concise record projected)
          projected)))))

;;; ──────────────────────────────────────────────────────────────────
;;; definition — the query in the dialect the write tools take
;;; ──────────────────────────────────────────────────────────────────
;;
;; A stored `dataset_query` speaks numeric refs; the write tools speak portable ones — table-name paths and
;; card entity_ids. Exporting here is the inverse of the resolution the construct pipeline performs, so a
;; read hands back exactly what a write will accept. A query the exporter cannot express comes back absent
;; rather than half-translated: a partially portable ref would still be accepted by the write tool, and it
;; would mean something else.

(defn- portable-query
  "`query`, a stored MBQL query, in the portable dialect. `nil` when it does not survive the round trip."
  [query]
  (when (seq query)
    (try
      (let [normalized (lib-be/normalize-query query)
            mp         (lib-be/application-database-metadata-provider (:database normalized))]
        (repr.resolve/try-export-query mp (lib/query mp normalized) content-store/default-store))
      (catch Exception e
        (log/warn e "Failed to export a query to its portable form")
        nil))))

(defn- portable-clauses
  "The one inner clause list a measure's or segment's `definition` is — its aggregation, or its filters — in
   the portable dialect."
  [definition clause-key]
  (get-in (portable-query definition) ["stages" 0 clause-key]))

(defn- definition-section
  [type record]
  {:definition (case type
                 ("question" "model" "metric") (portable-query (:dataset_query record))
                 "measure"                     (portable-clauses (:definition record) "aggregation")
                 "segment"                     (portable-clauses (:definition record) "filters")
                 "transform"                   (portable-query (get-in record [:source :query])))})

;;; ──────────────────────────────────────────────────────────────────
;;; The other include sections
;;; ──────────────────────────────────────────────────────────────────

(defn- fields-section
  "The columns a saved question returns. Not the source table's columns: an aggregation renames them and an
   expression invents them, and it is these names a follow-up query has to reference."
  [record]
  {:fields (tools/project-all "concise" (projections/spec :result-column) (:result_metadata record))})

(defn- parameters-section
  "A question's or dashboard's parameters in full — the widget configuration a concise read summarizes away.
   A native question's template tags come with them: they are the same filters seen from the SQL side, and an
   agent editing the SQL needs both to stay in step. A card with no query saved yet has no tags to read."
  [record]
  (let [template-tags (some-> record :dataset_query not-empty lib/all-template-tags-map)]
    (cond-> {:parameters (vec (:parameters record))}
      (seq template-tags) (assoc :template_tags template-tags))))

(defn- layout-section
  "A dashboard's dashcards as REST stores them — visualization settings, parameter mappings, series. This is
   what `patch_dashcard` edits, and the payload the concise skeleton exists to keep out of every read that
   only wanted the dashboard's name."
  [record]
  {:layout {:dashcards (vec (:dashcards record))
            :tabs      (vec (:tabs record))}})

(defn- dimension-row
  "One queryable dimension, in the property names a REST field record uses. Lib spells its column metadata in
   kebab-case and calls a field's id `:id`; the tool's vocabulary is the API's, so the names cross back here
   rather than travelling as a second dialect the agent would have to learn."
  [column]
  {:id                 (:id column)
   :name               (:name column)
   :display_name       (:display-name column)
   :description        (:description column)
   :base_type          (some-> (:base-type column) u/qualified-name)
   :semantic_type      (some-> (:semantic-type column) u/qualified-name)
   :table_id           (:table-id column)
   :fk_target_field_id (:fk-target-field-id column)})

(defn- dimensions-section
  "The columns a metric can be grouped and filtered by — what a query *using* the metric may break out on,
   its own breakouts removed so the answer is what is reachable rather than what is already chosen. Not the
   metric's `dimensions` field, which is its semantic-layer definition and rides the record."
  [record]
  (let [mp    (lib-be/application-database-metadata-provider (:database_id record))
        query (lib/query mp (lib.metadata/card mp (:id record)))]
    {:dimensions (mapv dimension-row (lib/filterable-columns (lib/remove-all-breakouts query)))}))

(def ^:private revision-entities
  "Type → the name the revision system knows it by. A card's three flavors all revise as one entity, which is
   why a metric's history reads exactly the way a question's does."
  {"question"  "card"
   "model"     "card"
   "metric"    "card"
   "dashboard" "dashboard"
   "document"  "document"
   "measure"   "measure"
   "segment"   "segment"
   "transform" "transform"})

(defn- revisions-section
  "Who changed this, when, and to what — each row carrying the `id` that `revert_content` takes."
  [type id]
  {:revisions (tools/project-all
               "concise" (projections/spec :revision)
               (revisions/revisions+details (revisions/entity->model (revision-entities type)) id))})

(def ^:private sections
  "Include → the types it means something for, and how to build it. A `:build` returns the keys it contributes
   to the element, which is why `parameters` can hand back a native question's template tags alongside them.

   A section asked for on a type it does not fit is skipped for that item and named in its result: one
   `include` list covers a mixed batch, and erroring the whole batch over a section that fits eight of its ten
   items would make the mixing pointless."
  {"definition" {:types #{"question" "model" "metric" "measure" "segment" "transform"}
                 :build (fn [type _id record] (definition-section type record))}
   "fields"     {:types card-types
                 :build (fn [_type _id record] (fields-section record))}
   "parameters" {:types (conj card-types "dashboard")
                 :build (fn [_type _id record] (parameters-section record))}
   "layout"     {:types #{"dashboard"}
                 :build (fn [_type _id record] (layout-section record))}
   "dimensions" {:types #{"metric"}
                 :build (fn [_type _id record] (dimensions-section record))}
   "revisions"  {:types (set (keys revision-entities))
                 :build (fn [type id _record] (revisions-section type id))}})

(def includes
  "Every `include` section the tool accepts."
  (vec (sort (keys sections))))

(defn- section-types
  "The types a section means something for, listed the way its skip message names them."
  [include]
  (->> (get-in sections [include :types]) sort (interpose ", ") (apply str)))

(defn- with-sections
  "`element` plus every requested section that fits its type, and a `skipped_includes` entry naming each one
   that does not."
  [element type id record includes]
  (reduce (fn [element include]
            (let [{:keys [types build]} (sections include)]
              (if (types type)
                (merge element (build type id record))
                (update element :skipped_includes (fnil conj [])
                        {:include include
                         :message (tru "`{0}` applies to {1}, not to a {2}."
                                       include (section-types include) type)}))))
          element
          includes))

;;; ──────────────────────────────────────────────────────────────────
;;; One item
;;; ──────────────────────────────────────────────────────────────────

(defn- item-element
  "One entity, read and shaped: its fields, its sections, and the `type` and `id` that address it.

   The address is written last and so always wins. Only a collection's fields contest it — a collection row
   carries a `type` column of its own, naming the special collections — and `type` means one thing across
   this catalog or it means nothing."
  [{:keys [type] :as item} {:keys [include] :as params}]
  (let [id     (resolve-item-id item)
        record ((:read (entity-types type)) id)]
    (-> (project-record type record params)
        (with-sections type id record include)
        (merge {:type type :id id}))))

(defn- item-result
  "One item's element, or — when the read refused — an error in its place. A batch that dies on its worst id
   teaches an agent to read one entity at a time, which is the habit the batch exists to break."
  [item params]
  (try
    (item-element item params)
    (catch Exception e
      {:type  (:type item)
       :id    (:id item)
       :error (or (ex-message e) (tru "Could not be read."))})))

;;; ──────────────────────────────────────────────────────────────────
;;; Validation — every refusal names the fix
;;; ──────────────────────────────────────────────────────────────────

(defn- check-items!
  [items]
  (when (empty? items)
    (tools/teaching-error
     (tru "`get_content` needs `items` — up to {0} per call, each a type and an id `search` returned."
          (str max-items))))
  (when (> (count items) max-items)
    (tools/teaching-error
     (tru "`get_content` reads at most {0} items per call — you asked for {1}. Split the request."
          (str max-items) (str (count items))))))

;;; ──────────────────────────────────────────────────────────────────
;;; The tool
;;; ──────────────────────────────────────────────────────────────────

(defn- budget-message
  [returned requested]
  (tru "{0} of {1} items returned — the rest exceeded the response budget. Ask for each omitted item on its own."
       (str returned) (str requested)))

(defn get-content
  "Run the `get_content` tool. See the tool's description on `POST /v2/content` for the argument contract."
  [{:keys [items] :as params}]
  (check-items! items)
  (let [elements                              (mapv #(item-result % params) items)
        {:keys [included omitted truncated?]} (tools/budget-units elements {})]
    (cond-> {:data     included
             :returned (count included)
             :total    (count items)}
      truncated? (assoc :truncated          true
                        :truncation_message (budget-message (count included) (count items))
                        :omitted            (mapv #(select-keys % [:type :id]) omitted)))))
