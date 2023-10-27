(ns metabase.models.table-privileges
  "Each row in the `table_privileges` table contains the privileges that the current user or role has on a given table.

   The `table_privileges` table just a cache of the data returned from driver/table-privileges, but it's stored in the
   database so that we can query it more easily."
  (:require
   [methodical.core :as methodical]
   [toucan2.core :as t2]))

(methodical/defmethod t2/table-name :model/TablePrivileges [_model] :table_privileges)

(derive :model/TablePrivileges :metabase/model)
