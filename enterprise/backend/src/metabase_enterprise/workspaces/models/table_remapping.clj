(ns metabase-enterprise.workspaces.models.table-remapping
  "Toucan 2 model for `table_remapping`: on a workspace instance, a main table and the scratch table that backs it.
  `\"\"` in `from_db`, `from_schema`, `to_db` and `to_schema` means the driver emits no identifier at that level; the
  unique constraints need a non-NULL value there."
  (:require
   [methodical.core :as methodical]
   [toucan2.core :as t2]))

(methodical/defmethod t2/table-name :model/TableRemapping [_model] :table_remapping)

(doto :model/TableRemapping
  (derive :metabase/model)
  (derive :hook/created-at-timestamped?))
