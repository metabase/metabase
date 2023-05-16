(ns metabase.api.google
  "/api/google endpoints"
  (:require
   [compojure.core :refer [PUT]]
   [metabase.api.common :as api]
   [metabase.integrations.google :as google]
   [metabase.models.setting :as setting]
   [schema.core :as s]
   [toucan2.core :as t2]))

#_{:clj-kondo/ignore [:deprecated-var]}
(api/defendpoint-schema PUT "/settings"
  "Update Google Sign-In related settings. You must be a superuser to do this."
  [:as {{:keys [google-auth-client-id google-auth-enabled google-auth-auto-create-accounts-domain]} :body}]
  {google-auth-client-id                   (s/maybe s/Str)
   google-auth-enabled                     (s/maybe s/Bool)
   google-auth-auto-create-accounts-domain (s/maybe s/Str)}
  (api/check-superuser)
  ;; Set google-auth-enabled in a separate step because it requires the client ID to be set first
  (t2/with-transaction [_conn]
   (setting/set-many! {:google-auth-client-id                   google-auth-client-id
                       :google-auth-auto-create-accounts-domain google-auth-auto-create-accounts-domain})
   (google/google-auth-enabled! google-auth-enabled)))

(api/define-routes)
