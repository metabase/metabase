(ns metabase-enterprise.workspaces.api
  (:require
   [metabase-enterprise.workspaces.api.workspace-instance]
   [metabase-enterprise.workspaces.api.workspace-manager]
   [metabase.api.macros :as api.macros]
   [metabase.api.routes.common :refer [+auth wrap-middleware-for-open-api-spec-generation]]))

(comment metabase-enterprise.workspaces.api.workspace-instance/keep-me
         metabase-enterprise.workspaces.api.workspace-manager/keep-me)

(def ^:private contract-version
  "Version of the workspaces HTTP contract this server implements, sent in the `X-Metabase-Workspaces-Version`
  response header. A response without the header comes from a server that predates it: read that as version 1."
  "2")

(defn- add-contract-version-header
  "Add `X-Metabase-Workspaces-Version` to every response map the handler passes to `respond`. Exceptions passed to
  `raise` become responses in [[metabase.server.middleware.exceptions]], outside this handler, so those error
  responses do not carry the header."
  [handler]
  (fn [request respond raise]
    (handler request
             (fn [response]
               (respond (cond-> response
                          (map? response) (assoc-in [:headers "X-Metabase-Workspaces-Version"] contract-version))))
             raise)))

(def ^:private +contract-version
  (wrap-middleware-for-open-api-spec-generation add-contract-version-header))

(def ^{:arglists '([request respond raise])} manager-routes
  "`/api/ee/workspace-manager` routes. Authenticated."
  (+contract-version (+auth (api.macros/ns-handler 'metabase-enterprise.workspaces.api.workspace-manager))))

(def ^{:arglists '([request respond raise])} instance-routes
  "`/api/ee/workspace-instance` routes. Authenticated."
  (+contract-version (+auth (api.macros/ns-handler 'metabase-enterprise.workspaces.api.workspace-instance))))
