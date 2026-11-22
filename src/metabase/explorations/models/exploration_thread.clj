(ns metabase.explorations.models.exploration-thread
  (:require
   [metabase.app-db.copy-spec :as app-db-copy]
   [metabase.explorations.db :as explorations.db]
   [metabase.explorations.models.exploration :as exploration]
   [metabase.explorations.schema :as explorations.schema]
   [metabase.models.interface :as mi]
   [metabase.permissions.core :as perms]
   [metabase.query-permissions.core :as query-perms]
   [metabase.util.malli :as mu]
   [metabase.util.malli.schema :as ms]
   [methodical.core :as methodical]
   [toucan2.core :as t2]))

(methodical/defmethod t2/table-name :model/ExplorationThread [_model] :exploration_thread)

(doto :model/ExplorationThread
  (derive :metabase/model)
  (derive :hook/timestamped?)
  (derive :hook/entity-id))

(t2/deftransforms :model/ExplorationThread
  {:query_plan_transcript (mi/transform-json-with-schema "exploration_thread.query_plan_transcript"
                                                         ::explorations.schema/exploration-thread.query-plan-transcript)
   :data_access_token     perms/data-access-token-transform
   :resolved_source_ids   query-perms/resolved-source-ids-transform})

(t2/define-before-insert :model/ExplorationThread
  [thread]
  (cond-> thread
    (and (:exploration_id thread) (not (contains? thread :position)))
    (assoc :position (explorations.db/next-thread-position-clause (:exploration_id thread)))))

(methodical/defmethod t2/simple-hydrate [:model/ExplorationThread :can_read]
  [_model k instance]
  (vary-meta instance assoc k (boolean (some-> (explorations.db/exploration (:exploration_id instance)) (t2/hydrate :can_read) mi/can-read?))))

(methodical/defmethod t2/batched-hydrate [:model/ExplorationThread :can_write]
  "Add whether the current user can write each ExplorationThread, which is whether they can write its parent."
  [_model k instances]
  (exploration/hydrate-can-write-from-parents k instances :exploration_id :model/Exploration))

(methodical/defmethod t2/batched-hydrate [:model/ExplorationThread :timelines]
  [_model k threads]
  (mi/instances-with-hydrated-data
   threads k
   #(group-by :exploration_thread_id
              (t2/hydrate (explorations.db/thread-timelines-for-threads (map :id threads)) :timeline))
   :id
   {:default []}))

(methodical/defmethod t2/batched-hydrate [:model/ExplorationThread :queries]
  [_model k threads]
  (mi/instances-with-hydrated-data
   threads k
   #(group-by :exploration_thread_id
              (t2/hydrate (explorations.db/queries-for-threads (map :id threads)) :interestingness_score :contextual_interestingness_score :row_count :segment_name))
   :id
   {:default []}))

;;; ---------------------------------------------------- Writes ------------------------------------------------------

(mu/defn create-threads! :- [:sequential (ms/InstanceOf :model/ExplorationThread)]
  "Insert the ExplorationThread `rows` and return the new instances, in the order of `rows`."
  [rows :- [:sequential ::explorations.schema/exploration-thread.create]]
  (explorations.db/insert-threads! rows))

(mu/defn update-threads! :- :nil
  "Apply `changes` to the ExplorationThreads with `ids`."
  [ids     :- [:sequential ms/PositiveInt]
   changes :- ::explorations.schema/exploration-thread.update]
  (when (seq ids)
    (explorations.db/update-threads! ids changes))
  nil)

(mu/defn cancel-thread!
  "Mark the uncompleted ExplorationThread with `thread-id` canceled and completed at `now`, returning the number of
  rows updated."
  [thread-id :- ms/PositiveInt
   now       :- ms/TemporalInstant]
  (explorations.db/cancel-thread! thread-id now))

(mu/defn reset-terminal-thread!
  "Reset the terminal ExplorationThread with `thread-id` to freshly started at `started-at`, if no query of it is
  still running. Returns the number of rows updated."
  [thread-id  :- ms/PositiveInt
   started-at :- ms/TemporalInstant]
  (explorations.db/reset-terminal-thread! thread-id started-at))

(mu/defn claim-thread-analysis!
  "Stamp the analysis start and completion of the ExplorationThread with `thread-id` at `now` if it has not been
  claimed, canceled, or left with pending queries. Returns the number of rows updated."
  [thread-id :- ms/PositiveInt
   now       :- ms/TemporalInstant]
  (explorations.db/claim-thread-analysis! thread-id now))

;;; ----------------------------------------------------- Specs ------------------------------------------------------

(defmethod app-db-copy/spec :model/ExplorationThread [_model]
  {:skip? false})
