(ns metabase-enterprise.workspaces.core
  "The workspaces module's API for other modules."
  (:require
   [metabase-enterprise.workspaces.provisioning-connection]
   [potemkin :as p]))

(comment metabase-enterprise.workspaces.provisioning-connection/keep-me)

(p/import-vars
 [metabase-enterprise.workspaces.provisioning-connection
  provisioning-details])
