(ns metabase.warehouse-schema.models.table-symlink
  (:require
   [methodical.core :as methodical]
   [toucan2.core :as t2]))

(derive :model/TableSymlink :metadata/model)

(methodical/defmethod t2/table-name :model/TableSymlink [_model] :table_symlink)

(methodical/defmethod t2/primary-keys :model/TableSymlink [_model] [:table_id :collection_id])
