(ns metabase-enterprise.mcp.test-util
  "Helpers for tests that change the `mcp_group_permission` rows, which also record the permission mode."
  (:require
   [metabase-enterprise.mcp.db :as mcp.db]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(defn do-with-mcp-group-permissions-snapshot!
  "Run `thunk`, then restore every `mcp_group_permission` row to its prior state."
  [thunk]
  (let [snapshot (t2/select :model/McpGroupPermission)]
    (try
      (thunk)
      (finally
        (t2/delete! :model/McpGroupPermission)
        (when (seq snapshot)
          (t2/insert! :model/McpGroupPermission
                      (map #(select-keys % [:group_id :mcp_enabled :tool_access]) snapshot)))))))

(defmacro with-mcp-group-permissions-snapshot
  "Run `body`, then restore every `mcp_group_permission` row to its prior state."
  [& body]
  `(do-with-mcp-group-permissions-snapshot! (fn [] ~@body)))

(defmacro with-group-level-mode
  "Run `body` in group-level mode, with the rows of All Users and All tenant users deleted, then restore every row."
  [& body]
  `(with-mcp-group-permissions-snapshot
     (mcp.db/delete-hidden-group-permissions! true)
     ~@body))
