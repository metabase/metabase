(ns metabase.actions-rest.secret-api
  "`/api/action-secret/` endpoints."
  (:require
   [metabase.actions.core :as actions]
   [metabase.actions.schema :as actions.schema]
   [metabase.api.common :as api]
   [metabase.api.macros :as api.macros]))

(set! *warn-on-reflection* true)

(api.macros/defendpoint :get "/" :- [:sequential ::actions.schema/action-secret]
  "The secrets HTTP actions can use, without their values. Superusers only."
  []
  (api/check-superuser)
  (actions/secrets))

(api.macros/defendpoint :post "/" :- ::actions.schema/action-secret
  "Create a secret. Its value is never returned. Superusers only."
  [_route-params
   _query-params
   body :- ::actions.schema/action-secret.create-request]
  (api/check-superuser)
  (actions/create-secret! body api/*current-user-id*))

(api.macros/defendpoint :put "/:id" :- ::actions.schema/action-secret
  "Update a secret, keeping its value when the body has none. Superusers only."
  [{:keys [id]} :- [:map {:closed true}
                    [:id pos-int?]]
   _query-params
   body :- ::actions.schema/action-secret.update-request]
  (api/check-superuser)
  (actions/update-secret! id body))

(api.macros/defendpoint :delete "/:id" :- ::api/generic-204-no-content
  "Delete a secret. Superusers only."
  [{:keys [id]} :- [:map {:closed true}
                    [:id pos-int?]]]
  (api/check-superuser)
  (actions/delete-secret! id)
  api/generic-204-no-content)
