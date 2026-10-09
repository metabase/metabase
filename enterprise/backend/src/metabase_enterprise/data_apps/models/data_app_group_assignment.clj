(ns metabase-enterprise.data-apps.models.data-app-group-assignment
  (:require
   [metabase.models.interface :as mi]
   [methodical.core :as methodical]
   [toucan2.core :as t2]))

(methodical/defmethod t2/table-name :model/DataAppGroupAssignment [_model] :data_app_group_assignment)

(derive :model/DataAppGroupAssignment :metabase/model)

(defmethod mi/can-read? :model/DataAppGroupAssignment
  ([_instance] (mi/superuser?))
  ([_model _pk] (mi/superuser?)))

(defmethod mi/can-write? :model/DataAppGroupAssignment
  ([_instance] (mi/superuser?))
  ([_model _pk] (mi/superuser?)))

(defmethod mi/can-create? :model/DataAppGroupAssignment
  [_model _instance]
  (mi/superuser?))
