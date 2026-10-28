(ns metabase.data-apps.core
  (:require
   [metabase.actions.schema :as actions.schema]
   [metabase.analytics.core :as analytics]
   [metabase.api-scope.data-app :as api-scope]
   [metabase.api.macros.scope :as scope]
   [metabase.data-apps.schema :as data-apps.schema]
   [metabase.lib-be.schema :as lib-be.schema]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.lib.schema.parameter :as lib.schema.parameter]
   [metabase.parameters.schema :as parameters.schema]
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
  "The data app whose slug a data-app `request` names by [[data-app-slug]], read-checked; nil for a request that is not
  a data app's, or without the data-apps feature."
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

(defenterprise-schema check-card :- :nil
  "Throws a 400 unless `data-app` may use the card with `card-id`, after a read check of the card; does nothing without
  the data-apps feature."
  metabase-enterprise.data-apps.checks
  [_data-app :- ::data-apps.schema/data-app
   _card-id  :- ::lib.schema.id/card]
  nil)

(defenterprise-schema check-card-parameter :- :nil
  "Throws a 400 unless `data-app` may use the card with `card-id` and the card its parameter `param-key` takes its
  values from, after read checks of both; does nothing without the data-apps feature."
  metabase-enterprise.data-apps.checks
  [_data-app  :- ::data-apps.schema/data-app
   _card-id   :- ::lib.schema.id/card
   _param-key :- ::lib.schema.parameter/id]
  nil)

(defenterprise-schema check-parameter :- :nil
  "Throws a 400 unless `data-app` may load values for the ad-hoc `parameter` from its source or the fields with
  `field-ids`; does nothing without the data-apps feature."
  metabase-enterprise.data-apps.checks
  [_data-app  :- ::data-apps.schema/data-app
   _parameter :- ::parameters.schema/parameter
   _field-ids :- [:maybe [:sequential ::lib.schema.id/field]]]
  nil)

(defenterprise-schema check-action :- :nil
  "Throws a 400 unless `data-app` may run the action with `action-id`, after a read check of the action; does nothing
  without the data-apps feature."
  metabase-enterprise.data-apps.checks
  [_data-app  :- ::data-apps.schema/data-app
   _action-id :- ::lib.schema.id/action]
  nil)

(defenterprise-schema data-app-actions :- [:sequential ::actions.schema/action]
  "The `actions` that `data-app` may use; all of them without the data-apps feature."
  metabase-enterprise.data-apps.checks
  [_data-app :- ::data-apps.schema/data-app
   actions   :- [:sequential ::actions.schema/action]]
  actions)
