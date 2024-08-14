(ns metabase.api.google
  "/api/google endpoints"
  (:require
   [compojure.core :refer [PUT]]
   [metabase.api.common :as api]
   [metabase.integrations.google :as google]
   [metabase.models.setting :as setting]
   [toucan2.core :as t2]))

(api/defendpoint PUT "/settings"
  "Update Google Sign-In related settings. You must be a superuser to do this."
  [:as {{:keys [google-auth-client-id google-auth-enabled google-auth-auto-create-accounts-domain]} :body}]
  {google-auth-client-id                   [:maybe :string]
   google-auth-enabled                     [:maybe :boolean]
   google-auth-auto-create-accounts-domain [:maybe :string]}
  (api/check-superuser)
  ;; Set google-auth-enabled in a separate step because it requires the client ID to be set first
  (t2/with-transaction [_conn]
   (setting/set-many! {:google-auth-client-id                   google-auth-client-id
                       :google-auth-auto-create-accounts-domain google-auth-auto-create-accounts-domain})
   (google/google-auth-enabled! google-auth-enabled)))

(api/define-routes)
