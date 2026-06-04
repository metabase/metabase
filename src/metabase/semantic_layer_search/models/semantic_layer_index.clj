(ns metabase.semantic-layer-search.models.semantic-layer-index
  "The `semantic_layer_index` appdb table: curated saved search prompts, each mapped to the single entity
  that answers it, plus agent-facing `usage_instructions`.

  This table is authoritative.
  An enterprise pgvector mirror carries one embedding per row and serves the `semantic_layer_search`
  Metabot tool's similarity search.
  Writes here only nudge the mirror's background sync ([[mirror/request-sync!]]); they never touch
  the embedding service or the pgvector store themselves."
  (:require
   [metabase.models.interface :as mi]
   [metabase.models.serialization :as serdes]
   [metabase.semantic-layer-search.mirror :as mirror]
   [metabase.util :as u]
   [methodical.core :as methodical]
   [toucan2.core :as t2]))

(methodical/defmethod t2/table-name :model/SemanticLayerIndex [_model] :semantic_layer_index)

(doto :model/SemanticLayerIndex
  (derive :metabase/model)
  (derive :hook/entity-id)
  (derive :hook/timestamped?))

(t2/deftransforms :model/SemanticLayerIndex
  {:entity mi/transform-json})

;;; Each write nudges the enterprise background sync, which reconciles the pgvector mirror against this
;;; table. The nudge is fire-and-forget (no-op in OSS, error-swallowing in EE), so appdb writes never
;;; fail or slow down because of the mirror.

(t2/define-after-insert :model/SemanticLayerIndex
  [row]
  (mirror/request-sync!)
  row)

(t2/define-after-update :model/SemanticLayerIndex
  [row]
  (mirror/request-sync!)
  row)

(t2/define-before-delete :model/SemanticLayerIndex
  [row]
  (mirror/request-sync!)
  row)

;;; ------------------------------------------------- Serialization -------------------------------------------------

;;; `entity` is a polymorphic reference — `{:model "table"|"card"|"model"|"metric"|"question" :id <local-id>}`.
;;; On export we swap the local id for a portable reference (a Card's entity_id, or a Table's
;;; `[db schema table]` path) and reverse it on import, mirroring `serdes/export-viz-link-card`.

(def ^:private entity-model->toucan
  "Toucan model for each entity ref `:model` string. Tables get the table-fk treatment instead.
  All the card flavors are Cards (the `:model` string mirrors the `read_resource` resource type the
  agent uses to fetch the entity, not the underlying table)."
  {"card"     :model/Card
   "model"    :model/Card
   "metric"   :model/Card
   "question" :model/Card})

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

(defmethod serdes/make-spec "SemanticLayerIndex" [_model-name _opts]
  {:copy      [:entity_id :search_prompt :usage_instructions :verified]
   :transform {:created_at (serdes/date)
               :updated_at (serdes/date)
               :entity     {:export export-entity-ref
                            :import import-entity-ref}}
   :defaults  {:verified false}})

(defmethod serdes/hash-fields :model/SemanticLayerIndex
  [_model]
  [:search_prompt])

(defmethod serdes/generate-path "SemanticLayerIndex" [_ entity]
  (serdes/maybe-labeled "SemanticLayerIndex" entity :search_prompt))

(defmethod serdes/storage-path "SemanticLayerIndex" [entity _ctx]
  [{:label "semantic_layer_index"}
   {:label (u/slugify (:search_prompt entity) {:unicode? true}) :key (:entity_id entity)}])

(defmethod serdes/dependencies "SemanticLayerIndex"
  [{{:keys [model id]} :entity}]
  ;; A referenced Table is synthesized on import if missing, so (like link cards) we depend on its Database,
  ;; not the Table itself. Card refs depend on the Card directly.
  (cond
    (= model "table")            #{[{:model "Database" :id (first id)}]}
    (entity-model->toucan model) #{[{:model "Card" :id id}]}
    :else                        #{}))
