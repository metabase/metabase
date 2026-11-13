(ns metabase.search.models
  (:require
   [metabase.app-db.dml-capture :as dml-capture]
   [metabase.search.core :as search]
   [metabase.search.ingestion :as search.ingestion]
   [metabase.search.spec :as search.spec]
   [metabase.util.log :as log]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

;; Models must derive from :hook/search-index if their state can influence the contents of the Search Index.
;; Note that it might not be the model itself that depends on it, for example, Dashcards are used in Card entries.
;; Don't worry about whether you've added it in the right place, we have tests to ensure that it is derived if, and only
;; if, it is required.

(t2/define-after-insert :hook/search-index
  [instance]
  (search/update! instance true)
  instance)

(t2/define-after-update :hook/search-index
  [instance]
  (search/update! instance)
  nil)

;; Deletes have no affordable row-level hook: a before-delete realizes every matching row as a full instance,
;; which was rejected as too much of a performance risk.
;; The capture seam instead snapshots only the columns the hooks' where-clauses read, once per delete statement.
;;
;; Enqueued messages are re-derivations, never facts.
;; Delivery is registered after commit, so a rollback discards it and a worker never races uncommitted state.
;; Ingestion re-reads the affected rows, and its asked-for-but-not-indexed diff purges entries named by their own
;; id whose backing row is gone.
;;
;; The `:hook/search-index` keyword carries the row-level insert/update hooks as well, and some models that feed
;; search documents are deliberately kept out of it.
;; They still need their deletes captured, so delete capture hangs off its own keyword, which
;; `:hook/search-index` derives from, and which such models (ModelIndex, in its own namespace) derive directly.
(derive :hook/search-index-delete dml-capture/hook)
(derive :hook/search-index :hook/search-index-delete)

;; Tests that run against an old schema disable updates, and the snapshot select could read columns it lacks.
(defmethod dml-capture/capture-fields :hook/search-index-delete
  [model op]
  (when (and (= op :delete)
             (not search.ingestion/*disable-updates*)
             (search/supports-index?))
    (search.spec/hook-where-fields model)))

;; Capture rows are plain raw-value maps; [[search.spec/search-models-to-update]] needs the model attached.
(defn- rows->instances
  "The capture `rows` as `model` instances."
  [model rows]
  (mapv #(t2/instance model %) rows))

;; A database-level cascade removes rows Toucan never sees, so documents reached through a join on anything but
;; `:this.id` have to be enumerated while the delete's own rows are still there to point at them.
;; This runs inside the user's delete, so a search bug must not fail it: an error skips the enumeration and leaves
;; those documents to the scheduled reindex.
;; [[search/cascading-documents]] already catches each search-model's query failure once that query's own nested
;; transaction has rolled back; this catch covers the rest, which runs no SQL.
(defmethod dml-capture/dependents :hook/search-index-delete
  [model rows]
  (try
    (search/cascading-documents (rows->instances model rows))
    ;; Skipping is ours to decide, but the caller's interrupt is not ours to clear.
    (catch InterruptedException e
      (.interrupt (Thread/currentThread))
      (log/errorf e "Interrupted; skipping search cascade enumeration for %s" model)
      nil)
    (catch Exception e
      (log/errorf e "Skipping search cascade enumeration for %s" model)
      nil)))

(defmethod dml-capture/captured! :hook/search-index-delete
  [model {:keys [op rows dependents]}]
  (when (= op :delete)
    ;; Do not hand the re-derivation off until the outer transaction commits; Metabase discards the callback on
    ;; rollback.
    ;; A step with nothing to do is left out, and so is the whole handoff, so a revision or review prune that feeds
    ;; no document neither holds its rows until commit nor registers a callback.
    (let [instances (rows->instances model rows)
          steps     (cond-> []
                      (search/feeds-documents? instances)
                      (conj (fn [] (search/bulk-update! instances)))

                      (seq dependents)
                      (conj (fn [] (search/reconcile-cascading-documents! dependents))))]
      (when (seq steps)
        (apply search/after-commit! (format "%s %s" model op) steps)))))
