(ns metabase.metabot.models.search-prompt-entity
  (:require
   [metabase.metabot.prompt-entities :as prompt-entities]
   [metabase.models.interface :as mi]
   [metabase.util.i18n :refer [tru]]
   [metabase.util.log :as log]
   [methodical.core :as methodical]
   [toucan2.core :as t2]
   [toucan2.realize :as t2.realize]))

;; TODO (Chris 2026-06-02) -- reconciliation notes; revisit together:
;;   - Rename column `prompt` -> `search_prompt` (clearer, matches the tool/embedding vocabulary).
;;     Needs a follow-up migration since v62.2026-06-02T00:00:00 is already applied.
;;   - Rename model `:model/SearchPromptEntity` -> `:model/SearchPromptEntities` (plural, like the table).
;;   - entities is a bare JSON array of {model, id, name?} with `type` (canonical/sources) as a sibling
;;     column. We should wrap the array in a map (e.g. {:type ... :entities [...] :version 1}) in future
;;     so the shape is self-describing and extensible instead of relying on a separate column.
(methodical/defmethod t2/table-name :model/SearchPromptEntity [_model] :search_prompt_entities)

(doto :model/SearchPromptEntity
  (derive :metabase/model)
  (derive :hook/timestamped?))

(t2/deftransforms :model/SearchPromptEntity
  {:entities mi/transform-json
   :type     mi/transform-keyword})

(defn- validate-entities!
  "Enforce the entities invariants on a (full or partial) instance: the list is non-empty, and a
   canonical prompt references exactly one entity. Only checks fields that are present, so partial
   updates that omit `entities` are left alone."
  [{:keys [type entities] :as instance}]
  (when (contains? instance :entities)
    (when (empty? entities)
      (throw (ex-info (tru "A search prompt must reference at least one entity.") {:status-code 400})))
    (when (and (= :canonical (some-> type keyword)) (not= 1 (count entities)))
      (throw (ex-info (tru "A canonical search prompt must reference exactly one entity.")
                      {:status-code 400})))))

(t2/define-before-insert :model/SearchPromptEntity
  [instance]
  (validate-entities! instance)
  instance)

(t2/define-before-update :model/SearchPromptEntity
  [instance]
  ;; `instance` here is the change set; FE updates send the full entity, so type+entities travel
  ;; together. (A partial update of entities alone, without type, can't cross-check the canonical
  ;; rule — acceptable for now.)
  (validate-entities! instance)
  instance)

;;; This appdb table is authoritative. After-insert/update and before-delete hooks mirror each row
;;; into a companion table in the enterprise pgvector store, which carries the embedding and serves
;;; the `search_prompt_entities` Metabot tool's similarity search. The mirror is best-effort: it
;;; no-ops (with a warning) when enterprise/pgvector is unavailable, so appdb writes never fail.

(defn- mirror!
  "Run a best-effort pgvector mirror, swallowing errors so the authoritative appdb write never fails
   because the embedding service or pgvector store is unavailable."
  [thunk]
  (try
    (thunk)
    (catch Throwable e
      (log/warn e "search_prompt_entities pgvector mirror skipped"))))

(defn- canonical? [row] (= :canonical (some-> (:type row) keyword)))

(t2/define-after-insert :model/SearchPromptEntity
  [row]
  (mirror! #(prompt-entities/upsert-prompt-entity!
             (:id row) (:prompt row) (:entities row) (:verified row) (canonical? row)))
  row)

(t2/define-after-update :model/SearchPromptEntity
  [row]
  ;; after-update hands us a lazy instance; realize it to get the full post-update row, then
  ;; re-embed unconditionally (cheap, hackathon-simple).
  (let [row (t2.realize/realize row)]
    (mirror! #(prompt-entities/upsert-prompt-entity!
               (:id row) (:prompt row) (:entities row) (:verified row) (canonical? row)))
    row))

(t2/define-before-delete :model/SearchPromptEntity
  [row]
  (mirror! #(prompt-entities/delete-prompt-entity! (:id row)))
  row)
