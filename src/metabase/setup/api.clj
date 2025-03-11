(ns metabase.setup.api
  (:require
   [java-time.api :as t]
   [metabase.analytics.core :as analytics]
   [metabase.api.common :as api]
   [metabase.api.macros :as api.macros]
   [metabase.channel.email :as email]
   [metabase.config :as config]
   [metabase.events :as events]
   [metabase.models.setting.cache :as setting.cache]
   [metabase.models.user :as user]
   [metabase.permissions.core :as perms]
   [metabase.public-settings :as public-settings]
   [metabase.request.core :as request]
   [metabase.session.models.session :as session]
   [metabase.setup.core :as setup]
   [metabase.util :as u]
   [metabase.util.i18n :as i18n :refer [tru]]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu]
   [metabase.util.malli.schema :as ms]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(def ^:private ^:deprcated SetupToken
  "Schema for a string that matches the instance setup token."
  (mu/with-api-error-message
   [:and
    ms/NonBlankString
    [:fn
     {:error/message "setup token"}
     (every-pred string? #'setup/token-match?)]]
   (i18n/deferred-tru "Token does not match the setup token.")))

(def ^:dynamic ^:private *allow-api-setup-after-first-user-is-created*
  "We must not allow users to setup multiple super users after the first user is created. But tests still need to be able
  to. This var is redef'd to false by certain tests to allow that."
  false)

(defn- setup-create-user! [{:keys [email first-name last-name password device-info]}]
  (when (and (setup/has-user-setup)
             (not *allow-api-setup-after-first-user-is-created*))
    ;; many tests use /api/setup to setup multiple users, so *allow-api-setup-after-first-user-is-created* is
    ;; redefined by them
    (throw (ex-info
            (tru "The /api/setup route can only be used to create the first user, however a user currently exists.")
            {:status-code 403})))
  (let [new-user   (first (t2/insert-returning-instances! :model/User
                                                          :email        email
                                                          :first_name   first-name
                                                          :last_name    last-name
                                                          :password     (str (random-uuid))
                                                          :is_superuser true))
        user-id    (u/the-id new-user)]
    ;; this results in a second db call, but it avoids redundant password code so figure it's worth it
    (user/set-password! user-id password)
    ;; then we create a session right away because we want our new user logged in to continue the setup process
    (let [session (session/create-session! :password new-user device-info)]
      ;; return user ID, session ID, and the Session object itself
      {:session-key (:key session), :user-id user-id, :session session})))

(defn- setup-maybe-create-and-invite-user! [{:keys [email] :as user}, invitor]
  (when email
    (if-not (email/email-configured?)
      (log/error "Could not invite user because email is not configured.")
      (u/prog1 (user/insert-new-user! user)
        (user/set-permissions-groups! <> [(perms/all-users-group) (perms/admin-group)])
        (events/publish-event! :event/user-invited
                               {:object
                                (assoc <>
                                       :is_from_setup true
                                       :invite_method "email"
                                       :sso_source    (:sso_source <>))
                                :details {:invitor (select-keys invitor [:email :first_name])}})
        (analytics/track-event! :snowplow/invite
                                {:event           :invite-sent
                                 :invited-user-id (u/the-id <>)
                                 :source          "setup"})))))

(defn- setup-set-settings! [{:keys [email site-name site-locale]}]
  ;; set a couple preferences
  (public-settings/site-name! site-name)
  (public-settings/admin-email! email)
  (when site-locale
    (public-settings/site-locale! site-locale))
  ;; default to `true` the setting will set itself correctly whether a boolean or boolean string is specified
  (public-settings/anon-tracking-enabled! true))

(api.macros/defendpoint :post "/"
  "Special endpoint for creating the first user during setup. This endpoint both creates the user AND logs them in and
  returns a session ID. This endpoint can also be used to add a database, create and invite a second admin, and/or
  set specific settings from the setup flow."
  [_route-params
   _query-params
   {{first-name :first_name, last-name :last_name, :keys [email password]} :user
    {invited-first-name :first_name
     invited-last-name  :last_name
     invited-email      :email} :invite
    {site-name :site_name
     site-locale :site_locale} :prefs}
   :- [:map
       [:token SetupToken]
       [:user [:map
               [:email      ms/Email]
               [:password   ms/ValidPassword]
               [:first_name {:optional true} [:maybe ms/NonBlankString]]
               [:last_name  {:optional true} [:maybe ms/NonBlankString]]]]
       [:invite {:optional true} [:map
                                  [:first_name {:optional true} [:maybe ms/NonBlankString]]
                                  [:last_name  {:optional true} [:maybe ms/NonBlankString]]
                                  [:email      {:optional true} [:maybe ms/Email]]]]
       [:prefs [:map
                [:site_name   ms/NonBlankString]
                [:site_locale {:optional true} [:maybe ms/ValidLocale]]]]]
   request]
  (letfn [(create! []
            (try
              (t2/with-transaction []
                (let [user-info (setup-create-user! {:email email
                                                     :first-name first-name
                                                     :last-name last-name
                                                     :password password
                                                     :device-info (request/device-info request)})]
                  (setup-maybe-create-and-invite-user! {:email invited-email
                                                        :first_name invited-first-name
                                                        :last_name invited-last-name}
                                                       {:email email, :first_name first-name})
                  (setup-set-settings! {:email email :site-name site-name :site-locale site-locale})
                  user-info))
              (catch Throwable e
                ;; if the transaction fails, restore the Settings cache from the DB again so any changes made in this
                ;; endpoint (such as clearing the setup token) are reverted. We can't use `dosync` here to accomplish
                ;; this because there is `io!` in this block
                (setting.cache/restore-cache!)
                (throw e))))]
    (let [{:keys [user-id session-key session]} (create!)
          superuser (t2/select-one :model/User :id user-id)]
      (events/publish-event! :event/user-login {:user-id user-id})
      (when-not (:last_login superuser)
        (events/publish-event! :event/user-joined {:user-id user-id}))
      ;; return response with session ID and set the cookie as well
      (request/set-session-cookies request {:id session-key} session (t/zoned-date-time (t/zone-id "GMT"))))))

;; User defaults endpoint

(api.macros/defendpoint :get "/user_defaults"
  "Returns object containing default user details for initial setup, if configured,
   and if the provided token value matches the token in the configuration value."
  [_route-params
   {:keys [token]}]
  (let [{config-token :token :as defaults} (config/mb-user-defaults)]
    (api/check-404 config-token)
    (api/check-403 (= token config-token))
    (dissoc defaults :token)))
