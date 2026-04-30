(ns metabase-enterprise.workspaces.api
  (:require
   [metabase-enterprise.workspaces.api.instance]
   [metabase-enterprise.workspaces.api.manager]
   [metabase-enterprise.workspaces.api.public]
   [metabase-enterprise.workspaces.settings]
   [metabase.api.macros :as api.macros]
   [metabase.api.routes.common :refer [+auth +public-exceptions]]))

(comment metabase-enterprise.workspaces.api.instance/keep-me
         metabase-enterprise.workspaces.api.manager/keep-me
         metabase-enterprise.workspaces.api.public/keep-me
         metabase-enterprise.workspaces.settings/keep-me)

(def ^{:arglists '([request respond raise])} manager-routes
  "`/api/ee/workspace-manager` routes. Authenticated."
  (+auth (api.macros/ns-handler 'metabase-enterprise.workspaces.api.manager)))

(def ^{:arglists '([request respond raise])} instance-routes
  "`/api/ee/workspace-instance` routes. Authenticated."
  (+auth (api.macros/ns-handler 'metabase-enterprise.workspaces.api.instance)))

(def ^{:arglists '([request respond raise])} public-routes
  "`/api/ee/workspace-public` routes. Reachable without a session — gated only by
  the per-workspace access key UUID. `+public-exceptions` strips error details so
  unauthenticated callers can't probe for stack traces."
  (+public-exceptions (api.macros/ns-handler 'metabase-enterprise.workspaces.api.public)))
