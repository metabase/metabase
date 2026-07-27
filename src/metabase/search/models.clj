(ns metabase.search.models
  (:require
   [metabase.app-db.core :as mdb]
   [metabase.app-db.dml-capture :as dml-capture]
   [metabase.search.core :as search]
   [metabase.search.ingestion :as search.ingestion]
   [metabase.search.spec :as search.spec]
   [metabase.util.log :as log]
   [toucan2.core :as t2]))

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
(derive :hook/search-index dml-capture/hook)

;; Tests that run against an old schema disable updates, and the snapshot select could read columns it lacks.
;; This runs inside the user's delete, so a search error must not fail it; the delete goes uncaptured instead.
(defmethod dml-capture/capture-fields :hook/search-index
  [model op]
  (when (and (= op :delete)
             (not search.ingestion/*disable-updates*))
    (try
      (when (search/supports-index?)
        (search.spec/hook-where-fields model))
      (catch Exception e
        (log/errorf e "Skipping search delete capture for %s" model)
        nil))))

;; Capture rows are plain raw-value maps; [[search.spec/search-models-to-update]] needs the model attached.
(defn- rows->instances
  "The capture `rows` as `model` instances."
  [model rows]
  (mapv #(t2/instance model %) rows))

(defn- submit-handoff!
  [model op thunk]
  (let [run #(try
               (thunk)
               (catch Throwable e
                 (log/errorf e "Failed search-index handoff for %s %s" model op)))]
    (if search.ingestion/*force-sync*
      (run)
      (future (run)))))

;; A database-level cascade removes rows Toucan never sees, so documents reached through a join on anything
;; but `:this.id` have to be enumerated while the delete's own rows are still there to point at them.
(defmethod dml-capture/dependents :hook/search-index
  [model rows]
  (search/cascading-documents (mapv #(t2/instance model %) rows)))

(defmethod dml-capture/captured! :hook/search-index
  [model {:keys [op rows dependents]}]
  (when (= op :delete)
    ;; Do not hand the re-derivation off until the outer transaction commits; Metabase discards the callback on
    ;; rollback.
    (let [instances (rows->instances model rows)]
      (mdb/do-after-commit
       #(submit-handoff! model op
                         (fn []
                           (search/bulk-update! instances)
                           (search/purge-vanished-documents! dependents)))))))
