(ns metabase.util.sso
  "Functions shared by the various SSO implementations"
  (:require [clojure.tools.logging :as log]
            [metabase.analytics.snowplow :as snowplow]
            [metabase.api.common :as api]
            [metabase.email.messages :as messages]
            [metabase.events :as events]
            [metabase.integrations.common :as integrations.common]
            [metabase.models.login-history :refer [LoginHistory]]
            [metabase.models.session :refer [Session]]
            [metabase.models.user :as user :refer [User]]
            [metabase.plugins.classloader :as classloader]
            [metabase.public-settings :as public-settings]
            [metabase.server.request.util :as request.u]
            [metabase.util :as u]
            [metabase.util.i18n :refer [trs tru]]
            [metabase.util.schema :as su]
            [schema.core :as s]
            [toucan.db :as db]
            [toucan.models :as models])
  (:import [java.net MalformedURLException URL URLDecoder]
           java.util.UUID))

(def UserAttributes
  {(s/optional-key :dn) (s/maybe su/NonBlankString)
   :first_name          (s/maybe su/NonBlankString)
   :last_name           (s/maybe su/NonBlankString)
   :email               su/Email
   ;; TODO - we should avoid hardcoding this to make it easier to add new integrations. Maybe look at something like
   ;; the keys of `(methods sso/sso-get)`
   :sso_source          (s/enum "saml" "jwt" "ldap" "google")
   :login_attributes    (s/maybe su/Map)})

(def SSOSettingsMap
  {:sso-source          (s/enum "saml" "jwt" "ldap" "google")
   :group-mappings      (s/maybe su/Map)
   :group-sync          (s/maybe s/Bool)
   :attribute-email     (s/maybe su/KeywordOrString)
   :attribute-firstname (s/maybe su/KeywordOrString)
   :attribute-lastname  (s/maybe su/KeywordOrString)
   :attribute-groups    (s/maybe su/KeywordOrString)
   :configured?         (s/maybe s/Bool)
   (s/maybe s/Any)      (s/maybe s/Any)})

;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;
;;
;; sync groups
;;
;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;

(defn- group-names->ids
  "Translate a user's group names to a set of MB group IDs using the configured mappings"
  [group-names {:keys [group-mappings]}]
  (->> (cond-> group-names (string? group-names) vector)
       (map keyword)
       (mapcat group-mappings)
       set))

(defn- all-mapped-group-ids
  "Returns the set of all MB group IDs that have configured mappings"
  [{:keys [group-mappings]}]
  (-> group-mappings
      vals
      flatten
      set))

(defn- sync-groups!
  "Sync a user's groups based on mappings configured in the settings"
  [user data {:keys [group-sync attribute-groups] :as sso-settings}]
      (tap> {:from "sync-groups!"
             :new-user user
             :user data})
  (when (and group-sync attribute-groups)
    (when-let [group-names (get data attribute-groups)]
      (integrations.common/sync-group-memberships! user
                                                   (group-names->ids group-names sso-settings)
                                                   (all-mapped-group-ids sso-settings)))))

;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;
;;
;; fetch or create new user
;;
;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;

(s/defn ^:private insert-new-user!
  "Creates a new user, defaulting the password when not provided"
  [new-user :- user/NewUser]
  (db/insert! User (update new-user :password #(or % (str (UUID/randomUUID))))))

(s/defn create-new-google-auth-user!
  "Convenience for creating a new user via Google Auth. This account is considered active immediately; thus all active
  admins will receive an email right away."
  [new-user :- user/NewUser]
  (u/prog1 (insert-new-user! (assoc new-user :google_auth true))
    ;; send an email to everyone including the site admin if that's set
    (classloader/require 'metabase.email.messages)
    ((resolve 'metabase.email.messages/send-user-joined-admin-notification-email!) <>, :google-auth? true)))

(s/defn create-new-ldap-auth-user!
  "Convenience for creating a new user via LDAP. This account is considered active immediately; thus all active admins
  will receive an email right away."
  [new-user :- user/NewUser]
  (insert-new-user!
   (-> new-user
       ;; We should not store LDAP passwords
       (dissoc :password)
       (assoc :ldap_auth true))))

;; todo: see if this can be unified for LDAP and Google (the above 2 fns removed and handled in this fn)
(s/defn create-new-sso-user!
  "This function is basically the same thing as the `create-new-google-auth-user` from `metabase.models.user`. We need
  to refactor the `core_user` table structure and the function used to populate it so that the enterprise product can
  reuse it"
  [user :- UserAttributes]
  (tap> {:from "create-new-sso-user!"
         :user user})
  (u/prog1 (db/insert! User (merge user {:password (str (UUID/randomUUID))}))
    (log/info (trs "New SSO user created: {0} ({1})" (:common_name <>) (:email <>)))
    ;; send an email to everyone including the site admin if that's set
    ;; todo move this setting to public-settings with a enabled? premium-features :sso (or whatever feature flag)
    (when true #_(sso-settings/send-new-sso-user-admin-email?)
          (messages/send-user-joined-admin-notification-email! <>, :google-auth? true))))

(defn fetch-and-update-login-attributes!
  "Update `:first_name`, `:last_name`, and `:login_attributes` for the user at `email`.
  This call is a no-op if the mentioned key values are equal."
  [{:keys [email] :as user-from-sso}]
  (when-let [{:keys [id] :as user} (db/select-one User :%lower.email (u/lower-case-en email))]
    (let [user-keys (keys user-from-sso)]
      (if (= (select-keys user user-keys) user-from-sso)
        user
        (do
          (db/update! User id user-from-sso)
          (User id))))))

;; create a session -> not fully logged in at this point though, need to redirect through middleware in the specific SSO impl (see SAML)

(defn- sso-data-and-settings->login-attributes
  [data {:keys [attribute-email attribute-firstname attribute-lastname]}]
  (apply dissoc data (map keyword [attribute-email attribute-firstname attribute-lastname :dn :iat :max_age])))

(defn sso-data-and-settings->new-user
  [{:keys [dn] :as sso-data}
   {:keys [attribute-email attribute-firstname attribute-lastname sso-source] :as sso-settings}]
  (cond-> {:email            (get sso-data attribute-email)
           :first_name       (get sso-data attribute-firstname)
           :last_name        (get sso-data attribute-lastname)
           :sso_source       sso-source
           :login_attributes (sso-data-and-settings->login-attributes sso-data sso-settings)}
    dn (assoc :dn dn)))

(s/defn fetch-or-create-user! :- (class User)
  "Returns a Session for the given user represented by `sso-data`, which is expected to be verified, unencrypted, unsigned, etc.
  This function:
    - Throws when the given SSO is not :configured
    - Throws when the email attribute is misconfigured
    - fetches and updates the User in the app-db if it already exists (email is the unique key used to check)
    - creates the user if it does not already exist
    - syncs the User's group memberships
    - returns a Session if everything else succeeds"
  [sso-data {:keys [sso-source configured? attribute-email] :as sso-settings} :- SSOSettingsMap]
  (when-not configured?
    (throw (IllegalArgumentException. (tru "Can''t create new {0} user when {1} is not configured" sso-source sso-source))))
  (let [{:keys [email login_attributes] :as new-user} (sso-data-and-settings->new-user sso-data sso-settings)]
    (when-not email
      (throw (ex-info (tru (str "Invalid {0} configuration: could not find user email. "
                                "We tried looking for {1}, but couldn''t find the attribute. "
                                "Please make sure your {2} IdP is properly configured.")
                           sso-source attribute-email sso-source)
                      {:status-code 400, :login-attributes (keys login_attributes)})))
    (when-let [user (or (fetch-and-update-login-attributes! new-user)
                        (create-new-sso-user! new-user))]
      (tap> {:from "fetch-or-create-user!"
             :new-user new-user
             :user user})
      (sync-groups! user sso-data sso-settings)
      user)))

;;;;;;;;; create-session

(s/defn ^:private record-login-history!
  [session-id :- UUID user-id :- su/IntGreaterThanZero device-info :- request.u/DeviceInfo]
  (db/insert! LoginHistory (merge {:user_id    user-id
                                   :session_id (str session-id)}
                                  device-info)))

(defmulti create-session!
  "Generate a new Session for a User. `session-type` is the currently either `:password` (for email + password login) or
  `:sso` (for other login types). Returns the newly generated Session."
  {:arglists '(^java.util.UUID [session-type user device-info])}
  (fn [session-type & _]
    session-type))

(def ^:private CreateSessionUserInfo
  {:id         su/IntGreaterThanZero
   :last_login s/Any
   s/Keyword   s/Any})

(s/defmethod create-session! :sso :- {:id UUID, :type (s/enum :normal :full-app-embed) s/Keyword s/Any}
  [_ user :- CreateSessionUserInfo device-info :- request.u/DeviceInfo]
  (let [session-uuid (UUID/randomUUID)
        session      (or
                      (db/insert! 'Session
                        :id      (str session-uuid)
                        :user_id (u/the-id user))
                      ;; HACK !!! For some reason `db/insert` doesn't seem to be working correctly for Session.
                      (models/post-insert (Session (str session-uuid))))]
    (tap> {:from "create-session!"
           :user user})
    (assert (map? session))
    (events/publish-event! :user-login
      {:user_id (u/the-id user), :session_id (str session-uuid), :first_login (nil? (:last_login user))})
    (record-login-history! session-uuid (u/the-id user) device-info)
    (when-not (:last_login user)
      (snowplow/track-event! ::snowplow/new-user-created (u/the-id user)))
    (assoc session :id session-uuid)))

(s/defmethod create-session! :password :- {:id UUID, :type (s/enum :normal :full-app-embed), s/Keyword s/Any}
  [session-type user :- CreateSessionUserInfo device-info :- request.u/DeviceInfo]
  ;; this is actually the same as `create-session!` for `:sso` but we check whether password login is enabled.
  (when-not (public-settings/enable-password-login)
    (throw (ex-info (str (tru "Password login is disabled for this instance.")) {:status-code 400})))
  ((get-method create-session! :sso) session-type user device-info))

;;;;;;;;;;;;;; misc

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
