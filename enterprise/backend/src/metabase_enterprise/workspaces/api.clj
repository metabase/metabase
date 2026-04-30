(ns metabase-enterprise.workspaces.api
  (:require
   [metabase-enterprise.workspaces.api.instance]
   [metabase-enterprise.workspaces.api.manager]
   [metabase-enterprise.workspaces.api.sharing]
   [metabase-enterprise.workspaces.settings]
   [metabase.api.macros :as api.macros]))

(comment metabase-enterprise.workspaces.api.instance/keep-me
         metabase-enterprise.workspaces.api.manager/keep-me
         metabase-enterprise.workspaces.api.sharing/keep-me
         metabase-enterprise.workspaces.settings/keep-me)

(def ^{:arglists '([request respond raise])} manager-routes
  "`/api/ee/workspace-manager` routes."
  (api.macros/ns-handler 'metabase-enterprise.workspaces.api.manager))

(def ^{:arglists '([request respond raise])} instance-routes
  "`/api/ee/workspace-instance` routes."
  (api.macros/ns-handler 'metabase-enterprise.workspaces.api.instance))

(def ^{:arglists '([request respond raise])} sharing-routes
  "`/api/ee/workspace-sharing` routes."
  (api.macros/ns-handler 'metabase-enterprise.workspaces.api.sharing))
