(ns metabase.warehouse-schema.models.routine
  (:require
   [metabase.api.common :as api]
   [metabase.models.interface :as mi]
   [metabase.models.serialization :as serdes]
   [metabase.permissions.core :as perms]
   [metabase.util :as u]
   [methodical.core :as methodical]
   [toucan2.core :as t2]))

;;; ----------------------------------------------- Constants + Entity -----------------------------------------------

(def routine-types
  "Valid values for `Routine.routine_type`."
  #{:procedure :function})

(def parameter-modes
  "Valid values for parameter modes."
  #{:in :out :inout})

;;; --------------------------------------------------- Lifecycle ----------------------------------------------------

(methodical/defmethod t2/table-name :model/Routine [_model] :metabase_routine)

(doto :model/Routine
  (derive :metabase/model)
  (derive :hook/timestamped?))

(t2/deftransforms :model/Routine
  {:routine_type mi/transform-keyword})

(methodical/defmethod t2/model-for-automagic-hydration [:default :routine]
  [_original-model _k]
  :model/Routine)

(t2/define-before-insert :model/Routine
  [routine]
  (let [defaults {:active true}]
    (merge defaults routine)))

(t2/define-before-delete :model/Routine
  [routine]
  ;; Delete associated parameters
  (t2/delete! :model/RoutineParameter :routine_id (:id routine)))

(defmethod mi/can-read? :model/Routine
  ([instance]
   (perms/user-has-permission-for-database?
    api/*current-user-id*
    :perms/view-data
    (:db_id instance)))
  ([_ pk]
   (mi/can-read? (t2/select-one :model/Routine pk))))

(defmethod mi/can-write? :model/Routine
  ([instance]
   (mi/superuser?))
  ([_ pk]
   (mi/can-write? (t2/select-one :model/Routine pk))))

;;; ------------------------------------------------ Serdes Hashing -------------------------------------------------

(defmethod serdes/hash-fields :model/Routine
  [_routine]
  [:schema :name :routine_type (serdes/hydrated-hash :db :db_id)])