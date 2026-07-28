(ns metabase.osi.models.osi-ai-context
  "The `osi_ai_context` appdb table: one row per library entity holding OSI `ai_context` metadata
  (`{instructions, synonyms[], examples[]}`) for the entity identified by `entity_type`/`entity_local_id`.

  Identity is the logical `(entity_type, entity_local_id)` pair — that compound key is the primary key, so
  there is one row per entity and no surrogate id or serialization NanoID.

  This table is authoritative.
  An enterprise pgvector index (`library_entity_index`) is reconciled against this table plus live
  library membership and serves the `retrieve_library_entities` Metabot tool's similarity search.
  Writes here only nudge a targeted reconcile of the entity's slice
  ([[mirror/request-entity-sync!]]); they never touch the embedding service or the pgvector store
  themselves."
  (:require
   [clojure.string :as str]
   [metabase.app-db.core :as app-db]
   [metabase.entity-retrieval.core :as entity-retrieval]
   [metabase.entity-retrieval.mirror :as mirror]
   [metabase.models.interface :as mi]
   [metabase.models.serialization :as serdes]
   [metabase.util :as u]
   [methodical.core :as methodical]
   [toucan2.core :as t2]))

(methodical/defmethod t2/table-name :model/OsiAiContext [_model] :osi_ai_context)

(doto :model/OsiAiContext
  (derive :metabase/model)
  (derive :hook/timestamped?))

;; The logical (entity_type, entity_local_id) pair is the primary key — no surrogate id.
(methodical/defmethod t2/primary-keys :model/OsiAiContext [_model] [:entity_type :entity_local_id])

(defn ->ai-context
  "Coerce the OSI `ai_context` oneOf into the object form we store.

    \"count new signups\"  =>  {:instructions \"count new signups\"}   ; string shorthand
    {:synonyms [...]}     =>  {:synonyms [...]}                    ; already an object
    nil                   =>  nil

  Runs ahead of [[mi/json-in]], which would otherwise store the string verbatim as pre-serialized JSON."
  [ai-context]
  (if (string? ai-context) {:instructions ai-context} ai-context))

(t2/deftransforms :model/OsiAiContext
  ;; ai_context is keywordized on read so reconcile reads (:instructions ai_context) etc. directly. On write
  ;; the string shorthand is migrated to {:instructions s}, so storage is always the object form and every
  ;; write path (CRUD API, serdes import, direct appdb write) is normalized at this one boundary.
  {:ai_context {:in  (comp mi/json-in ->ai-context)
                :out mi/json-out-with-keywordization}})

;;; Card-backed entities (question/metric/model) store their `entity_type` as the canonical `card`, so one
;;; ai_context row survives a type relabel and keys on a stable `(card, entity_local_id)`. The CRUD and tool
;;; APIs still speak the real types; only the stored key is normalized. Non-card types pass through.
(t2/define-before-insert :model/OsiAiContext
  [row]
  (cond-> row
    (:entity_type row) (update :entity_type entity-retrieval/normalize-entity-type)))

;;; Each write nudges a targeted reconcile of just this entity's index slice (fire-and-forget: no-op in
;;; OSS, error-swallowing in EE), so appdb writes never fail or slow down because of the mirror. The nudge
;;; is deferred until *after* the surrounding transaction commits, so the reconcile future always reads
;;; committed state — e.g. a delete buried in a long transaction is seen as gone, GC'ing its synonym/example
;;; docs (name/description stay if the entity is still in the library), rather than racing the commit and
;;; lingering until the periodic full reconcile. Outside a transaction the write has already committed, so
;;; [[app-db/do-after-commit]] runs the nudge immediately.
(defn- nudge-entity-sync!
  "After the surrounding transaction commits, nudge a targeted reconcile of `row`'s entity slice. Returns `row`."
  [{:keys [entity_type entity_local_id] :as row}]
  (u/prog1 row
    (app-db/do-after-commit #(mirror/request-entity-sync! entity_type entity_local_id))))

(t2/define-after-insert :model/OsiAiContext [row] (nudge-entity-sync! row))
(t2/define-after-update :model/OsiAiContext [row] (nudge-entity-sync! row))
(t2/define-before-delete :model/OsiAiContext [row] (nudge-entity-sync! row))

;;; ------------------------------------------------- Serialization -------------------------------------------------
;;;
;;; A row's identity is its entity ref: `entity_type` plus the entity it describes. Rather than a separate
;;; NanoID, serdes nests the row under its entity's portable path (mirroring
;;; [[metabase.warehouse-schema.models.field-user-settings]], which hangs off its Field): the path is the
;;; entity's path plus a constant `OsiAiContext` segment. So both key columns are carried by the path —
;;; `entity_local_id` is resolved from it on import, and `entity_type` is read back from the parent segment.

(def ^:private entity-type->toucan
  "Toucan model each `entity_type` resolves to. Tables get the table-fk treatment instead.
  The card flavors (the type mirrors the agent's `read_resource` resource type) all map to Card."
  {"card"     :model/Card
   "model"    :model/Card
   "metric"   :model/Card
   "question" :model/Card
   "measure"  :model/Measure
   "segment"  :model/Segment})

(def ^:private parent-model->entity-type
  "Inverse of the parent's serdes model name back to the stored `entity_type`."
  {"Table"   "table"
   "Card"    "card"
   "Measure" "measure"
   "Segment" "segment"})

(defn- entity-parent-path
  "Portable serdes path of the entity a row describes — the path its `OsiAiContext` segment hangs under.
  A Table expands to its `[Database Schema Table]` path; card/measure/segment refs are a single segment
  keyed on the entity's `entity_id`. An unmapped type yields a raw-id segment rather than aborting export."
  [entity-type entity-local-id]
  (cond
    (= entity-type "table")           (serdes/table->path (serdes/*export-table-fk* entity-local-id))
    (entity-type->toucan entity-type) (let [model (entity-type->toucan entity-type)]
                                        [{:model (name model) :id (serdes/*export-fk* entity-local-id model)}])
    :else                             [{:model entity-type :id entity-local-id}]))

(defn- parent-path->entity
  "Inverse of [[entity-parent-path]]: resolve a parent path back to `{:entity_type :entity_local_id}` (the
  local id), or `nil` when the referenced entity is absent."
  [parent-path]
  (let [{:keys [model id]} (last parent-path)]
    (if (= model "Table")
      {:entity_type "table"
       :entity_local_id (serdes/*import-table-fk* (mapv :id parent-path))}
      (when-let [etype (parent-model->entity-type model)]
        (when-let [toucan (entity-type->toucan etype)]
          {:entity_type etype :entity_local_id (serdes/*import-fk* id toucan)})))))

(defmethod serdes/entity-id "OsiAiContext" [_ _] nil)

(defmethod serdes/generate-path "OsiAiContext" [_ {:keys [entity_type entity_local_id]}]
  (conj (vec (entity-parent-path entity_type entity_local_id))
        {:model "OsiAiContext" :id "ai_context"}))

(defmethod serdes/storage-path "OsiAiContext" [entity _ctx]
  ;; Store under a flat top-level directory rather than nesting next to the entity: serdes/storage-path-prefixes
  ;; only knows how to nest under Database/Schema/Table/Field, so a Card/Measure/Segment parent would throw.
  ;; The row's identity still lives in its nested generate-path (the on-disk :serdes/meta); this is only the
  ;; file's location. Storage dedups by `:key`, so it must be unambiguous: use the EDN of the parent's
  ;; `[model id]` pairs (ids can contain "/" and ":", so a delimiter-joined string could collide for distinct
  ;; paths). The slug is just a readable filename — the unique-name generator disambiguates it by `:key`.
  (let [parent (pop (vec (serdes/path entity)))]
    [{:label "osi_ai_context"}
     {:label (u/slugify (str/join "-" (map :id parent)) {:unicode? true})
      :key   (pr-str (mapv (juxt :model :id) parent))}]))

;; `ai_context` is a plain text blob (no FKs — instructions/synonyms/examples are free text), so it copies
;; verbatim. The key columns are carried by the path, not as fields: `entity_local_id` is resolved from the
;; parent path on import, and `entity_type` is read back from the parent segment's model.
(defmethod serdes/make-spec "OsiAiContext" [_model-name _opts]
  {:copy      [:ai_context]
   :transform {:created_at      (serdes/date)
               :updated_at      (serdes/date)
               :entity_type     {:export (constantly ::serdes/skip)
                                 :import-with-context
                                 (fn [current _ _] (:entity_type (parent-path->entity (pop (serdes/path current)))))}
               :entity_local_id {::serdes/fk true
                                 :export     (constantly ::serdes/skip)
                                 :import-with-context
                                 (fn [current _ _] (:entity_local_id (parent-path->entity (pop (serdes/path current)))))}}})

(defmethod serdes/deserialization-dependencies "OsiAiContext"
  [entity]
  ;; Depend on the entity this row describes (its parent path), so it imports after that entity exists.
  [(vec (pop (serdes/path entity)))])

(defmethod serdes/load-find-local "OsiAiContext"
  [path]
  ;; Resolve the parent path back to a local entity, then find this row by its (entity_type, local-id) key.
  (when-let [{:keys [entity_type entity_local_id]} (parent-path->entity (pop path))]
    (t2/select-one :model/OsiAiContext
                   :entity_type (entity-retrieval/normalize-entity-type entity_type)
                   :entity_local_id entity_local_id)))

(defmethod serdes/load-update! "OsiAiContext"
  [_model-name ingested local]
  ;; The default keys updates on (first (primary-keys)), which for this compound key is just :entity_type —
  ;; so it would address the wrong rows. Update by the full (entity_type, entity_local_id) key.
  (t2/update! :model/OsiAiContext
              :entity_type (:entity_type local) :entity_local_id (:entity_local_id local)
              ingested)
  (t2/select-one :model/OsiAiContext
                 :entity_type (:entity_type local) :entity_local_id (:entity_local_id local)))
