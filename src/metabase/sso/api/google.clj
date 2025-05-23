(ns metabase.sso.api.google
  "/api/google endpoints"
  (:require
   [metabase.api.common :as api]
   [metabase.api.macros :as api.macros]
   [metabase.settings.core :as setting]
   [metabase.sso.settings :as sso.settings]
   [toucan2.core :as t2]))

(api.macros/defendpoint :put "/settings"
  "Update Google Sign-In related settings. You must be a superuser to do this."
  [_route-params
   _query-params
   {:keys [google-auth-client-id google-auth-enabled google-auth-auto-create-accounts-domain]}
   :- [:map
       [:google-auth-client-id                   {:optional true} [:maybe :string]]
       [:google-auth-enabled                     {:optional true} [:maybe :boolean]]
       [:google-auth-auto-create-accounts-domain {:optional true} [:maybe :string]]]]
  (api/check-superuser)
  ;; Set google-auth-enabled in a separate step because it requires the client ID to be set first
  (t2/with-transaction [_conn]
    (setting/set-many! {:google-auth-client-id                   google-auth-client-id
                        :google-auth-auto-create-accounts-domain google-auth-auto-create-accounts-domain})
    (sso.settings/google-auth-enabled! google-auth-enabled)))
