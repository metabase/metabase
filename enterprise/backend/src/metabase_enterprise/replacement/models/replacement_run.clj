(ns metabase-enterprise.replacement.models.replacement-run
  (:require
   [metabase-enterprise.replacement.db :as replacement.db]
   [metabase-enterprise.replacement.protocols :as replacement.protocols]
   [metabase-enterprise.replacement.schema :as replacement.schema]
   [metabase.app-db.copy-spec :as app-db-copy]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.models.interface :as mi]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu]
   [metabase.util.malli.schema :as ms]
   [methodical.core :as methodical]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(methodical/defmethod t2/table-name :model/ReplacementRun [_model] :source_replacement_run)

(derive :model/ReplacementRun :metabase/model)

(def ^:private terminal-statuses
  #{:succeeded :failed :canceled :timeout})

(t2/define-before-update :model/ReplacementRun
  [run]
  (let [changes (t2/changes run)]
    (cond-> run
      (and (contains? terminal-statuses (keyword (:status changes))) (not (contains? changes :end_time)))
      (assoc :end_time (mi/now)))))

(t2/deftransforms :model/ReplacementRun
  {:status             mi/transform-keyword
   :source_entity_type mi/transform-keyword
   :target_entity_type mi/transform-keyword})

(defn active-run
  "Return the single active run, or nil."
  []
  (replacement.db/active-run))

;;; ---------------------------------------------------- Writes ------------------------------------------------------

(mu/defn create-run!
  "Insert a new pending run. It becomes active when [[start-run!]] is called."
  [source-type :- ::replacement.schema/source-entity-type
   source-id   :- ::replacement.schema/source-entity-id
   target-type :- ::replacement.schema/source-entity-type
   target-id   :- ::replacement.schema/source-entity-id
   user-id     :- [:maybe ::lib.schema.id/user]]
  (replacement.db/insert-run! {:source_entity_type source-type
                               :source_entity_id   source-id
                               :target_entity_type target-type
                               :target_entity_id   target-id
                               :user_id            user-id
                               :status             :pending
                               :is_active          nil
                               :progress           0.0}))

(mu/defn start-run!
  "Mark the run with `run-id` as started and active."
  [run-id :- ::replacement.schema/run-id]
  (replacement.db/update-run! run-id
                              {:status    :started
                               :is_active true}))

(mu/defn update-progress!
  "Update progress on the active run."
  [run-id   :- ::replacement.schema/run-id
   progress :- number?]
  (replacement.db/update-active-run! run-id {:progress progress}))

(mu/defn succeed-run!
  "Mark the active run as succeeded."
  [run-id :- ::replacement.schema/run-id]
  (replacement.db/update-active-run! run-id
                                     {:status    :succeeded
                                      :progress  1.0
                                      :is_active nil}))

(mu/defn fail-run!
  "Mark the active run as failed."
  [run-id  :- ::replacement.schema/run-id
   message :- [:maybe :string]]
  (replacement.db/update-active-run! run-id
                                     {:status    :failed
                                      :is_active nil
                                      :message   message}))

(mu/defn cancel-run!
  "Mark the active run as canceled."
  [run-id :- ::replacement.schema/run-id]
  (replacement.db/update-active-run! run-id
                                     {:status    :canceled
                                      :is_active nil
                                      :message   "Canceled by user"}))

(mu/defn timeout-old-runs!
  "Time out all active runs older than `age` `unit`s."
  [age  :- ms/PositiveInt
   unit :- :keyword]
  (replacement.db/time-out-active-runs-older-than! age unit))

(def ^:private ^:const progress-batch-size
  "Write progress to DB every N items (and always on the final item)."
  50)

(defn run-row->progress
  "Return an implementation of [[replacement.protocols/IRunnerProgress]] backed by the :model/ReplacementRun
  row. Advancing is periodically flushed to the db ever 50 writes. Can provide an optional promise that will delivered
  with the following values:

  - :run/success delivered when `succeed-run` is called
  - :run/fail delivered when `fail-run!` is called
  - :run/cancelled delivered when advance checks for cancellation. Note this might not be delivered on a cancelled run
  since we do not poll the database constantly. Just at the boundary or batch edges."
  ([row]
   (run-row->progress row nil))
  ([row on-complete]
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
                 (when on-complete
                   (deliver on-complete :run/cancelled))
                 (throw (ex-info "Run canceled" {:run-id run-id})))))))
       (canceled? [_]
         (not (:is_active (replacement.db/run-active-flag run-id))))
       (start-run! [_]
         (start-run! run-id))
       (succeed-run! [_]
         (log/infof "Replacement run %d succeeded." run-id)
         (succeed-run! run-id)
         (when on-complete
           (deliver on-complete :run/success)))
       (fail-run! [_ throwable]
         (log/errorf "Replacement run %d failed: %s" run-id (ex-message throwable))
         (fail-run! run-id (ex-message throwable))
         (when on-complete
           (deliver on-complete :run/fail)))))))

;;; ----------------------------------------------------- Specs ------------------------------------------------------

(defmethod app-db-copy/spec :model/ReplacementRun [_model]
  {:skip? true})
