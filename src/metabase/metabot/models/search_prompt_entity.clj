(ns metabase.metabot.models.search-prompt-entity
  (:require
   [metabase.metabot.prompt-entities :as prompt-entities]
   [metabase.models.interface :as mi]
   [metabase.util.log :as log]
   [methodical.core :as methodical]
   [toucan2.core :as t2]
   [toucan2.realize :as t2.realize]))

;; TODO (Chris 2026-06-02) -- reconciliation notes from merging the pgvector mirror + tool branch
;; into this CRUD branch. Avoiding churn now; revisit together:
;;   - Rename column `prompt` -> `search_prompt` (clearer, matches the tool/embedding vocabulary).
;;     Needs a follow-up migration since v62.2026-06-02T00:00:00 is already applied.
;;   - Rename model `:model/SearchPromptEntity` -> `:model/SearchPromptEntities` (plural, like the table).
;;   - entities shape contract: the tool's scoring expects a discriminated map —
;;     {"type":"canonical","entity":{...}} or {"type":"sources","entities":[...]} — not a bare array.
;;     The CRUD POST currently accepts `:any`; tighten it to this shape (and have the FE write it).
(methodical/defmethod t2/table-name :model/SearchPromptEntity [_model] :search_prompt_entities)

(doto :model/SearchPromptEntity
  (derive :metabase/model)
  (derive :hook/timestamped?))

(t2/deftransforms :model/SearchPromptEntity
  {:entities mi/transform-json})

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

(t2/define-after-insert :model/SearchPromptEntity
  [row]
  (mirror! #(prompt-entities/upsert-prompt-entity! (:id row) (:prompt row) (:entities row) (:verified row)))
  row)

(t2/define-after-update :model/SearchPromptEntity
  [row]
  ;; after-update hands us a lazy instance; realize it to get the full post-update row, then
  ;; re-embed unconditionally (cheap, hackathon-simple).
  (let [row (t2.realize/realize row)]
    (mirror! #(prompt-entities/upsert-prompt-entity! (:id row) (:prompt row) (:entities row) (:verified row)))
    row))

(t2/define-before-delete :model/SearchPromptEntity
  [row]
  (mirror! #(prompt-entities/delete-prompt-entity! (:id row)))
  row)
