(ns metabase-enterprise.workspaces.core
  "API namespace for the `enterprise/workspaces` module."
  (:require
   [metabase-enterprise.workspaces.scope]
   [potemkin :as p]))

(p/import-vars
 [metabase-enterprise.workspaces.scope
  agent-workspace-execute
  agent-workspace-read
  agent-workspace-write])
