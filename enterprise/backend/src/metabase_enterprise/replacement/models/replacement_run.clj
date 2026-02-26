(ns metabase-enterprise.replacement.models.replacement-run
  (:require
   [metabase-enterprise.replacement.protocols :as replacement.protocols]
   [metabase.app-db.core :as mdb]
   [metabase.models.interface :as mi]
   [metabase.util.honey-sql-2 :as h2x]
   [metabase.util.log :as log]
   [methodical.core :as methodical]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(methodical/defmethod t2/table-name :model/ReplacementRun [_model] :source_replacement_run)

(derive :model/ReplacementRun :metabase/model)

(t2/deftransforms :model/ReplacementRun
  {:status             mi/transform-keyword
   :source_entity_type mi/transform-keyword
   :target_entity_type mi/transform-keyword})

(defn create-run!
  "Insert a new active run. Throws on duplicate key if one is already active."
  [source-type source-id target-type target-id user-id]
  (t2/insert-returning-instance! :model/ReplacementRun
                                 {:source_entity_type source-type
                                  :source_entity_id   source-id
                                  :target_entity_type target-type
                                  :target_entity_id   target-id
                                  :user_id            user-id
                                  :status             :pending
                                  :is_active          false
                                  :progress           0.0}))

(defn start-run!
  "Mark the active run as succeeded."
  [run-id]
  (t2/update! :model/ReplacementRun
              :id run-id
              {:status    :started
               :is_active true}))

(defn update-progress!
  "Update progress on the active run."
  [run-id progress]
  (t2/update! :model/ReplacementRun
              :id run-id
              :is_active true
              {:progress progress}))

(defn succeed-run!
  "Mark the active run as succeeded."
  [run-id]
  (t2/update! :model/ReplacementRun
              :id run-id
              :is_active true
              {:status    :succeeded
               :progress  1.0
               :is_active nil
               :end_time  :%now}))

(defn fail-run!
  "Mark the active run as failed."
  [run-id message]
  (t2/update! :model/ReplacementRun
              :id run-id
              :is_active true
              {:status    :failed
               :is_active nil
               :end_time  :%now
               :message   message}))

(defn cancel-run!
  "Mark the active run as canceled."
  [run-id]
  (t2/update! :model/ReplacementRun
              :id run-id
              :is_active true
              {:status    :canceled
               :is_active nil
               :end_time  :%now
               :message   "Canceled by user"}))

(defn timeout-old-runs!
  "Time out all active runs older than the specified age."
  [age unit]
  (t2/update! :model/ReplacementRun
              :is_active true
              :start_time [:< (h2x/add-interval-honeysql-form (mdb/db-type) :%now (- age) unit)]
              {:status    :timeout
               :is_active nil
               :end_time  :%now
               :message   "Timed out by metabase"}))

(defn active-run
  "Return the single active run, or nil."
  []
  (t2/select-one :model/ReplacementRun :is_active true))

(def ^:private ^:const progress-batch-size
  "Write progress to DB every N items (and always on the final item)."
  50)

(defn run-row->progress
  [row]
  (let [run-id     (:id row)
        total*     (atom 0)
        completed* (atom 0)]
    (reify replacement.protocols/IRunnerProgress
      (set-total! [_ total] (reset! total* total))
      (advance! [this] (replacement.protocols/advance! this 1))
      (advance! [this n]
        (let [c    (swap! completed* + n)
              t    @total*
              prev (- c n)
              crossed-boundary? (or (= c t)
                                    (not= (quot prev progress-batch-size)
                                          (quot c progress-batch-size)))]
          (when crossed-boundary?
            (let [progress (if (pos? t) (double (/ c t)) 0.0)]
              (update-progress! run-id progress)
              (when (replacement.protocols/canceled? this)
                (log/infof "Replacement run %d was canceled" run-id)
                (throw (ex-info "Run canceled" {:run-id run-id})))))))
      (canceled? [_]
        (not (:is_active (t2/select-one [:model/ReplacementRun :is_active] :id run-id))))
      (start-run! [_]
        (start-run! run-id))
      (succeed-run! [_]
        (log/infof "Replacement run %d succeeded." run-id)
        (succeed-run! run-id))
      (fail-run! [_ throwable]
        (log/errorf throwable "Replacement run %d failed" run-id)
        (fail-run! run-id (ex-message throwable))))))
