(ns metabase-enterprise.workspaces.api
  (:require
   [metabase-enterprise.workspaces.api.workspace-instance]
   [metabase-enterprise.workspaces.api.workspace-manager]
   [metabase.api.macros :as api.macros]
   [metabase.api.routes.common :refer [+auth wrap-middleware-for-open-api-spec-generation]]
   [metabase.server.middleware.exceptions :as mw.exceptions]))

(comment metabase-enterprise.workspaces.api.workspace-instance/keep-me
         metabase-enterprise.workspaces.api.workspace-manager/keep-me)

(def ^:private contract-version
  "Version of the workspaces HTTP contract this server implements, sent in the `X-Metabase-Workspaces-Version`
  response header. Every response the `/api/ee/workspace-manager` and `/api/ee/workspace-instance` routes build
  carries it: a 2xx, the 401, and every error an endpoint throws, whatever its status (400, 403, 404, 409, 422, 500,
  or the status of a database's own error, such as 412). Read the version from any of those: one without the header
  comes from a server that predates it, so read that as version 1.

  Responses the server builds before a request reaches these routes carry no header and say nothing about the
  version: the 402 for a missing `:workspaces` premium feature, the 404 of a path or method no route matches, and
  the 400 for a body that is not valid JSON."
  "2")

(defn- add-contract-version-header
  "Add `X-Metabase-Workspaces-Version` to every response of `handler`, error responses included.

  The server builds the response of a thrown error in [[mw.exceptions/catch-api-exceptions]], outside this handler,
  where the header can't be added. So this builds that response here, with the same
  [[mw.exceptions/api-exception-response]], and adds the header. It does so for an exception the handler throws,
  passes to `raise`, or passes to `respond`. The status and body are the ones the server would have built."
  [handler]
  (fn [request respond _raise]
    (let [with-version  (fn [response]
                          (cond-> response
                            (map? response) (assoc-in [:headers "X-Metabase-Workspaces-Version"] contract-version)))
          respond-error (fn [e]
                          (respond (with-version (mw.exceptions/api-exception-response e request))))]
      (try
        (handler request
                 (fn [response]
                   (if (instance? Throwable response)
                     (respond-error response)
                     (respond (with-version response))))
                 respond-error)
        (catch Throwable e
          (respond-error e))))))

(def ^:private +contract-version
  (wrap-middleware-for-open-api-spec-generation add-contract-version-header))

(def ^{:arglists '([request respond raise])} manager-routes
  "`/api/ee/workspace-manager` routes. Authenticated."
  (+contract-version (+auth (api.macros/ns-handler 'metabase-enterprise.workspaces.api.workspace-manager))))

(def ^{:arglists '([request respond raise])} instance-routes
  "`/api/ee/workspace-instance` routes. Authenticated."
  (+contract-version (+auth (api.macros/ns-handler 'metabase-enterprise.workspaces.api.workspace-instance))))
