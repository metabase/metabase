(ns metabase.osi.models.osi-ai-context
  "The `osi_ai_context` appdb table: one row per library entity holding OSI `ai_context` metadata
  (`{instructions, synonyms[], examples[]}`) for the entity identified by `entity_type`/`entity_local_id`.

  This table is authoritative.
  An enterprise pgvector index (`library_entity_index`) is reconciled against this table plus live
  library membership and serves the `retrieve_library_entities` Metabot tool's similarity search.
  Writes here only nudge the index's background sync ([[mirror/request-sync!]]); they never touch
  the embedding service or the pgvector store themselves."
  (:require
   [metabase.entity-retrieval.mirror :as mirror]
   [metabase.models.interface :as mi]
   [metabase.models.serialization :as serdes]
   [metabase.util :as u]
   [methodical.core :as methodical]
   [toucan2.core :as t2]))

(methodical/defmethod t2/table-name :model/OsiAiContext [_model] :osi_ai_context)

(doto :model/OsiAiContext
  (derive :metabase/model)
  (derive :hook/entity-id)
  (derive :hook/timestamped?))

(t2/deftransforms :model/OsiAiContext
  ;; ai_context is keywordized on read so reconcile reads (:instructions ai_context) etc. directly.
  {:ai_context mi/transform-json})

;;; Each write nudges the enterprise background sync, which reconciles the pgvector mirror against this
;;; table. The nudge is fire-and-forget (no-op in OSS, error-swallowing in EE), so appdb writes never
;;; fail or slow down because of the mirror.

(t2/define-after-insert :model/OsiAiContext
  [row]
  (mirror/request-sync!)
  row)

(t2/define-after-update :model/OsiAiContext
  [row]
  (mirror/request-sync!)
  row)

(t2/define-before-delete :model/OsiAiContext
  [row]
  (mirror/request-sync!)
  row)

;;; ------------------------------------------------- Serialization -------------------------------------------------

;;; The entity ref is `entity_type` plus a local `entity_local_id`. On export we copy `entity_type` and
;;; swap `entity_local_id` for a portable reference (a Card's entity_id, or a Table's `[db schema table]`
;;; path), reversing it on import — mirroring `serdes/export-viz-link-card`.

(def ^:private entity-type->toucan
  "Toucan model each `entity_type` resolves to. Tables get the table-fk treatment instead.
  The card flavors (the type mirrors the agent's `read_resource` resource type) all map to Card."
  {"card"     :model/Card
   "model"    :model/Card
   "metric"   :model/Card
   "question" :model/Card
   "measure"  :model/Measure
   "segment"  :model/Segment})

(defn- export-entity-local-id [entity-type id]
  (cond
    (= entity-type "table")           (serdes/*export-table-fk* id)
    (entity-type->toucan entity-type) (serdes/*export-fk* id (entity-type->toucan entity-type))
    ;; Unmapped type: leave the raw id rather than aborting the whole export
    ;; (same forgiving behavior as serdes/export-viz-link-card).
    :else                             id))

(defn- import-entity-local-id [entity-type id]
  (cond
    (= entity-type "table")           (serdes/*import-table-fk* id)
    (entity-type->toucan entity-type) (serdes/*import-fk* id (entity-type->toucan entity-type))
    :else                             id))

;;; `ai_context` is a plain text blob (no FKs — instructions/synonyms/examples are free text), so it copies
;;; verbatim, as does `entity_type`. Only `entity_local_id` needs portable rewriting, dispatched on its
;;; row's `entity_type` — hence `:export-with-context`, which sees the whole row.
(defmethod serdes/make-spec "OsiAiContext" [_model-name _opts]
  {:copy      [:entity_id :entity_type :ai_context]
   :transform {:created_at      (serdes/date)
               :updated_at      (serdes/date)
               :entity_local_id {:export-with-context (fn [row _k id] (export-entity-local-id (:entity_type row) id))
                                 :import-with-context (fn [row _k id] (import-entity-local-id (:entity_type row) id))}}})

(defn- entity-ref-label
  "Slug source for serdes paths: the entity ref, e.g. \"metric-42\"."
  [{:keys [entity_type entity_local_id]}]
  (str entity_type "-" entity_local_id))

(defmethod serdes/hash-fields :model/OsiAiContext
  [_model]
  [:entity_type :entity_local_id])

(defmethod serdes/generate-path "OsiAiContext" [_ entity]
  (serdes/maybe-labeled "OsiAiContext" entity entity-ref-label))

(defmethod serdes/storage-path "OsiAiContext" [entity _ctx]
  [{:label "osi_ai_context"}
   {:label (u/slugify (entity-ref-label entity) {:unicode? true}) :key (:entity_id entity)}])

;; `(entity_type, entity_local_id)` has a unique constraint, but serdes identity is `entity_id`. When source and
;; destination independently minted ai_context for the same entity, their `entity_id`s differ, so the default
;; entity_id-keyed `load-find-local` misses the local row and falls through to an INSERT that violates the constraint.
;; `load-find-local` only sees the (portable) path, not the ingested row, so it can't resolve `entity_local_id` to a
;; local id; `load-one!` does see the full ingested map, so we match on the natural key here. We override `load-one!`
;; rather than `load-find-local` for that reason.
(defmethod serdes/load-one! "OsiAiContext"
  [ingested maybe-local]
  ;; Resolve the portable entity_local_id to its local id (the same way the import spec does), then find any existing
  ;; row by (entity_type, local-id) so the import updates it in place instead of inserting a duplicate.
  (let [local (or maybe-local
                  (let [{:keys [entity_type entity_local_id]} ingested
                        local-id (import-entity-local-id entity_type entity_local_id)]
                    (when (some? local-id)
                      (t2/select-one :model/OsiAiContext
                                     :entity_type entity_type
                                     :entity_local_id local-id))))]
    (serdes/default-load-one! ingested local)))

;; TODO (Chris 2026-06-24) -- this is a top-level model that *depends on* its entity, so a context row only
;; travels on export when it's independently selected.
;; We probably want the reverse: selecting an entity should pull in its ai_context (a cascade /
;; reverse-dependency), so "export the table, get its context" just works — without childifying this into
;; Table/Card/Measure/Segment.
;; Validate how serdes export selection includes a top-level model from only a dependency edge before
;; changing direction.
(defmethod serdes/dependencies "OsiAiContext"
  [{:keys [entity_type entity_local_id]}]
  ;; entity_local_id here is the exported (portable) value: a [db schema table] path for tables, an
  ;; entity_id for card/measure/segment refs.
  ;; A referenced Table is synthesized on import if missing, so (like link cards) we depend on its Database,
  ;; not the Table itself; card/measure/segment refs depend on that entity directly.
  (cond
    (= entity_type "table")           #{[{:model "Database" :id (first entity_local_id)}]}
    (entity-type->toucan entity_type) #{[{:model (name (entity-type->toucan entity_type)) :id entity_local_id}]}
    :else                             #{}))
