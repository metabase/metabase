(ns metabase.mcp.v2.tools.content
  "The v2 MCP `get_content` tool: a batched, typed fetch over every content type an agent can
   hold a `{type, id}` pair for. Each item is scope-checked, resolved (numeric id or entity_id),
   read-checked, and projected through the shared concise/detailed machinery with per-type
   `include` sections. Items are fault-isolated: one bad id, denied read, or teaching error
   becomes that item's `{type, id, error}` object and never sinks the rest of the batch.

   Per-type notes:
   - question/model/metric ride one Card fetch; `definition` returns the stored `dataset_query`
     normalized and serialized — the numeric-id MBQL 5 shape execute_query and question_write
     accept back verbatim.
   - dashboard returns the editing skeleton (tabs, parameters with wired dashcard ids, one
     summary row per dashcard) — never the raw REST `dashcards` array.
   - alert/subscription redact recipients for non-admin callers exactly as `/api/pulse` does;
     subscription reads cover live Pulse rows and rows migrated to the notification API."
  (:require
   [clojure.string :as str]
   [metabase.comments.core :as comments]
   [metabase.documents.core :as documents]
   [metabase.documents.prose-mirror :as prose-mirror]
   [metabase.lib-be.core :as lib-be]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.mcp.v2.common :as common]
   [metabase.mcp.v2.projections :as projections]
   [metabase.mcp.v2.redaction :as redaction]
   [metabase.mcp.v2.registry :as registry]
   [metabase.mcp.v2.resolve :as v2.resolve]
   [metabase.metabot.scope :as metabot.scope]
   [metabase.metrics.core :as metrics]
   [metabase.models.interface :as mi]
   [metabase.pulse.core :as pulse]
   [metabase.queries.core :as queries]
   [metabase.transforms.core :as transforms]
   [metabase.util :as u]
   [metabase.util.json :as json]
   [metabase.util.log :as log]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(def ^:private max-items
  "Batch cap for one get_content call."
  10)

;;; --------------------------------------------- question / model / metric ----------------------------------------

(defn- card-query
  "The card's own saved query as a lib query, or nil when the stored `dataset_query` is
   empty/broken — reads degrade by dropping the query-derived keys, never by failing."
  [mp dataset-query]
  (when (and mp (map? dataset-query) (seq dataset-query))
    (try
      (lib/query mp (lib-be/normalize-query dataset-query))
      (catch Exception _ nil))))

(defn- raw-template-tags
  "The stored template-tags of a native `dataset-query`, keyed by tag name — read from whichever
   slot the query keeps them in: the legacy `[:native :template-tags]` map, or a pMBQL native
   stage's tag vector."
  [dataset-query]
  (or (not-empty (get-in dataset-query [:native :template-tags]))
      (when-let [tags (some (comp not-empty :template-tags) (:stages dataset-query))]
        (into {} (map (juxt :name identity)) tags))))

(defn- card-content-row
  [card]
  (let [dataset-query (:dataset_query card)
        native?       (= :native (some-> (:query_type card) keyword))
        mp            (some-> (:database_id card) lib-be/application-database-metadata-provider)
        query         (card-query mp dataset-query)]
    (assoc card
           :query_summary (some-> query (as-> q (try (lib/describe-query q) (catch Exception _ nil))))
           :template_tags (when native? (raw-template-tags dataset-query))
           ;; The materialized parameter list — for native cards it is derived from the raw
           ;; template tags above (same data, two views), for MBQL cards it is the stored array.
           :parameters    (if (and native? (empty? (:parameters card)))
                            (not-empty (vec (queries/card-template-tag-parameters card)))
                            (not-empty (:parameters card)))
           ::query query
           ::mp mp)))

(defn- fetch-card
  [tool-type id-or-eid]
  (let [card   (v2.resolve/resolve-and-read :model/Card id-or-eid)]
    (when (not= (:type card) tool-type)
      (let [actual (name (:type card))]
        (common/throw-teaching-error
         (format "Card %s is a %s — request it with type: \"%s\"." (:id card) actual actual))))
    (card-content-row card)))

(defn- card-definition
  [row]
  (some-> (::query row) lib/prepare-for-serialization))

;; The projections another tool also builds on — `:question` (browse_collection), `:metric`
;; (metric_write), `:document` (document_write) — are registered in [[metabase.mcp.v2.projections]],
;; the namespace every consumer requires. The ones registered below are get_content's alone.

;;; ------------------------------------------------ measure / segment ---------------------------------------------

(def ^:private measure-segment-concise-keys
  [:id :name :description :table_id :archived])

(def ^:private measure-segment-detailed-keys
  (into measure-segment-concise-keys
        [:entity_id :creator_id :created_at :updated_at]))

(doseq [type [:measure :segment]]
  (projections/register-key-projection! type measure-segment-concise-keys
                                        :detailed-keys measure-segment-detailed-keys))

(defn- fetch-measure-or-segment
  [model id-or-eid]
  (v2.resolve/resolve-and-read model id-or-eid))

(defn- measure-or-segment-definition
  "The measure's aggregation clause / segment's filter clauses in the numeric-id MBQL 5 shape,
   or nil when the stored definition can't be serialized."
  [kind row]
  (try
    (let [table          (t2/select-one :model/Table :id (:table_id row))
          mp             (lib-be/application-database-metadata-provider (:db_id table))
          metadata       (case kind
                           :measure (lib.metadata/measure mp (:id row))
                           :segment (lib.metadata/segment mp (:id row)))
          definition-key (case kind :measure :aggregation :segment :filters)]
      (some-> (:definition metadata)
              lib/prepare-for-serialization
              (get-in [:stages 0 definition-key])))
    (catch Exception _ nil)))

;;; -------------------------------------------------- dimensions --------------------------------------------------

(defn- dimensions-section
  "The `dimensions` include for metrics and measures: the same permission-filtered
   `dimensions`/`dimension_mappings` pair `GET /api/metric/:id` and `GET /api/measure/:id`
   return — computed on read but, unlike those endpoints, never persisted, so this stays within
   the tool's `readOnlyHint` contract."
  [type row]
  (let [[metadata-type model] (case type
                                :metric  [:metadata/metric :model/Card]
                                :measure [:metadata/measure :model/Measure])]
    (when-let [computed (metrics/compute-dimensions metadata-type (:id row))]
      (let [fresh (-> (t2/select-one model :id (:id row))
                      (merge computed)
                      metrics/filter-dimensions-for-user
                      ;; Both endpoints drop orphaned dimensions unless asked for them; an agent
                      ;; that grouped by one would be querying a column that no longer exists.
                      metrics/without-orphaned-dimensions)]
        ;; Encoded the way the endpoints encode them — snake_case keys and qualified type strings.
        ;; The internal shape is kebab-case and carries `:lib/source`, which no other field in this
        ;; tool's output uses and which the REST wire shape has never exposed.
        {:dimensions         (metrics/->api-dimensions (:dimensions fresh))
         :dimension_mappings (metrics/->api-dimension-mappings (:dimension_mappings fresh))}))))

;;; -------------------------------------------------- collection --------------------------------------------------

(defn- fetch-collection
  [id-or-eid]
  (v2.resolve/resolve-and-read :model/Collection id-or-eid))

;;; --------------------------------------------------- snippet ----------------------------------------------------

(def ^:private snippet-concise-keys
  [:id :name :description :content :collection_id :archived])

(def ^:private snippet-detailed-keys
  (into snippet-concise-keys
        [:entity_id :creator_id :created_at :updated_at]))

(projections/register-key-projection! :snippet snippet-concise-keys
                                      :detailed-keys snippet-detailed-keys)

(defn- fetch-snippet
  [id-or-eid]
  (v2.resolve/resolve-and-read :model/NativeQuerySnippet id-or-eid))

;;; --------------------------------------------------- document ---------------------------------------------------

;; The `:document` projection is registered in [[metabase.mcp.v2.projections]] because
;; `document_write` echoes through it too.

(defn- fetch-document
  [id-or-eid]
  (let [doc (v2.resolve/resolve-and-read-with :model/Document id-or-eid
                                              ;; `:log-view? false` — this tool is readOnlyHint, and
                                              ;; an agent's read has no business in a user's recents.
                                              (fn [id] (documents/get-document id :log-view? false)))
        ;; The Metabase-flavored Markdown body — the same text document_write's old_str edits
        ;; match against — plus the node-id -> character-offset spans the comments include
        ;; anchors threads with. A body the serializer can't render (e.g. an unrecognized node
        ;; type) degrades to the flattened plain prose, with no spans, rather than failing the
        ;; read.
        ser (try
              (documents/serialize (:document doc))
              (catch Exception e
                (log/warn e "Falling back to flattened text for document" (:id doc))
                nil))]
    (-> doc
        (assoc :content_markdown (if ser
                                   (:markdown ser)
                                   (prose-mirror/ast->text (:document doc)))
               ::document doc
               ::spans (:spans ser)))))

(defn- document-layout
  "Top-level node outline of the document's ProseMirror AST: one entry per block, with the
   embedded card id for cardEmbed nodes and the block's flattened text."
  [row]
  (mapv (fn [node]
          (u/remove-nils {:type    (:type node)
                          :card_id (when (= (:type node) prose-mirror/card-embed-type)
                                     (get-in node [:attrs :id]))
                          :text    (not-empty (prose-mirror/ast->text node))}))
        (get-in row [::document :document :content])))

(defn- comment-thread-row
  [comment-row]
  (u/remove-nils {:id                (:id comment-row)
                  :parent_comment_id (:parent_comment_id comment-row)
                  :creator           (get-in comment-row [:creator :common_name])
                  :created_at        (:created_at comment-row)
                  :is_resolved       (:is_resolved comment-row)
                  :text              (prose-mirror/ast->text (:content comment-row))}))

(defn- node-id->ancestor-ids
  "Every `_id` in the document mapped to its ancestors' `_id`s, nearest first. Blocks nested inside
   lists/blockquotes carry no span of their own (their text is re-rendered with line prefixes), so
   a comment anchored to one resolves to the nearest ancestor that does have a span. The chain has
   to be walked rather than jumping to the top-level block: layout containers (`resizeNode`,
   `flexContainer`) carry no `_id` at all, so a top-level lookup finds nothing for anything nested
   in one, while their `supportingText` children are emitted verbatim and do have spans."
  [row]
  (letfn [(walk [node ancestors]
            (let [id       (get-in node [:attrs :_id])
                  inherited (cond->> ancestors id (cons id))]
              (concat (when id [[id ancestors]])
                      (mapcat #(walk % inherited) (:content node)))))]
    (into {} (mapcat #(walk % [])) (get-in row [::document :document :content]))))

(defn- document-comments
  "The `comments` include: the document's live comment threads, grouped by the block node id
   (`child_target_id`) they anchor to, each with an `anchor` locating that block in the returned
   `markdown` — the exact `[start, end)` slice of the anchored block, joined via the serializer's
   node-id spans (a nested block rolls up to the nearest enclosing block that has one). Threads
   whose anchor id matches nothing (their block was rewritten or deleted) land in
   `orphaned_comments` instead. On
   the serializer-fallback read there are no spans at all, so every thread is returned unanchored
   under `comments` — absence of anchors there means \"unknown\", not \"orphaned\"."
  [row]
  (let [markdown   (:content_markdown row)
        spans      (::spans row)
        span-by-id (into {} (map (juxt :node-id identity)) spans)
        ancestor-ids (node-id->ancestor-ids row)
        threads    (->> (comments/comments-for-document (:id row))
                        (group-by :child_target_id)
                        (sort-by (fn [[_ cs]] ((juxt :created_at :id) (first cs))))
                        (mapv (fn [[child-id cs]]
                                (u/remove-nils
                                 {:child_target_id child-id
                                  :anchor          (when-let [{:keys [start end]}
                                                              (some span-by-id (cons child-id (ancestor-ids child-id)))]
                                                     {:start start
                                                      :end   end
                                                      :text  (subs markdown start end)})
                                  :thread          (mapv comment-thread-row cs)}))))]
    (if (nil? spans)
      {:comments threads}
      (let [{anchored true orphaned false} (group-by (comp some? :anchor) threads)]
        (cond-> {:comments (vec (sort-by #(get-in % [:anchor :start]) anchored))}
          (seq orphaned) (assoc :orphaned_comments (vec orphaned)))))))

;;; --------------------------------------------------- dashboard --------------------------------------------------

(defn- fetch-dashboard
  [id-or-eid]
  (let [dash (-> (v2.resolve/resolve-and-read :model/Dashboard id-or-eid)
                 (t2/hydrate [:dashcards :series :card] :tabs)
                 redaction/redact-dashboard)]
    (assoc (projections/dashboard-row dash) ::dashboard dash)))

(defn- dashboard-layout
  "The `layout` include: tabs with positions and the per-dashcard grid/wiring detail
   `patch_dashcard` edits — parameter mappings, inline parameters, and visualization settings
   (minus stored link-entity snapshots, which bypass read checks)."
  [row]
  (let [dash (::dashboard row)]
    {:tabs      (mapv #(select-keys % [:id :name :position]) (:tabs dash))
     :dashcards (mapv (fn [dc]
                        (-> (select-keys dc [:id :card_id :action_id :dashboard_tab_id :row :col
                                             :size_x :size_y :inline_parameters :parameter_mappings
                                             :visualization_settings])
                            (update :visualization_settings
                                    #(cond-> % (map? (:link %)) (update :link dissoc :entity)))
                            u/remove-nils))
                      (:dashcards dash))}))

;;; ----------------------------------------------------- alert ----------------------------------------------------

(defn- fetch-notification
  "Fetch + read-check one notification row of `payload-type` by numeric id. Notifications have
   no entity_id column, so entity_id strings are a teaching error for these types."
  [tool-type payload-type id-or-eid]
  (when-not (int? id-or-eid)
    (common/throw-teaching-error
     (format "%ss take a numeric id — they have no entity_id." (str/capitalize tool-type))))
  (let [notification (t2/select-one :model/Notification :id id-or-eid :payload_type payload-type)]
    (when-not (and notification (mi/can-read? notification))
      (common/throw-not-found (keyword tool-type) id-or-eid))
    (projections/notification-row
     (redaction/hydrate-and-redact-notification notification))))

;;; ------------------------------------------------- subscription -------------------------------------------------

(defn- subscription-pulse-id
  "Resolve a subscription id argument against the Pulse id space; nil when an entity_id doesn't
   resolve (the notification source is then tried)."
  [id-or-eid]
  (try
    (v2.resolve/resolve-id-or-404 :model/Pulse id-or-eid)
    (catch clojure.lang.ExceptionInfo e
      (when-not (= 404 (:status-code (ex-data e)))
        (throw e)))))

(defn- fetch-subscription
  "Dashboard subscriptions are a dual-source read: live Pulse rows (the only kind writes create
   today) and rows already migrated to the notification API as `payload_type:
   notification/dashboard`. A Pulse that exists in the pulse id space owns the id — including
   when the caller cannot read it, which collapses to not-found rather than falling through to
   an unrelated notification that happens to share the numeric id."
  [id-or-eid]
  (let [pulse-id (subscription-pulse-id id-or-eid)]
    (if (and pulse-id (t2/exists? :model/Pulse :id pulse-id :alert_condition nil))
      (let [pulse-row (pulse/retrieve-pulse pulse-id)]
        (if (and pulse-row (mi/can-read? pulse-row))
          (projections/subscription-row (redaction/redact-pulse pulse-row))
          (common/throw-not-found :subscription id-or-eid)))
      (or (when (int? id-or-eid)
            (let [notification (t2/select-one :model/Notification
                                              :id id-or-eid
                                              :payload_type :notification/dashboard)]
              (when (and notification (mi/can-read? notification))
                (projections/notification-row
                 (redaction/hydrate-and-redact-notification notification)))))
          (common/throw-not-found :subscription id-or-eid)))))

;;; --------------------------------------------------- transform --------------------------------------------------

(defn- fetch-transform
  [id-or-eid]
  (let [transform (v2.resolve/resolve-and-read-with :model/Transform id-or-eid
                                                    (fn [id] (transforms/get-transform id)))]
    (-> (select-keys transform [:id :name :description :source_type :collection_id :entity_id
                                :source_database_id :target_db_id :run_trigger :creator_id
                                :owner_user_id :owner_email :tag_ids :created_at :updated_at])
        (assoc :target   (:target transform)
               :last_run (some-> (:last_run transform)
                                 (select-keys [:id :status :start_time :end_time :message])
                                 u/remove-nils)
               ;; The target table is hydrated without its own permission check (the transform
               ;; read-check verifies source tables only), so gate it here.
               :table    (when-let [table (:table transform)]
                           (when (mi/can-read? table)
                             (select-keys table [:id :name :schema :db_id])))
               ::transform transform))))

(defn- transform-definition
  "The transform's source: query sources have their query normalized and serialized to the
   numeric-id MBQL 5 shape; other source types (e.g. python) pass through as stored."
  [row]
  (let [source (get-in row [::transform :source])]
    (if-let [query (:query source)]
      (let [mp         (some-> (:database query) lib-be/application-database-metadata-provider)
            serialized (some-> (card-query mp query) lib/prepare-for-serialization)]
        (when serialized
          (assoc (dissoc source :query) :query serialized)))
      source)))

(def ^:private transform-concise-keys
  [:id :name :description :source_type :target :collection_id :last_run])

(def ^:private transform-detailed-keys
  (into transform-concise-keys
        [:entity_id :source_database_id :target_db_id :run_trigger :creator_id :owner_user_id
         :owner_email :tag_ids :table :created_at :updated_at]))

(def ^:private transform-sample
  (-> (zipmap transform-detailed-keys (repeat "x"))
      (assoc :target {:type "x" :schema "x" :name "x"}
             :last_run {:id 1 :status "x" :start_time "x" :end_time "x" :message "x"}
             :table {:id 1 :name "x" :schema "x" :db_id 1}
             :tag_ids [1])))

(projections/register-key-projection! :transform transform-concise-keys
                                      :detailed-keys transform-detailed-keys
                                      :sample transform-sample)

;;; ------------------------------------------------ type dispatch -------------------------------------------------

;;; Include-section builders — each a `(row -> fragment-map-or-nil)`, co-located into `type->spec`
;;; below so a type declares which sections it supports, and how, in one place.

(defn- definition-include
  "A `definition` section builder that exports `row`'s query via `export-fn`, omitting the section
   when there is nothing to export."
  [export-fn]
  (fn [row]
    (when-let [definition (export-fn row)]
      {:definition definition})))

(def ^:private card-definition-include (definition-include card-definition))
(defn- fields-include [row] {:result_metadata (vec (:result_metadata row))})

(def ^:private type->spec
  "Per-type dispatch, co-located. Each entry carries the fetch fn (`:fetch`, id-or-eid ->
   permission-checked row), the extra runtime `:scope` the type needs on top of the tool's base
   `agent:resource:read`, and the `:includes` sections it supports (section name -> a
   `(row -> fragment)` builder). `:proj` (the projection key) defaults to `(keyword type)` and is
   only spelled out when it differs — a model reads with the question projection."
  {"question"     {:fetch #(fetch-card :question %)
                   :includes {"definition" card-definition-include "fields" fields-include}}
   "model"        {:proj :question   :fetch #(fetch-card :model %)
                   :includes {"definition" card-definition-include "fields" fields-include}}
   "metric"       {:fetch #(fetch-card :metric %)
                   :includes {"definition" card-definition-include
                              "dimensions" #(dimensions-section :metric %)}}
   "measure"      {:fetch #(fetch-measure-or-segment :model/Measure %)
                   :includes {"definition" (definition-include #(measure-or-segment-definition :measure %))
                              "dimensions" #(dimensions-section :measure %)}}
   "segment"      {:fetch #(fetch-measure-or-segment :model/Segment %)
                   :includes {"definition" (definition-include #(measure-or-segment-definition :segment %))}}
   "dashboard"    {:fetch fetch-dashboard
                   :includes {"parameters" (fn [row] {:parameters (vec (:parameters row))})
                              "layout"     (fn [row] {:layout (dashboard-layout row)})}}
   "document"     {:fetch fetch-document
                   :includes {"layout"   (fn [row] {:layout (document-layout row)})
                              "comments" document-comments}}
   "collection"   {:fetch fetch-collection}
   "snippet"      {:fetch fetch-snippet}
   "alert"        {:fetch #(fetch-notification "alert" :notification/card %)}
   "subscription" {:fetch fetch-subscription}
   "transform"    {:fetch fetch-transform
                   :includes {"definition" (definition-include transform-definition)}}})

(def ^:private content-types
  (vec (sort (keys type->spec))))

(def ^:private include->types
  "Which types each `include` section applies to — derived from the `:includes` each type declares
   in [[type->spec]], so the two never drift. A section is applied to each batch item whose type
   supports it and skipped for the rest, so a mixed-type batch can name a section that only some
   items have; a section no item in the batch supports is a teaching error."
  (transduce
   (mapcat (fn [[type {:keys [includes]}]]
             (for [inc-name (keys includes)] [inc-name type])))
   (completing (fn [acc [inc-name type]]
                 (update acc inc-name (fnil conj #{}) type)))
   {}
   type->spec))

(defn- check-includes!
  "Reject an `include` section that no item in the batch can supply — a caller typo, rather than
   a mixed-type batch where the section legitimately applies to only some items. `batch-types`
   is the set of item types present in the call."
  [batch-types includes]
  (doseq [inc-name includes]
    (let [applicable (get include->types inc-name)]
      (when-not (some applicable batch-types)
        (common/throw-teaching-error
         (format "`include: \"%s\"` does not apply to type%s %s — it is available for: %s."
                 inc-name
                 (if (= 1 (count batch-types)) "" "s")
                 (str/join ", " (sort batch-types))
                 (str/join ", " (sort applicable))))))))

(defn- build-include
  "Apply the `inc-name` section builder that `type` declares in [[type->spec]] to `row`, or nil
   when the type does not support the section (it is simply skipped for that item)."
  [type row inc-name]
  (when-let [builder (get-in type->spec [type :includes inc-name])]
    (builder row)))

;;; -------------------------------------------------- the handler -------------------------------------------------

(defn- content-item-result
  "Build one batch item's result: its projection (with `include` sections or `fields`
   narrowing), or the `{type, id, error}` object that keeps a failing item from sinking the
   rest of the batch. The `error` text is whatever [[common/->mcp-error-content]] judges safe to
   return, so incidental exceptions collapse to a generic internal error."
  [{:keys [include] :as args} {:keys [type id fields] :as _item}]
  (try
    (let [{:keys [proj fetch]} (type->spec type)
          proj (or proj (keyword type))
          row  (fetch id)]
      (if fields
        (common/select-fields proj (projections/project proj :detailed row) fields
                              {:response-format (:response_format args)
                               :include         include})
        (let [fmt      (common/response-format args)
              ;; Only the sections this item's type supports; the batch may name sections that
              ;; apply to other items (check-includes! has already rejected any that no item has).
              sections (filter #(contains? (get include->types %) type) (distinct include))]
          (-> (projections/project proj fmt row)
              (merge (reduce (fn [acc inc-name]
                               (merge acc (build-include type row inc-name)))
                             {}
                             sections))
              (assoc :type type)))))
    (catch Exception e
      ;; Fault isolation must not become a second, unjudged error channel: reuse the tool-level
      ;; judgment and unwrap its text back into the item's `{type, id, error}` shape.
      {:type type :id id :error (-> (common/->mcp-error-content e) :content first :text)})))

(def ^:private get-content-args-schema
  [:map {:closed true}
   [:items [:sequential {:min 1 :description "The content to fetch — up to 10 items, mixed types allowed (e.g. a dashboard and its questions in one call)."}
            [:map {:closed true}
             [:type (into [:enum {:description "The item's content type, as returned by search/browse_collection."}]
                          content-types)]
             [:id [:or
                   [:int {:description "Numeric id."}]
                   [:string {:min 1 :description "A 21-character entity_id (alerts and migrated subscriptions are numeric-only)."}]]]
             [:fields {:optional true}
              [:maybe [:sequential [:string {:min 1 :description "Dot-paths picked from this type's detailed projection (see the catalog://metabase/fields resource), item-relative inside arrays. Mutually exclusive with response_format and include."}]]]]]]]
   [:include {:optional true}
    [:maybe [:sequential [:enum {:description "Extra sections, each applied to every item whose type supports it and ignored for the rest — so a mixed-type batch can ask for several at once: definition (query-bearing types, returned as the stored query — numeric ids, the shape execute_query and question_write accept back verbatim), fields (question/model column metadata), parameters (dashboard's full parameter array), layout (dashboard grid + tabs, document block outline), dimensions (metric/measure), comments (document comment threads, each anchored into the returned content_markdown by {start, end, text} character offsets — the exact slice of the block the thread is attached to; comments attach to whole blocks, a block nested inside a list/blockquote anchors to the span of the nearest enclosing block that has one, and an empty block gives start == end; threads whose block no longer exists come back under orphaned_comments so they can be re-anchored by editing the right block, and if the document read fell back to flattened text no thread carries an anchor). A section no item in the batch supports is an error."}
                          "definition" "fields" "parameters" "layout" "dimensions" "comments"]]]]
   [:response_format {:optional true}
    [:maybe [:enum {:description "concise (default) returns each type's essential shape; detailed adds entity_id, creator, timestamps, and other secondary columns."}
             "concise" "detailed"]]]])

(registry/deftool get-content
  "Fetch content by {type, id} — the typed read for anything found via search or browse_collection. Batch up to 10 items of mixed types; each is permission-checked independently and a bad item returns {type, id, error} without failing the batch. Types: question, model, metric, measure, dashboard, document, collection, snippet, segment, alert, subscription, transform. Ids: numeric or 21-char entity_id. Concise shapes are task-focused: a question carries its source (database/table/source card), display, one-line query summary, raw template_tags (in the stored shape question_write accepts back verbatim — read-modify-write round-trips), and materialized parameters (the same tags viewed as parameters, not a second concept); a dashboard returns the editing skeleton (tabs, parameters with wired dashcard ids, one summary row per dashcard with position/size/series/inline parameters), never the raw REST dashcards; a document returns its body text as content_markdown — the same field name document_write takes and returns, so a read-modify-write needs no renaming; alerts and subscriptions return condition, schedule, channels, recipients (redacted for non-admins); a transform returns source type, target, latest run. include adds sections on demand — definition returns the stored query (numeric ids), the same shape execute_query and question_write accept, so read-modify-write round-trips; comments returns a document's threads, each anchored to the exact character range of its block in the returned markdown."
  {:name         "get_content"
   :scope        metabot.scope/agent-content-read
   :annotations  {:readOnlyHint true :idempotentHint true}
   :args         get-content-args-schema}
  [{:keys [items include] :as args} _]
  (when (> (count items) max-items)
    (common/throw-teaching-error
     (format "`items` accepts at most %d entries per call — you passed %d; split the batch."
             max-items (count items))))
  ;; Surface an invalid response_format once, before any item work.
  (common/response-format args)
  ;; Reject include sections no item in the batch supports, before any per-item work.
  (when (seq include)
    (check-includes! (into #{} (map :type) items) (distinct include)))
  (common/success-content
   (json/encode {:results (mapv #(content-item-result args %) items)})))
