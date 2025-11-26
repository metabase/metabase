(ns metabase.setup-rest.api
  (:require
   [java-time.api :as t]
   [metabase.analytics.core :as analytics]
   [metabase.api.macros :as api.macros]
   [metabase.appearance.core :as appearance]
   [metabase.auth-identity.core :as auth-identity]
   [metabase.events.core :as events]
   [metabase.request.core :as request]
   [metabase.settings.core :as setting]
   [metabase.setup.core :as setup]
   [metabase.system.core :as system]
   [metabase.util :as u]
   [metabase.util.i18n :as i18n :refer [tru]]
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
    (t2/update! :model/AuthIdentity :provider "password" :user_id user-id {:credentials {:plaintext_password password}})
    (let [session (auth-identity/create-session-with-auth-tracking! new-user device-info :provider/password)]
      {:session-key (:key session), :user-id user-id, :session session})))

(defn- setup-set-settings! [{:keys [email site-name site-locale]}]
  ;; set a couple preferences
  (appearance/site-name! site-name)
  (system/admin-email! email)
  (when site-locale
    (system/site-locale! site-locale))
  ;; default to `true` the setting will set itself correctly whether a boolean or boolean string is specified
  (analytics/anon-tracking-enabled! true))

;; TODO (Cam 2025-11-25) please add a response schema to this API endpoint, it makes it easier for our customers to
;; use our API + we will need it when we make auto-TypeScript-signature generation happen
;;
#_{:clj-kondo/ignore [:metabase/validate-defendpoint-has-response-schema]}
(api.macros/defendpoint :post "/"
  "Special endpoint for creating the first user during setup. This endpoint both creates the user AND logs them in and
  returns a session ID. This endpoint can also be used to set specific settings from the setup flow."
  [_route-params
   _query-params
   {{first-name :first_name, last-name :last_name, :keys [email password]} :user
    {site-name :site_name
     site-locale :site_locale} :prefs}
   :- [:map
       [:token SetupToken]
       [:user [:map
               [:email      ms/Email]
               [:password   ms/ValidPassword]
               [:first_name {:optional true} [:maybe ms/NonBlankString]]
               [:last_name  {:optional true} [:maybe ms/NonBlankString]]]]
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
                  (setup-set-settings! {:email email :site-name site-name :site-locale site-locale})
                  user-info))
              (catch Throwable e
                ;; if the transaction fails, restore the Settings cache from the DB again so any changes made in this
                ;; endpoint (such as clearing the setup token) are reverted. We can't use `dosync` here to accomplish
                ;; this because there is `io!` in this block
                (setting/restore-cache!)
                (throw e))))]
    (let [{:keys [user-id session-key session]} (create!)
          superuser (t2/select-one :model/User :id user-id)]
      (events/publish-event! :event/user-login {:user-id user-id})
      (when-not (:last_login superuser)
        (events/publish-event! :event/user-joined {:user-id user-id}))
      ;; return response with session ID and set the cookie as well
      (request/set-session-cookies request {:id session-key} session (t/zoned-date-time (t/zone-id "GMT"))))))
