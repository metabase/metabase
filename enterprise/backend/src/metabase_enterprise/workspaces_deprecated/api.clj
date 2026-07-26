(ns metabase-enterprise.workspaces-deprecated.api
  (:require
   [metabase-enterprise.workspaces-deprecated.api.workspace-instance]
   [metabase-enterprise.workspaces-deprecated.api.workspace-manager]
   [metabase.api.macros :as api.macros]
   [metabase.api.routes.common :refer [+auth]]))

(comment metabase-enterprise.workspaces-deprecated.api.workspace-instance/keep-me
         metabase-enterprise.workspaces-deprecated.api.workspace-manager/keep-me)

(def ^{:arglists '([request respond raise])} manager-routes
  "`/api/ee/workspace-manager` routes. Authenticated."
  (+auth (api.macros/ns-handler 'metabase-enterprise.workspaces-deprecated.api.workspace-manager)))

(def ^{:arglists '([request respond raise])} instance-routes
  "`/api/ee/workspace-instance` routes. Authenticated."
  (+auth (api.macros/ns-handler 'metabase-enterprise.workspaces-deprecated.api.workspace-instance)))
