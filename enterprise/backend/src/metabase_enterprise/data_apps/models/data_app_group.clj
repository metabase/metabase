(ns metabase-enterprise.data-apps.models.data-app-group
  (:require
   [methodical.core :as methodical]
   [toucan2.core :as t2]))

(methodical/defmethod t2/table-name :model/DataAppGroup [_model] :data_app_group)

(derive :model/DataAppGroup :metabase/model)
