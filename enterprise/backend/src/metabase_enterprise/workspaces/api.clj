(ns metabase-enterprise.workspaces.api
  (:require
   [metabase-enterprise.workspaces.api.workspace-instance]
   [metabase-enterprise.workspaces.api.workspace-manager]
   [metabase.api.macros :as api.macros]
   [metabase.api.routes.common :refer [+auth]]))

(comment metabase-enterprise.workspaces.api.workspace-instance/keep-me
         metabase-enterprise.workspaces.api.workspace-manager/keep-me)

(def ^{:arglists '([request respond raise])} manager-routes
  "`/api/ee/workspace-manager` routes. Authenticated."
  (+auth (api.macros/ns-handler 'metabase-enterprise.workspaces.api.workspace-manager)))

(def ^{:arglists '([request respond raise])} instance-routes
  "`/api/ee/workspace-instance` routes. Authenticated."
  (+auth (api.macros/ns-handler 'metabase-enterprise.workspaces.api.workspace-instance)))
