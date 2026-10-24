(ns metabase.data-apps.guards.util
  "Route guards that run a check for each request confined to the data-app scope, per endpoint of the API namespace
  whose mount they wrap, refuse such a request to an endpoint without one, and apply to the body of the endpoint's 2xx
  response the filter a check returns."
  (:require
   [metabase.api-scope.data-app :as api-scope]
   [metabase.api.macros :as api.macros]
   [metabase.api.macros.scope :as scope]
   [metabase.api.routes.common :as routes.common]
   [metabase.util.i18n :refer [tru]]))

(set! *warn-on-reflection* true)

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
  "Returns what the check of the endpoint of `nmspace` that the data-app `request` reaches returns, nil or a function to
  filter the body of the response, and throws when the check refuses it, returns anything else, or `ns-checks` has no
  check for that endpoint; a request that reaches no endpoint of `nmspace` passes on with nil."
  [nmspace ns-checks request]
  (when-let [{:keys [route route-params]} (api.macros/matching-route nmspace request)]
    (if-let [check (get ns-checks route)]
      (let [result (check request route-params)]
        (when-not (or (nil? result) (fn? result))
          (throw (ex-info (format "The data-app check of %s %s returned %s instead of nil or a function."
                                  (first route) (second route) (pr-str result))
                          {:route route})))
        result)
      (throw (ex-info (tru "A data app can''t use this endpoint.") {:status-code 403})))))

(defn- guard
  "A handler that runs `handler` on each request that [[check-request!]] lets through with `ns-checks` for the endpoints
  of `nmspace`, filtering the body of a 2xx response with the function the check returns."
  [nmspace ns-checks handler]
  (fn [request respond raise]
    (if-not (data-app-request? request)
      (handler request respond raise)
      (let [result (try
                     {:filter-body (check-request! nmspace ns-checks request)}
                     (catch Throwable e
                       {:error e}))]
        (if-let [e (:error result)]
          (raise e)
          (handler request
                   (if-let [filter-body (:filter-body result)]
                     (fn [response]
                       (try
                         (respond (cond-> response
                                    (<= 200 (:status response 200) 299) (update :body filter-body)))
                         (catch Throwable e
                           (raise e))))
                     respond)
                   raise))))))

(defn route-guard
  "Ring middleware for the mount of the API namespace `nmspace` that runs, for each data-app request, the check
  `ns-checks` maps its endpoint's `[method route]` pair to, and refuses one to an endpoint that `ns-checks` lacks."
  [nmspace ns-checks]
  {:pre [(every? (fn [[[method route] check]] (and (keyword? method) (string? route) (fn? check))) ns-checks)]}
  (routes.common/wrap-middleware-for-open-api-spec-generation (partial guard nmspace ns-checks)))
