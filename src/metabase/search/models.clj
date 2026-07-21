(ns metabase.search.models
  (:require
   [metabase.app-db.dml-capture :as dml-capture]
   [metabase.search.core :as search]
   [metabase.search.spec :as search.spec]
   [toucan2.core :as t2]))

;; Models must derive from :hook/search-index if their state can influence the contents of the Search Index.
;; Note that it might not be the model itself that depends on it, for example, Revisions are used in Card
;; entries. Don't worry about whether you've added it in the right place, we have tests to ensure that it is
;; derived if, and only if, it is required.
;;
;; All three DML operations go through the statement-level capture seam rather than row-level hooks.
;;
;; Inserts: capture rides the pk-returning upgrade the after-insert tool already forced, minus the follow-up
;; SELECT * of every inserted row, and enqueues once per statement instead of once per row. Hook where-values
;; come from the insert's own row literals plus the returned pks; when a hook column is filled in by a
;; before-insert method rather than the caller (revision.most_recent), the seam back-fills it with one
;; narrow select by pk.
;;
;; Updates: no full-row re-select per statement (the after-update tool upgrades every update to return
;; instances), one narrow pre-image select instead, statement-level change information (an after-update
;; instance has none, so the per-row path fired every hook on every update), and coverage of a row's old
;; join targets as well as its new ones.
;;
;; Deletes previously had no hook at all: a before-delete would realize every matching row as a full
;; instance, which was rejected as too much of a performance risk. The enqueued messages are re-derivations,
;; so ingestion's asked-for-but-not-indexed diff purges entries whose backing row is gone, and a message
;; enqueued for a statement that later rolls back degrades to a harmless re-index of the still-live rows.
(derive :hook/search-index dml-capture/hook)

(defmethod dml-capture/capture-fields :hook/search-index
  [model _op]
  (when (search/supports-index?)
    (search.spec/hook-where-fields model)))

(defmethod dml-capture/captured! :hook/search-index
  [model {:keys [op rows changes]}]
  ;; capture rows are plain raw-value maps; search-models-to-update needs the model attached.
  (let [instances (map #(t2/instance model %) rows)]
    (case op
      (:insert :delete) (search/bulk-update! instances)
      :update           (search/bulk-update-with-changes! instances changes))))
