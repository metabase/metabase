(ns metabase-enterprise.introspector.workload.weights
  "Maps a Quartz trigger to its expected sub-operation count.
   One defmethod per job-type. Add new types here; everything else picks them up."
  (:require
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(defmulti weight-for
  "Expected number of sub-operations a trigger will produce on a single fire.
   Returns >= 1 — a job that fires is at least 1 unit of work."
  (fn [job-type _entity-id] job-type))

(defmethod weight-for :sync [_ db-id]
  (max 1 (or (when db-id
               (t2/count :model/Table
                         :db_id db-id
                         :active true
                         :visibility_type nil))
             1)))

(defmethod weight-for :transform-job [_ job-id]
  (max 1 (or (when job-id
               (t2/count :model/TransformJobTransformTag :job_id job-id))
             1)))

(defmethod weight-for :persisted-refresh [_ db-id]
  (max 1 (or (when db-id
               (t2/count :model/PersistedInfo
                         :database_id db-id
                         :state "persisted"))
             1)))

;; v1 default: channels per pulse (one delivery per enabled channel).
;; Tuneable post-dogfood per spec.
(defmethod weight-for :notification [_ pulse-id]
  (max 1 (or (when pulse-id
               (t2/count :model/PulseChannel :pulse_id pulse-id :enabled true))
             1)))

(defmethod weight-for :default [_ _] 1)
