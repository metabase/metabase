(ns metabase.curated-search.models.curated-search-entry
  "The `osi_ai_context` appdb table: one row per library entity holding OSI `ai_context` metadata
  (`{instructions, synonyms[], examples[]}`) for the entity referenced by `:entity`.

  This table is authoritative.
  An enterprise pgvector index (`library_entity_index`) is reconciled against this table plus live
  library membership and serves the `retrieve_library_entities` Metabot tool's similarity search.
  Writes here only nudge the index's background sync ([[mirror/request-sync!]]); they never touch
  the embedding service or the pgvector store themselves.

  The model/var name (`CuratedSearchEntry`) is retained deliberately — the `curated-search` module is a
  home for information-retrieval generally, not 1:1 with this table or tool."
  (:require
   [metabase.curated-search.mirror :as mirror]
   [metabase.models.interface :as mi]
   [metabase.models.serialization :as serdes]
   [metabase.util :as u]
   [methodical.core :as methodical]
   [toucan2.core :as t2]))

(methodical/defmethod t2/table-name :model/CuratedSearchEntry [_model] :osi_ai_context)

(doto :model/CuratedSearchEntry
  (derive :metabase/model)
  (derive :hook/entity-id)
  (derive :hook/timestamped?))

(t2/deftransforms :model/CuratedSearchEntry
  ;; ai_context is keywordized on read so reconcile reads (:instructions ai_context) etc. directly.
  {:entity     mi/transform-json
   :ai_context mi/transform-json})

;;; Each write nudges the enterprise background sync, which reconciles the pgvector mirror against this
;;; table. The nudge is fire-and-forget (no-op in OSS, error-swallowing in EE), so appdb writes never
;;; fail or slow down because of the mirror.

(t2/define-after-insert :model/CuratedSearchEntry
  [row]
  (mirror/request-sync!)
  row)

(t2/define-after-update :model/CuratedSearchEntry
  [row]
  (mirror/request-sync!)
  row)

(t2/define-before-delete :model/CuratedSearchEntry
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

;;; `ai_context` is a plain text blob (no FKs — instructions/synonyms/examples are free text), so it
;;; copies verbatim. The entity ref still needs portable rewriting via the transform below.
(defmethod serdes/make-spec "CuratedSearchEntry" [_model-name _opts]
  {:copy      [:entity_id :ai_context]
   :transform {:created_at (serdes/date)
               :updated_at (serdes/date)
               :entity     {:export export-entity-ref
                            :import import-entity-ref}}})

(defn- entity-ref-label
  "Slug source for serdes paths: the entity ref, e.g. \"metric-42\". (There is no longer a search_prompt.)"
  [{{:keys [model id]} :entity}]
  (str model "-" id))

(defmethod serdes/hash-fields :model/CuratedSearchEntry
  [_model]
  [:entity])

(defmethod serdes/generate-path "CuratedSearchEntry" [_ entity]
  (serdes/maybe-labeled "CuratedSearchEntry" entity entity-ref-label))

(defmethod serdes/storage-path "CuratedSearchEntry" [entity _ctx]
  [{:label "curated_search_entries"}
   {:label (u/slugify (entity-ref-label entity) {:unicode? true}) :key (:entity_id entity)}])

(defmethod serdes/dependencies "CuratedSearchEntry"
  [{{:keys [model id]} :entity}]
  ;; A referenced Table is synthesized on import if missing, so (like link cards) we depend on its Database,
  ;; not the Table itself. Card refs depend on the Card directly.
  (cond
    (= model "table")            #{[{:model "Database" :id (first id)}]}
    (entity-model->toucan model) #{[{:model "Card" :id id}]}
    :else                        #{}))
