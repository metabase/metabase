(ns metabase.data-apps.core
  (:require
   [metabase.analytics.core :as analytics]
   [metabase.api-scope.data-app :as api-scope]
   [metabase.api.macros.scope :as scope]
   [metabase.data-apps.schema :as data-apps.schema]
   [metabase.lib-be.schema :as lib-be.schema]
   [metabase.premium-features.core :refer [defenterprise defenterprise-schema]]
   [metabase.util.i18n :refer [tru]]))

(defenterprise visible-data-app-filter-select
  "A HoneySQL query of the ids of the data apps that the user described by `user-info` (`:user-id`, `:is-superuser?`)
  can read, or nil, meaning none, without the data apps feature."
  metabase-enterprise.data-apps.core
  [_user-info]
  nil)

(defn data-app-header?
  "Whether `request` carries the `X-Metabase-Client` header of a published data app, which confines it to the data-app
  scope."
  [request]
  (analytics/data-app-client? (get-in request [:headers "x-metabase-client"])))

(defn data-app-slug
  "The slug of the data app that `request` names in its `X-Metabase-Client-Identifier` header, or nil."
  [request]
  (not-empty (get-in request [:headers "x-metabase-client-identifier"])))

(defn data-app-request?
  "Whether `request` is confined to the data-app scope: marked by the data-app scope middleware, or authorized by a token
  whose scopes, short of full access, grant it."
  [{:keys [data-app-scoped? token-scopes]}]
  (let [granted (into #{} (filter string?) token-scopes)]
    (boolean
     (or data-app-scoped?
         (and (not (contains? token-scopes ::scope/unrestricted))
              (not (contains? granted "*"))
              (scope/scope-satisfied? granted api-scope/data-app))))))

(defn- unavailable
  "The error refusing a data-app request where data apps aren't available."
  []
  (ex-info (tru "Data apps aren''t available on this instance.") {:status-code 403}))

(defenterprise request-data-app
  "The data app whose slug a data-app `request` names, by [[data-app-slug]]; throws a 400 when it names none."
  metabase-enterprise.data-apps.checks
  [_request]
  (throw (unavailable)))

(defenterprise-schema check-query :- :nil
  "Throws a 400 unless `data-app` may run `query`, an MBQL or internal query as the `/api/dataset` endpoints take it."
  metabase-enterprise.data-apps.checks
  [_data-app :- ::data-apps.schema/data-app
   _query    :- ::lib-be.schema/maybe-legacy-or-internal-query]
  (throw (unavailable)))
