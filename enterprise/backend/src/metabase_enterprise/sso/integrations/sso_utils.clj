(ns metabase-enterprise.sso.integrations.sso-utils
  "Functions shared by the various SSO implementations"
  (:require
   [malli.util :as mut]
   [metabase-enterprise.sso.settings :as sso-settings]
   [metabase.api.common :as api]
   [metabase.appearance.core :as appearance]
   [metabase.channel.email.messages :as messages]
   [metabase.events.core :as events]
   [metabase.notification.core :as notification]
   [metabase.sso.core :as sso]
   [metabase.system.core :as system]
   [metabase.util :as u]
   [metabase.util.i18n :refer [trs tru]]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu]
   [metabase.util.malli.schema :as ms]
   [toucan2.core :as t2])
  (:import
   (clojure.lang ExceptionInfo)
   (java.net URI URISyntaxException)))

(set! *warn-on-reflection* true)

(def ^:private UserAttributes
  [:map {:closed true}
   [:first_name       [:maybe ms/NonBlankString]]
   [:last_name        [:maybe ms/NonBlankString]]
   [:email            ms/Email]
   ;; TODO - we should avoid hardcoding this to make it easier to add new integrations. Maybe look at something like
   ;; the keys of `(methods sso/sso-get)`
   [:sso_source       [:enum :saml :jwt]]
   [:jwt_attributes   {:optional true} [:maybe :map]]
   [:login_attributes [:maybe :map]]
   [:tenant_id        [:maybe ms/PositiveInt]]])

(defn- maybe-throw-user-provisioning
  [user-provisioning-type]
  (when (not user-provisioning-type)
    (throw (ex-info (trs "Sorry, but you''ll need a {0} account to view this page. Please contact your administrator."
                         (u/slugify (appearance/site-name))) {}))))

(defmulti check-user-provisioning
  "If `user-provisioning-enabled?` is false, then we should throw an error when attempting to create a new user."
  {:arglists '([model])}
  keyword)

(defmethod check-user-provisioning :saml
  [_]
  (maybe-throw-user-provisioning (sso-settings/saml-user-provisioning-enabled?)))

(defmethod check-user-provisioning :ldap
  [_]
  (maybe-throw-user-provisioning (sso-settings/ldap-user-provisioning-enabled?)))

(defmethod check-user-provisioning :jwt
  [_]
  (maybe-throw-user-provisioning (sso-settings/jwt-user-provisioning-enabled?)))

(mu/defn create-new-sso-user!
  "This function is basically the same thing as the `create-new-google-auth-user` from `metabase.users.models.user`. We need
  to refactor the `core_user` table structure and the function used to populate it so that the enterprise product can
  reuse it."
  [user :- UserAttributes]
  (try
    (u/prog1 (t2/insert-returning-instance! :model/User (merge user {:password (str (random-uuid))}))
      (log/infof "New SSO user created: %s (%s)" (:common_name <>) (:email <>))
      ;; publish user-invited event for audit logging
      ;; skip sending user invited emails for sso users
      (notification/with-skip-sending-notification true
        (events/publish-event! :event/user-invited {:object (assoc <> :sso_source (:sso_source user))}))
      ;; send an email to everyone including the site admin if that's set
      (when (sso/send-new-sso-user-admin-email?)
        (messages/send-user-joined-admin-notification-email! <>, :google-auth? true)))
    (catch ExceptionInfo e
      (log/error e "Error creating new SSO user")
      (throw (ex-info (trs "Error creating new SSO user")
                      {:user user})))))

(def ^:private user-keys
  (->> (mut/keys UserAttributes)
       (concat [:id :last_login :is_superuser :is_active])
       set))

(defn- fetch-user
  [email]
  (t2/select-one (into [:model/User] user-keys) :%lower.email (u/lower-case-en email)))

(defn- require-is-active [{:keys [is_active] :as user} reactivate?]
  (when (or is_active reactivate?)
    user))

(defn- assert-tenant-ok! [user-from-sso user]
  (when-not (= (:tenant_id user) (:tenant_id user-from-sso))
    (throw (ex-info "Tenant ID mismatch with existing user" {:status-code 403})))
  (when (and (:is_superuser user)
             (:tenant_id user-from-sso))
    (throw (ex-info "A superuser cannot belong to a tenant." {:status-code 403}))))

(mu/defn fetch-and-update-login-attributes!
  "Update `:first_name`, `:last_name`, and `:login_attributes` for the user at `email`.
  This call is a no-op if the mentioned key values are equal."
  [{:keys [email] :as user-from-sso} :- UserAttributes
   reactivate? :- ms/BooleanValue]
  (when-let [{:keys [id] :as user} (require-is-active (fetch-user email) reactivate?)]
    (assert-tenant-ok! user-from-sso user)
    (let [;; don't replace existing values with `nil`
          user-data (into {} (remove (comp nil? second) (merge user-from-sso {:is_active true})))]
      (if (= (select-keys user user-keys)
             user-data)
        user
        (do
          (t2/update! :model/User id user-data)
          (fetch-user email))))))

(defn relative-uri?
  "Checks that given `uri` is not an absolute (so no scheme and no host)."
  [uri]
  (let [^URI uri (if (string? uri)
                   (try
                     (URI. uri)
                     (catch URISyntaxException _
                       nil))
                   uri)]
    (or (nil? uri)
        (and (nil? (.getHost uri))
             (nil? (.getScheme uri))))))

(defn check-sso-redirect
  "Check if open redirect is being exploited in SSO. If so, or if the redirect-url is invalid, throw a 400."
  [redirect-url]
  (try
    (let [redirect (some-> redirect-url (URI.))
          our-host (some-> (system/site-url) (URI.) (.getHost))]
      (api/check-400 (or (nil? redirect-url)
                         (relative-uri? redirect)
                         (= (.getHost redirect) our-host))))
    (catch Exception e
      (log/error e "Invalid redirect URL")
      (throw (ex-info (tru "Invalid redirect URL")
                      {:status-code  400
                       :redirect-url redirect-url})))))

(defn is-embedding-sdk-header?
  "Check if the client has indicated it is from the react embedding sdk"
  [request]
  (= (get-in request [:headers "x-metabase-client"]) "embedding-sdk-react"))
