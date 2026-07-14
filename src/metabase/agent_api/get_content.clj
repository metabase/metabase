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
   [metabase.util.json :as json]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu]
   [metabase.warehouse-schema.table :as schema.table]))

(set! *warn-on-reflection* true)

(def max-items
  "The most entities one call may name. Past this the response budget decides what comes back anyway, and a
   batch an agent cannot hold in its head is worse than two it can."
  10)

(def ^:private Params
  "The arguments [[get-content]] contracts on. `POST /v2/content` declares the wire schema, with the enums a
   client is held to; this is the looser shape the domain function accepts."
  [:map
   [:items [:sequential [:map
                         [:type :string]
                         [:id   [:or :int :string]]]]]
   [:include         {:optional true} [:maybe [:sequential :string]]]
   [:fields          {:optional true} [:maybe [:sequential :string]]]
   [:response_format {:optional true} [:maybe :string]]])

;;; ──────────────────────────────────────────────────────────────────
;;; Reading one entity
;;; ──────────────────────────────────────────────────────────────────

(def ^:private card-types
  "The three card flavors, spelled the way the tool speaks. A card row's REST `type` is already this word,
   so a `search` hit names its own type and a mismatched read can be told exactly what to ask for."
  #{"question" "model" "metric"})

(defn- with-last-edit-info
  "`record` annotated with `:last-edit-info` — who touched it last, and when. The REST read of a card and of
   a dashboard both carry it, and `detailed` is the whole REST record."
  [model record]
  (first (revisions/with-last-edit-info [record] model)))

(defn- read-card
  "The card `id` names, checked against the flavor the caller asked for. A metric is re-read through the
   metric endpoint's own function, which carries the semantic dimensions a plain card read does not."
  [type id]
  (let [card   (queries/get-card id)
        actual (name (:type card))]
    (when-not (= actual type)
      (tools/teaching-error!
       (str id " is a " actual ", not a " type ". Ask for it with type \"" actual "\".")
       404))
    (with-last-edit-info :card (if (= "metric" type)
                                 (metrics.api/get-metric id)
                                 card))))

(defn- read-dashboard
  [id]
  (->> (dashboards.read/get-dashboard id)
       (with-last-edit-info :dashboard)
       (tools/publish-read-event! :model/Dashboard)))

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
                   :concise projections/dashboard-skeleton}
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
      (tools/teaching-error!
       (str "An " type " takes a numeric id; " (pr-str id) " is not one. `search` returns the ids.")))))

(defn- project-record
  "The item's fields: its concise projection, the whole record, or the dot-paths `fields` picked out of the
   record. `fields` picks against the detailed shape, so a document's `content_markdown` is as pickable as
   any REST property is."
  [type record {:keys [response_format fields declared-paths]}]
  (let [{:keys [spec concise detailed]} (entity-types type)
        full                            ((or detailed identity) record)]
    (cond
      (seq fields)
      (first (tools/pick-fields fields [full] declared-paths))

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

(defn- sandbox-visible
  "`rows` narrowed to the columns the caller's column sandbox exposes.

   Lib's column metadata is not sandbox-aware — `batch-fetch-table-query-metadatas` is, which is why every
   other field read in this tool goes through it. Without this filter a column-restricting sandbox leaks the
   names, types, and semantic types of exactly the columns it was configured to hide, from a tool and from
   nowhere else. A column with no table (an expression, an aggregation) belongs to no sandbox and stays."
  [rows]
  (let [in-a-table (filter :table_id rows)
        visible    (into #{}
                         (mapcat val)
                         (schema.table/batch-filter-sandboxed-fields (group-by :table_id in-a-table)))]
    (filterv (fn [row] (or (nil? (:table_id row)) (contains? visible row))) rows)))

(defn- dimensions-section
  "The columns a metric can be grouped and filtered by — what a query *using* the metric may break out on,
   its own breakouts removed so the answer is what is reachable rather than what is already chosen. Not the
   metric's `dimensions` field, which is its semantic-layer definition and rides the record."
  [record]
  (let [mp    (lib-be/application-database-metadata-provider (:database_id record))
        query (lib/query mp (lib.metadata/card mp (:id record)))]
    {:dimensions (sandbox-visible
                  (mapv dimension-row (lib/filterable-columns (lib/remove-all-breakouts query))))}))

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
                         :message (str "`" include "` applies to " (section-types include)
                                       ", not to a " type ".")}))))
          element
          includes))

;;; ──────────────────────────────────────────────────────────────────
;;; One item
;;; ──────────────────────────────────────────────────────────────────

(defn- declared-paths
  "The dot-paths a `fields` pick may name across a batch of `types`: the union of the concise projections of
   the types in it. Declared once for the whole call, so a path one type carries and another does not is
   simply absent from the ones that lack it rather than an error on them — a mixed batch shares one `fields`
   list, and it is the batch the caller wrote it against."
  [types]
  (into #{}
        (mapcat #(tools/spec-paths (projections/spec (:spec (entity-types %)))))
        types))

(def ^:private char-budget
  "Characters an element may spend before it overruns the response budget on its own."
  (* 4 tools/token-budget))

(defn- longest-text-key
  [element]
  (when-let [entries (seq (filter (comp string? val) element))]
    (key (apply max-key (comp count val) entries))))

(defn- fit-element
  "An element that overruns the response budget on its own, cut down to fit: its longest text value truncated,
   and the cut named. The budgeter always emits at least one element, so without this a single long document
   body would blow the very response the budget exists to bound — and the client would hard-truncate the JSON
   mid-value, leaving the model with neither the content nor a way to ask for less."
  [element]
  (if (<= (tools/estimate-tokens element) tools/token-budget)
    element
    (if-let [k (longest-text-key element)]
      (let [text (get element k)
            room (max 200 (- char-budget (count (json/encode (dissoc element k)))))
            kept (subs text 0 (min (count text) room))]
        (assoc element
               k                   kept
               :truncated          true
               :truncation_message (str "`" (name k) "` was cut at " (count kept) " of " (count text)
                                        " characters to fit the response budget.")))
      element)))

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
   teaches an agent to read one entity at a time, which is the habit the batch exists to break.

   Only a refusal becomes an element: an `ex-info` carrying a `:status-code` is a permission denial, a 404,
   or a teaching error, and its message is written for the model to act on. Anything else is a bug, and a
   bug reported as `\"could not be read\"` sends the agent off to fix an id that was never the problem."
  [item params]
  (try
    (item-element item params)
    (catch clojure.lang.ExceptionInfo e
      (let [status (:status-code (ex-data e))]
        (when-not status
          (throw e))
        {:type   (:type item)
         :id     (:id item)
         :status status
         :error  (ex-message e)}))))

;;; ──────────────────────────────────────────────────────────────────
;;; Validation — every refusal names the fix
;;; ──────────────────────────────────────────────────────────────────

(defn- check-items!
  [items]
  (when (empty? items)
    (tools/teaching-error!
     (str "`get_content` needs `items` — up to " max-items
          " per call, each a type and an id `search` returned.")))
  (when (> (count items) max-items)
    (tools/teaching-error!
     (str "`get_content` reads at most " max-items " items per call — you asked for " (count items)
          ". Split the request."))))

;;; ──────────────────────────────────────────────────────────────────
;;; The tool
;;; ──────────────────────────────────────────────────────────────────

(defn- budget-message
  [returned requested]
  (str returned " of " requested " items returned — the rest exceeded the response budget. Ask for each "
       "omitted item on its own."))

(mu/defn get-content :- ::tools/list-response
  "Run the `get_content` tool. See the tool's description on `POST /v2/content` for the argument contract."
  [{:keys [items] :as params} :- Params]
  (check-items! items)
  (let [params                                (assoc params :declared-paths
                                                     (declared-paths (map :type items)))
        elements                              (mapv #(fit-element (item-result % params)) items)
        {:keys [included omitted truncated?]} (tools/budget-units elements {})]
    (tools/list-envelope
     included
     (cond-> {:total (count items)}
       truncated? (assoc :truncation-message (budget-message (count included) (count items))
                         :omitted            (mapv #(select-keys % [:type :id]) omitted))))))
