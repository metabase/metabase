(ns metabase-enterprise.sso.integrations.sso-utils
  "Functions shared by the various SSO implementations"
  (:require [clojure.tools.logging :as log]
            [metabase-enterprise.sso.integrations.sso-settings :as sso-settings]
            [metabase.email.messages :as email]
            [metabase.models.user :refer [User]]
            [metabase.util :as u]
            [metabase.util.i18n :refer [trs]]
            [metabase.util.schema :as su]
            [schema.core :as s]
            [toucan.db :as db])
  (:import java.util.UUID))

(def ^:private UserAttributes
  {:first_name       su/NonBlankString
   :last_name        su/NonBlankString
   :email            su/Email
   ;; TODO - we should avoid hardcoding this to make it easier to add new integrations. Maybe look at something like
   ;; the keys of `(methods sso/sso-get)`
   :sso_source       (s/enum "saml" "jwt")
   :login_attributes (s/maybe {s/Any s/Any})})

(s/defn create-new-sso-user!
  "This function is basically the same thing as the `create-new-google-auth-user` from `metabase.models.user`. We need
  to refactor the `core_user` table structure and the function used to populate it so that the enterprise product can
  reuse it"
  [user :- UserAttributes]
  (u/prog1 (db/insert! User (merge user {:password (str (UUID/randomUUID))}))
    (log/info (trs "New SSO user created: {0} ({1})" (:common_name <>) (:email <>)))
    ;; send an email to everyone including the site admin if that's set
    (when (sso-settings/send-new-sso-user-admin-email?)
      (email/send-user-joined-admin-notification-email! <>, :google-auth? true))))

(defn fetch-and-update-login-attributes!
  "Update the login attributes for the user at `email`. This call is a no-op if the login attributes are the same"
  [email new-user-attributes]
  (when-let [{:keys [id login_attributes] :as user} (db/select-one User :%lower.email (u/lower-case-en email))]
    (if (= login_attributes new-user-attributes)
      user
      (do
        (db/update! User id :login_attributes new-user-attributes)
        (User id)))))
