(ns metabase.curated-search.models.osi-ai-context
  "The `osi_ai_context` appdb table: one row per library entity holding OSI `ai_context` metadata
  (`{instructions, synonyms[], examples[]}`) for the entity referenced by `:entity`.

  This table is authoritative.
  An enterprise pgvector index (`library_entity_index`) is reconciled against this table plus live
  library membership and serves the `retrieve_library_entities` Metabot tool's similarity search.
  Writes here only nudge the index's background sync ([[mirror/request-sync!]]); they never touch
  the embedding service or the pgvector store themselves."
  (:require
   [metabase.curated-search.mirror :as mirror]
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
  {:entity     mi/transform-json
   :ai_context mi/transform-json})

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

;;; `entity` is a polymorphic reference — `{:model "table"|"card"|"model"|"metric"|"question" :id <local-id>}`.
;;; On export we swap the local id for a portable reference (a Card's entity_id, or a Table's
;;; `[db schema table]` path) and reverse it on import, mirroring `serdes/export-viz-link-card`.

(def ^:private entity-model->toucan
  "Toucan model each entity ref `:model` string resolves to. Tables get the table-fk treatment instead.
  The card flavors (the `:model` mirrors the agent's `read_resource` resource type) all map to Card."
  {"card"     :model/Card
   "model"    :model/Card
   "metric"   :model/Card
   "question" :model/Card
   "measure"  :model/Measure
   "segment"  :model/Segment})

(defn- export-entity-ref [{:keys [model id] :as entity}]
  (cond
    (= model "table")              (assoc entity :id (serdes/*export-table-fk* id))
    (entity-model->toucan model)   (assoc entity :id (serdes/*export-fk* id (entity-model->toucan model)))
    ;; Unmapped model string: leave the ref as-is rather than aborting the whole export
    ;; (same forgiving behavior as serdes/export-viz-link-card).
    :else                          entity))

(defn- import-entity-ref [{:keys [model id] :as entity}]
  (cond
    (= model "table")            (assoc entity :id (serdes/*import-table-fk* id))
    (entity-model->toucan model) (assoc entity :id (serdes/*import-fk* id (entity-model->toucan model)))
    :else                        entity))

;;; `ai_context` is a plain text blob (no FKs — instructions/synonyms/examples are free text), so it
;;; copies verbatim. The entity ref still needs portable rewriting via the transform below.
(defmethod serdes/make-spec "OsiAiContext" [_model-name _opts]
  {:copy      [:entity_id :ai_context]
   :transform {:created_at (serdes/date)
               :updated_at (serdes/date)
               :entity     {:export export-entity-ref
                            :import import-entity-ref}}})

(defn- entity-ref-label
  "Slug source for serdes paths: the entity ref, e.g. \"metric-42\". (There is no longer a search_prompt.)"
  [{{:keys [model id]} :entity}]
  (str model "-" id))

(defmethod serdes/hash-fields :model/OsiAiContext
  [_model]
  [:entity])

(defmethod serdes/generate-path "OsiAiContext" [_ entity]
  (serdes/maybe-labeled "OsiAiContext" entity entity-ref-label))

(defmethod serdes/storage-path "OsiAiContext" [entity _ctx]
  [{:label "osi_ai_context"}
   {:label (u/slugify (entity-ref-label entity) {:unicode? true}) :key (:entity_id entity)}])

;; TODO (Chris 2026-06-24) -- this is a top-level model that *depends on* its entity, so a context row only
;; travels on export when it's independently selected.
;; We probably want the reverse: selecting an entity should pull in its ai_context (a cascade /
;; reverse-dependency), so "export the table, get its context" just works — without childifying this into
;; Table/Card/Measure/Segment.
;; Validate how serdes export selection includes a top-level model from only a dependency edge before
;; changing direction.
(defmethod serdes/dependencies "OsiAiContext"
  [{{:keys [model id]} :entity}]
  ;; A referenced Table is synthesized on import if missing, so (like link cards) we depend on its Database,
  ;; not the Table itself.
  ;; Card/measure/segment refs depend on that entity directly (its serdes model = the toucan model name).
  (cond
    (= model "table")            #{[{:model "Database" :id (first id)}]}
    (entity-model->toucan model) #{[{:model (name (entity-model->toucan model)) :id id}]}
    :else                        #{}))
