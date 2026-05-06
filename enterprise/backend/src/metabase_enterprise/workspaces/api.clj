(ns metabase-enterprise.workspaces.api
  (:require
   [metabase-enterprise.workspaces.api.manager]
   [metabase.api.macros :as api.macros]
   [metabase.api.routes.common :refer [+auth]]))

(comment metabase-enterprise.workspaces.api.manager/keep-me)

(def ^{:arglists '([request respond raise])} manager-routes
  "`/api/ee/workspace-manager` routes. Authenticated."
  (+auth (api.macros/ns-handler 'metabase-enterprise.workspaces.api.manager)))
