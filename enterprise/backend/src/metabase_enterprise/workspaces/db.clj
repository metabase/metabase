(ns metabase-enterprise.workspaces.db
  "Application database queries for the workspaces module. Every function here is a direct Toucan 2 call with no
  additional logic, so no other namespace in the module runs a query itself."
  (:require
   [metabase.util.malli :as mu]
   [toucan2.core :as t2]))

;;; ---------------------------------------------- TableRemapping ----------------------------------------------

(mu/defn table-remappings
  "Every TableRemapping, ordered by id."
  []
  (t2/select :model/TableRemapping {:order-by [[:id :asc]]}))

(mu/defn delete-all-table-remappings!
  "Delete every TableRemapping."
  []
  (t2/delete! :model/TableRemapping))
