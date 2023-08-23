(ns metabase.models.table-privileges
  "Each row in the `table_privileges` table contains the privileges that the current user or group has on a given table.

   The `table_privileges` table just a cache of the data returned from driver/table-privileges, but it's stored in the
   database so that we can query it more easily."
  (:require
   [methodical.core :as methodical]
   [toucan2.core :as t2]))

(def TablePrivileges
  "Used to be the toucan1 model name defined using [[toucan.models/defmodel]], now it's a reference to the toucan2 model name.
  We'll keep this until we replace all the symbols in our codebase."
  :model/TablePrivileges)

(methodical/defmethod t2/table-name :model/TablePrivileges [_model] :table_privileges)

(derive :model/TablePrivileges :metabase/model)
