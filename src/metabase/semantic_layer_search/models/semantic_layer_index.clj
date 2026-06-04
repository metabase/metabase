(ns metabase.semantic-layer-search.models.semantic-layer-index
  "The `semantic_layer_index` appdb table: curated saved search prompts, each mapped to the entities that
  answer it, plus agent-facing `usage_instructions`.

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
   [metabase.util.i18n :refer [tru]]
   [methodical.core :as methodical]
   [toucan2.core :as t2]))

(methodical/defmethod t2/table-name :model/SemanticLayerIndex [_model] :semantic_layer_index)

(doto :model/SemanticLayerIndex
  (derive :metabase/model)
  (derive :hook/entity-id)
  (derive :hook/timestamped?))

(t2/deftransforms :model/SemanticLayerIndex
  {:entities mi/transform-json
   :type     mi/transform-keyword})

(defn- validate-entities!
  "Enforce the entities invariants: the list is non-empty, and a canonical entry references exactly one
  entity.
  Only checks fields that are present, so partial updates that omit `entities` are left alone."
  [{:keys [type entities] :as instance}]
  (when (contains? instance :entities)
    (when (empty? entities)
      (throw (ex-info (tru "A semantic layer entry must reference at least one entity.")
                      {:status-code 400})))
    (when (and (= :canonical (some-> type keyword)) (not= 1 (count entities)))
      (throw (ex-info (tru "A canonical semantic layer entry must reference exactly one entity.")
                      {:status-code 400})))))

(t2/define-before-insert :model/SemanticLayerIndex
  [instance]
  (validate-entities! instance)
  instance)

(t2/define-before-update :model/SemanticLayerIndex
  [instance]
  ;; `instance` here is the change set; the admin UI sends the full entity, so type+entities travel
  ;; together. (A partial update of entities alone, without type, can't cross-check the canonical
  ;; rule — acceptable.)
  (validate-entities! instance)
  instance)

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

;;; `entities` is a polymorphic list of references — each `{:model "table"|"card"|"model"|"metric" :id <local-id>}`.
;;; On export we swap each local id for a portable reference (a Card's entity_id, or a Table's
;;; `[db schema table]` path) and reverse it on import, mirroring `serdes/export-viz-link-card`.

(def ^:private entity-model->toucan
  "Toucan model for each `entities` ref `:model` string. Tables get the table-fk treatment instead.
  `metric`/`model`/`card` are all Cards (the `:model` string mirrors the `read_resource` resource type the
  agent uses to fetch the entity, not the underlying table)."
  {"card"   :model/Card
   "model"  :model/Card
   "metric" :model/Card})

(defn- export-entity-ref [{:keys [model id] :as entity}]
  (assoc entity :id (if (= model "table")
                      (serdes/*export-table-fk* id)
                      (serdes/*export-fk* id (entity-model->toucan model)))))

(defn- import-entity-ref [{:keys [model id] :as entity}]
  (assoc entity :id (if (= model "table")
                      (serdes/*import-table-fk* id)
                      (serdes/*import-fk* id (entity-model->toucan model)))))

(defmethod serdes/make-spec "SemanticLayerIndex" [_model-name _opts]
  {:copy      [:entity_id :search_prompt :usage_instructions :verified]
   :transform {:created_at (serdes/date)
               :updated_at (serdes/date)
               :type       (serdes/kw)
               :entities   {:export #(mapv export-entity-ref %)
                            :import #(mapv import-entity-ref %)}}
   :defaults  {:verified false}})

(defmethod serdes/hash-fields :model/SemanticLayerIndex
  [_model]
  [:search_prompt :type])

(defmethod serdes/generate-path "SemanticLayerIndex" [_ entity]
  (serdes/maybe-labeled "SemanticLayerIndex" entity :search_prompt))

(defmethod serdes/storage-path "SemanticLayerIndex" [entity _ctx]
  [{:label "semantic_layer_index"}
   {:label (u/slugify (:search_prompt entity) {:unicode? true}) :key (:entity_id entity)}])

(defmethod serdes/dependencies "SemanticLayerIndex"
  [{:keys [entities]}]
  ;; A referenced Table is synthesized on import if missing, so (like link cards) we depend on its Database,
  ;; not the Table itself. Card refs depend on the Card directly.
  (into #{} (for [{:keys [model id]} entities]
              (if (= model "table")
                [{:model "Database" :id (first id)}]
                [{:model "Card" :id id}]))))
