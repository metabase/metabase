(ns metabase-enterprise.library-branching.task-cleanup
  "A daily job that deletes old task rows of library branching.")

(set! *warn-on-reflection* true)

(def retention-days
  "The number of days that an ended task row stays."
  30)

(defn delete-old-tasks!
  "Deletes each ended task row that started more than [[retention-days]] days ago. An open row stays. Returns the
  number of rows deleted."
  []
  (throw (ex-info "Not implemented yet: delete-old-tasks!" {})))
