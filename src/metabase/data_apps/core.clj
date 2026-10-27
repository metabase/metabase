(ns metabase.data-apps.core
  (:require
   [metabase.analytics.core :as analytics]
   [metabase.api-scope.data-app :as api-scope]
   [metabase.api.macros.scope :as scope]
   [metabase.data-apps.schema :as data-apps.schema]
   [metabase.lib-be.schema :as lib-be.schema]
   [metabase.premium-features.core :refer [defenterprise defenterprise-schema]]))

(defenterprise visible-data-app-filter-select
  "A HoneySQL query of the ids of the data apps that the user described by `user-info` (`:user-id`, `:is-superuser?`)
  can read, or nil, meaning none, without the data apps feature."
  metabase-enterprise.data-apps.core
  [_user-info]
  nil)

(defn data-app-header?
  "Whether `request` carries the `X-Metabase-Client: data-app` header, which a data app sends both published and in its
  dev preview."
  [request]
  (analytics/data-app-client? (get-in request [:headers "x-metabase-client"])))

(defn data-app-slug
  "The slug of the data app that `request` names in its `X-Metabase-Client-Identifier` header, or nil."
  [request]
  (not-empty (get-in request [:headers "x-metabase-client-identifier"])))

(defn full-access?
  "Whether `token-scopes` grant the whole REST API: a session's nil scopes, an unrestricted credential, or a granted
  `\"*\"`, which [[metabase.api-scope.core/scope-matches?]] treats as satisfying every required scope."
  [token-scopes]
  (or (nil? token-scopes)
      (contains? token-scopes ::scope/unrestricted)
      (contains? token-scopes "*")))

(defn data-app-request?
  "Whether `request` is confined to the data-app scope: marked by the data-app scope middleware, or authorized by a token
  whose scopes, short of full access, grant it."
  [{:keys [data-app-scoped? token-scopes]}]
  (boolean
   (or data-app-scoped?
       (and (not (full-access? token-scopes))
            (scope/scope-satisfied? (into #{} (filter string?) token-scopes) api-scope/data-app)))))

(defenterprise request-data-app
  "The data app, readable by the current user, whose slug a data-app `request` names by [[data-app-slug]]; nil for a
  request that is not a data app's, or without the data-apps feature."
  metabase-enterprise.data-apps.checks
  [_request]
  nil)

(defenterprise-schema check-query :- :nil
  "Throws a 400 unless `data-app` may run `query`, an MBQL or internal query as the `/api/dataset` endpoints take it;
  does nothing without the data-apps feature."
  metabase-enterprise.data-apps.checks
  [_data-app :- ::data-apps.schema/data-app
   _query    :- ::lib-be.schema/maybe-legacy-or-internal-query]
  nil)
