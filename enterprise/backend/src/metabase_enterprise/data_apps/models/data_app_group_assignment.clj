(ns metabase-enterprise.data-apps.models.data-app-group-assignment
  (:require
   [methodical.core :as methodical]
   [toucan2.core :as t2]))

(methodical/defmethod t2/table-name :model/DataAppGroupAssignment [_model] :data_app_group_assignment)

(derive :model/DataAppGroupAssignment :metabase/model)
