(ns metabase.data-apps.guard
  "Route guards that run a check for each request confined to the data-app scope, per endpoint of the API namespace
  whose mount they wrap, and refuse such a request to an endpoint without one."
  (:require
   [metabase.api-scope.data-app :as api-scope]
   [metabase.api.macros :as api.macros]
   [metabase.api.macros.scope :as scope]
   [metabase.api.routes.common :as routes.common]
   [metabase.util.i18n :refer [tru]]))

(set! *warn-on-reflection* true)

(defn refuse
  "Refuses a data-app request to an endpoint whose rule is still to come."
  [_request _route-params]
  (throw (ex-info (tru "A data app can''t use this endpoint.") {:status-code 403})))

(defn- data-app-request?
  "Whether `request` is confined to the data-app scope: marked by the data-app scope middleware, or authorized by a token
  whose scopes, short of full access, grant it."
  [{:keys [data-app-scoped? token-scopes]}]
  (let [granted (into #{} (filter string?) token-scopes)]
    (boolean
     (or data-app-scoped?
         (and (not (contains? token-scopes ::scope/unrestricted))
              (not (contains? granted "*"))
              (scope/scope-satisfied? granted api-scope/data-app))))))

(defn- check-request!
  "Throws unless the data-app `request` to the endpoint of `nmspace` it reaches passes that endpoint's check in
  `ns-checks`, which returns nil to let it through; a request that reaches no endpoint of `nmspace` passes on."
  [nmspace ns-checks request]
  (when-let [{:keys [route route-params]} (api.macros/matching-route nmspace request)]
    (if-let [check (get ns-checks route)]
      (when-some [result (check request route-params)]
        (throw (ex-info (format "The data-app check of %s %s returned %s instead of nil."
                                (first route) (second route) (pr-str result))
                        {:route route})))
      (throw (ex-info (tru "A data app can''t use this endpoint.") {:status-code 403})))))

(defn- guard
  "A handler that runs `handler` on each request that [[check-request!]] lets through with `ns-checks` for the endpoints
  of `nmspace`."
  [nmspace ns-checks handler]
  (fn [request respond raise]
    (if-let [e (when (data-app-request? request)
                 (try
                   (check-request! nmspace ns-checks request)
                   nil
                   (catch Throwable e e)))]
      (raise e)
      (handler request respond raise))))

(defn route-guard
  "Ring middleware for the mount of the API namespace `nmspace` that runs, for each data-app request, the check
  `ns-checks` maps its endpoint's `[method route]` pair to, and refuses one to an endpoint that `ns-checks` lacks."
  [nmspace ns-checks]
  {:pre [(every? (fn [[[method route] check]] (and (keyword? method) (string? route) (fn? check))) ns-checks)]}
  (routes.common/wrap-middleware-for-open-api-spec-generation (partial guard nmspace ns-checks)))
