(ns metabase.warehouse-schema.models.routine-parameter
  (:require
   [metabase.api.common :as api]
   [metabase.models.interface :as mi]
   [metabase.models.serialization :as serdes]
   [metabase.permissions.core :as perms]
   [metabase.util :as u]
   [methodical.core :as methodical]
   [toucan2.core :as t2]))

;;; --------------------------------------------------- Lifecycle ----------------------------------------------------

(methodical/defmethod t2/table-name :model/RoutineParameter [_model] :metabase_routine_parameter)

(doto :model/RoutineParameter
  (derive :metabase/model)
  (derive ::mi/read-policy.full-perms-for-perms-set)
  (derive ::mi/write-policy.full-perms-for-perms-set)
  (derive :hook/timestamped?))

(t2/deftransforms :model/RoutineParameter
  {:parameter_mode mi/transform-keyword})

(methodical/defmethod t2/model-for-automagic-hydration [:default :routine-parameter]
  [_original-model _k]
  :model/RoutineParameter)

(defmethod mi/can-read? :model/RoutineParameter
  ([instance]
   (let [routine (t2/select-one :model/Routine :id (:routine_id instance))]
     (perms/user-has-permission-for-database?
      api/*current-user-id*
      :perms/view-data
      (:db_id routine))))
  ([_ pk]
   (mi/can-read? (t2/select-one :model/RoutineParameter pk))))

(defmethod mi/can-write? :model/RoutineParameter
  ([instance]
   (mi/superuser?))
  ([_ pk]
   (mi/can-write? (t2/select-one :model/RoutineParameter pk))))

;;; ------------------------------------------------ Serdes Hashing -------------------------------------------------

(defmethod serdes/hash-fields :model/RoutineParameter
  [_parameter]
  [:name :ordinal_position (serdes/hydrated-hash :routine :routine_id)])