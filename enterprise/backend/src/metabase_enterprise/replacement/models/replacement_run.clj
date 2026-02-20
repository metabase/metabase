(ns metabase-enterprise.replacement.models.replacement-run
  (:require
   [metabase.app-db.core :as mdb]
   [metabase.models.interface :as mi]
   [metabase.util.honey-sql-2 :as h2x]
   [methodical.core :as methodical]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(methodical/defmethod t2/table-name :model/ReplacementRun [_model] :source_replacement_run)

(derive :model/ReplacementRun :metabase/model)

(t2/deftransforms :model/ReplacementRun
  {:status             mi/transform-keyword
   :source_entity_type mi/transform-keyword
   :target_entity_type mi/transform-keyword})

(defn start-run!
  "Insert a new active run. Throws on duplicate key if one is already active."
  [source-type source-id target-type target-id user-id]
  (t2/insert-returning-instance! :model/ReplacementRun
                                 {:source_entity_type source-type
                                  :source_entity_id   source-id
                                  :target_entity_type target-type
                                  :target_entity_id   target-id
                                  :user_id            user-id
                                  :status             :started
                                  :is_active          true
                                  :progress           0.0}))

(defn update-progress!
  "Update progress and message on the active run."
  [run-id progress message]
  (t2/update! :model/ReplacementRun
              :id run-id
              :is_active true
              {:progress progress
               :message  message}))

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
