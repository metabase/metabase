(ns metabase.data-apps.core
  (:require
   [metabase.api-scope.data-app :as api-scope]
   [metabase.api.macros.scope :as scope]
   [metabase.premium-features.core :refer [defenterprise]]
   [metabase.util.i18n :refer [tru]]))

(defenterprise check-data-app-access!
  "Authorize the data app before serving its HTML entry point."
  metabase-enterprise.data-apps.core
  [_request]
  nil)

(defenterprise visible-data-app-filter-select
  "A HoneySQL query of the ids of the data apps that the user described by `user-info` (`:user-id`, `:is-superuser?`)
  can read, or nil, meaning none, without the data apps feature."
  metabase-enterprise.data-apps.core
  [_user-info]
  nil)

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
  "The data app that a data-app `request` names in its `X-Metabase-Client-Identifier` header; throws a 403 when it names
  none."
  metabase-enterprise.data-apps.checks
  [_request]
  (throw (unavailable)))

(defenterprise check-query
  "Throws a 403 unless `data-app` may run `query`, a legacy or MBQL 5 query map."
  metabase-enterprise.data-apps.checks
  [_data-app _query]
  (throw (unavailable)))
