(ns metabase.osi.models.osi-ai-context
  "The `osi_ai_context` appdb table: one row per library entity holding OSI `ai_context` metadata
  (`{instructions, synonyms[], examples[]}`) for the entity identified by `entity_type`/`entity_local_id`.

  Identity is the logical `(entity_type, entity_local_id)` pair — that compound key is the primary key, so
  there is one row per entity and no surrogate id. The `entity_id` NanoID only orders exported rows.

  This table is authoritative.
  An enterprise pgvector index (`library_entity_index`) is reconciled against this table plus live
  library membership and serves the `retrieve_library_entities` Metabot tool's similarity search.
  Writes here only nudge a targeted reconcile of the entity's slice
  ([[mirror/request-entity-sync!]]); they never touch the embedding service or the pgvector store
  themselves."
  (:require
   [clojure.string :as str]
   [metabase.app-db.core :as app-db]
   [metabase.models.interface :as mi]
   [metabase.osi.schema :as osi.schema]
   [metabase.search.entity-retrieval.core :as entity-retrieval]
   [metabase.search.entity-retrieval.mirror :as mirror]
   [metabase.serialization.core :as serialization]
   [metabase.util :as u]
   [methodical.core :as methodical]
   [toucan2.core :as t2]))

(methodical/defmethod t2/table-name :model/OsiAiContext [_model] :osi_ai_context)

(doto :model/OsiAiContext
  (derive :metabase/model)
  (derive :hook/entity-id)
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
;;; A row's identity is its entity ref: `entity_type` plus the entity it describes. Rather than its `entity_id`
;;; NanoID, serdes nests the row under its entity's storage path (mirroring
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

(defmethod serialization/storage-paths :model/OsiAiContext [_ entities _ctx]
  (mapv (fn [{:keys [entity_type entity_local_id]}]
          (let [ids (if (sequential? entity_local_id) entity_local_id [entity_local_id])]
            [{:label "osi_ai_context"}
             {:label (u/slugify (str/join "-" ids) {:unicode? true})
              :key   (pr-str [entity_type entity_local_id])}]))
        entities))

;; `ai_context` is a plain text blob (no FKs — instructions/synonyms/examples are free text), so it copies
;; verbatim. The key columns are exported so the path can be rebuilt on import, and imported from that path.

(defn- walk-export-local-id
  "The ref of the entity a row describes, which `visit` resolves: a Table's reference, or the entity id of a card,
  measure or segment; an unmapped type keeps its raw id."
  [visit {:keys [entity_type entity_local_id]}]
  (cond
    (= entity_type "table")           (visit :model/Table entity_local_id)
    (entity-type->toucan entity_type) (visit (entity-type->toucan entity_type) entity_local_id)
    :else                             entity_local_id))

(defn- walk-import-local-id
  "The local id of the entity a row describes, which `visit` resolves from its ref: a Table's reference, or the entity
  id of a card, measure or segment; an unmapped type keeps its raw id."
  [visit {:keys [entity_type entity_local_id]}]
  (cond
    (= entity_type "table")           (visit :model/Table entity_local_id)
    (entity-type->toucan entity_type) (visit (entity-type->toucan entity_type) entity_local_id)
    :else                             entity_local_id))

(defmethod serialization/spec :model/OsiAiContext [_]
  {:schema    ::osi.schema/external-osi-ai-context
   :identity  [:entity_type :entity_local_id]
   :primary-key :entity_type
   :copy      [:ai_context :entity_id :entity_type]
   :transform {:entity_local_id {:export (fn [store rows _ _]
                                           (serialization/export-in-bulk store rows walk-export-local-id))
                                 :import (fn [store entities _ opts]
                                           (serialization/import-in-bulk store entities opts walk-import-local-id))}}})

(defmethod serialization/import-dependencies :model/OsiAiContext [_ entities]
  (mapv (fn [{:keys [entity_type entity_local_id]}]
          (cond
            (= entity_type "table")           #{[:model/Table entity_local_id]}
            (entity-type->toucan entity_type) #{[(entity-type->toucan entity_type) entity_local_id]}))
        entities))
