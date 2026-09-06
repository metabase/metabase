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
;; Note that it might not be the model itself that depends on it, for example, Revisions are used in Card
;; entries. Don't worry about whether you've added it in the right place, we have tests to ensure that it is
;; derived if, and only if, it is required.
;;
;; All three DML operations go through the statement-level capture seam rather than row-level hooks: the
;; row-level tools realize a full instance per affected row, which is unaffordable for the bulk writes
;; search cares about, and deletes have no affordable row-level hook at all.
;;
;; Enqueued messages are re-derivations, never facts. Delivery is registered after commit, so a rollback
;; discards it and a worker never races uncommitted state. Ingestion re-reads the affected rows and its
;; asked-for-but-not-indexed diff purges entries whose backing row is gone.
;;
;; Insert hook where-values come from rows authoritatively identified by returned PKs. PK-only capture, complete
;; literal rows with explicit PKs, and a single complete literal row avoid a select; other shapes use one narrow
;; backfill query keyed by the returned PKs.
(derive :hook/search-index dml-capture/hook)

(defmethod dml-capture/capture-fields :hook/search-index
  [model _op]
  (when (search/supports-index?)
    (search.spec/hook-where-fields model)))

(defn- submit-handoff!
  [model op thunk]
  (let [run #(try
               (thunk)
               (catch Throwable e
                 (log/errorf e "Failed search-index handoff for %s %s" model op)))]
    (if search.ingestion/*force-sync*
      (run)
      (future (run)))))

(defmethod dml-capture/captured! :hook/search-index
  [model {:keys [op rows changes]}]
  ;; Capture rows are plain raw-value maps; search-models-to-update needs the model attached. Do not hand the
  ;; re-derivation off until the outer transaction commits; Metabase discards the callback on rollback.
  (mdb/do-after-commit
   (fn []
     (submit-handoff!
      model op
      (fn []
        (let [instances (mapv #(t2/instance model %) rows)]
          (case op
            (:insert :delete) (search/bulk-update! instances)
            :update           (search/bulk-update-with-changes! instances changes))))))))
