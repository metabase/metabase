(ns metabase.models.task-history
  (:require [metabase.models.interface :as i]
            [metabase.util :as u]
            [metabase.util.schema :as su]
            [schema.core :as s]
            [toucan
             [db :as db]
             [models :as models]]))

(models/defmodel TaskHistory :task_history)

(defn cleanup-task-history!
  "Deletes older TaskHistory rows. Will order TaskHistory by `ended_at` and delete everything after
  `num-rows-to-keep`. This is intended for a quick cleanup of old rows."
  [num-rows-to-keep]
  ;; Ideally this would be one query, but MySQL does not allow nested queries with a limit. The query below orders the
  ;; tasks by the time they finished, newest first. Then finds the first row after skipping `num-rows-to-keep`. Using
  ;; the date that task finished, it deletes everything after that. As we continue to add TaskHistory entries, this
  ;; ensures we'll have a good amount of history for debugging/troubleshooting, but not grow too large and fill the
  ;; disk.
  (when-let  [clean-before-date (db/select-one-field :ended_at TaskHistory {:limit    1
                                                                            :offset   num-rows-to-keep
                                                                            :order-by [[:ended_at :desc]]})]
    (db/simple-delete! TaskHistory :ended_at [:<= clean-before-date])))

(u/strict-extend (class TaskHistory)
  models/IModel
  (merge models/IModelDefaults
         {:types (constantly {:task_details :json})})
  i/IObjectPermissions
  (merge i/IObjectPermissionsDefaults
         {:can-read?  i/superuser?
          :can-write? i/superuser?}))

(s/defn all
  "Return all TaskHistory entries, applying `limit` and `offset` if not nil"
  [limit :- (s/maybe su/IntGreaterThanZero)
   offset :- (s/maybe su/IntGreaterThanOrEqualToZero)]
  (db/select TaskHistory (merge {:order-by [[:ended_at :desc]]}
                                (when limit
                                  {:limit limit})
                                (when offset
                                  {:offset offset}))))
