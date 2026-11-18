(ns metabase.osi.models.osi-ai-context
  "The `osi_ai_context` appdb table: one row per library entity holding OSI `ai_context` metadata
  (`{instructions, synonyms[], examples[]}`) for the entity identified by `entity_type`/`entity_local_id`.

  Identity is the logical `(entity_type, entity_local_id)` pair, unique in the table, so there is one row per entity.
  The `entity_id` NanoID only orders exported rows.

  This table is authoritative.
  An enterprise pgvector index (`library_entity_index`) is reconciled against this table plus live
  library membership and serves the `retrieve_library_entities` Metabot tool's similarity search.
  Writes here only nudge a targeted reconcile of the entity's slice
  ([[mirror/request-entity-sync!]]); they never touch the embedding service or the pgvector store
  themselves."
  (:require
   [metabase.app-db.core :as app-db]
   [metabase.models.interface :as mi]
   [metabase.osi.schema :as osi.schema]
   [metabase.osi.serialization :as osi.serialization]
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

(t2/deftransforms :model/OsiAiContext
  ;; ai_context is keywordized on read so reconcile reads (:instructions ai_context) etc. directly. On write
  ;; the string shorthand is migrated to {:instructions s}, so storage is always the object form and every
  ;; write path (CRUD API, serdes import, direct appdb write) is normalized at this one boundary.
  {:ai_context {:in  (comp mi/json-in osi.schema/normalize-ai-context)
                :out mi/json-out-with-keywordization}})

;;; Card-backed entities (question/metric/model) store their `entity_type` as the canonical `card`, so one
;;; ai_context row survives a type relabel and keys on a stable `(card, entity_local_id)`. The CRUD and tool
;;; APIs still speak the real types; only the stored key is normalized. Non-card types pass through.
(t2/define-before-insert :model/OsiAiContext
  [row]
  (update row :entity_type entity-retrieval/normalize-entity-type))

(t2/define-before-update :model/OsiAiContext
  [row]
  (cond-> row
    (contains? (t2/changes row) :entity_type) (update :entity_type entity-retrieval/normalize-entity-type)))

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

(defmethod serialization/spec :model/OsiAiContext [_]
  {:schema              ::osi.schema/external-osi-ai-context
   :identity            [:entity_type :entity_local_id]
   :copy                [:ai_context :entity_id :entity_type]
   :transform           {:entity_local_id {:export osi.serialization/export-local-ids
                                           :import osi.serialization/import-local-ids}}
   :storage-paths       osi.serialization/storage-paths
   :import-dependencies osi.serialization/import-dependencies
   :rows-by-refs        serialization/osi-ai-context-rows-by-refs})
