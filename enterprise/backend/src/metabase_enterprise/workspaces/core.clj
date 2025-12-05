(ns metabase-enterprise.workspaces.core
  (:require
   [metabase-enterprise.workspaces.isolation]
   [potemkin :as p]))

(p/import-vars
 [metabase-enterprise.workspaces.isolation
  with-workspace-isolation])
