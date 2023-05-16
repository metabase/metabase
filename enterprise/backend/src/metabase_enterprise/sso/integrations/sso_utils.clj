(ns metabase-enterprise.sso.integrations.sso-utils
  "Functions shared by the various SSO implementations"
  (:require
   [metabase.api.common :as api]
   [metabase.email.messages :as messages]
   [metabase.integrations.common :as integrations.common]
   [metabase.models.user :refer [User]]
   [metabase.public-settings :as public-settings]
   [metabase.util :as u]
   [metabase.util.i18n :refer [trs tru]]
   [metabase.util.log :as log]
   [metabase.util.schema :as su]
   [schema.core :as s]
   [toucan2.core :as t2])
  (:import
   (java.net MalformedURLException URL URLDecoder)
   (java.util UUID)))

(set! *warn-on-reflection* true)

(def ^:private UserAttributes
  {:first_name       (s/maybe su/NonBlankString)
   :last_name        (s/maybe su/NonBlankString)
   :email            su/Email
   ;; TODO - we should avoid hardcoding this to make it easier to add new integrations. Maybe look at something like
   ;; the keys of `(methods sso/sso-get)`
   :sso_source       (s/enum :saml :jwt)
   :login_attributes (s/maybe {s/Any s/Any})})

(s/defn create-new-sso-user!
  "This function is basically the same thing as the `create-new-google-auth-user` from `metabase.models.user`. We need
  to refactor the `core_user` table structure and the function used to populate it so that the enterprise product can
  reuse it"
  [user :- UserAttributes]
  (u/prog1 (first (t2/insert-returning-instances! User (merge user {:password (str (UUID/randomUUID))})))
    (log/info (trs "New SSO user created: {0} ({1})" (:common_name <>) (:email <>)))
    ;; send an email to everyone including the site admin if that's set
    (when (integrations.common/send-new-sso-user-admin-email?)
      (messages/send-user-joined-admin-notification-email! <>, :google-auth? true))))

(defn fetch-and-update-login-attributes!
  "Update `:first_name`, `:last_name`, and `:login_attributes` for the user at `email`.
  This call is a no-op if the mentioned key values are equal."
  [{:keys [email] :as user-from-sso}]
  (when-let [{:keys [id] :as user} (t2/select-one User :%lower.email (u/lower-case-en email))]
    (let [user-keys (keys user-from-sso)
          ;; remove keys with `nil` values
          user-data (into {} (filter second user-from-sso))]
      (if (= (select-keys user user-keys) user-data)
        user
        (do
          (t2/update! User id user-data)
          (t2/select-one User :id id))))))

(defn check-sso-redirect
  "Check if open redirect is being exploited in SSO, blurts out a 400 if so"
  [redirect-url]
  (let [decoded-url (some-> redirect-url (URLDecoder/decode))
                    ;; In this case, this just means that we don't have a specified host in redirect,
                    ;; meaning it can't be an open redirect
        no-host     (or (nil? decoded-url) (= (first decoded-url) \/))
        host        (try
                      (.getHost (new URL decoded-url))
                      (catch MalformedURLException _ ""))
        our-host    (some-> (public-settings/site-url) (URL.) (.getHost))]
   (api/check (or no-host (= host our-host))
     [400 (tru "SSO is trying to do an open redirect to an untrusted site")])))
