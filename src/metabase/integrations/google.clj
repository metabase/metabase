(ns metabase.integrations.google
  (:require
   [cheshire.core :as json]
   [clj-http.client :as http]
   [clojure.string :as str]
   [metabase.api.common :as api]
   [metabase.config :as config]
   [metabase.integrations.google.interface :as google.i]
   [metabase.models.setting :as setting :refer [defsetting]]
   [metabase.models.setting.multi-setting
    :refer [define-multi-setting-impl]]
   [metabase.models.user :as user :refer [User]]
   [metabase.plugins.classloader :as classloader]
   [metabase.util :as u]
   [metabase.util.i18n :refer [deferred-tru tru]]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu]
   [metabase.util.malli.schema :as ms]
   [toucan2.core :as t2]))

;; Load EE implementation if available
(when config/ee-available?
  (classloader/require 'metabase-enterprise.enhancements.integrations.google))

(def ^:private non-existant-account-message
  (deferred-tru "You'll need an administrator to create a Metabase account before you can use Google to log in."))

(defsetting google-auth-client-id
  (deferred-tru "Client ID for Google Sign-In.")
  :visibility :public
  :audit      :getter
  :setter     (fn [client-id]
                (if (seq client-id)
                  (let [trimmed-client-id (str/trim client-id)]
                    (when-not (str/ends-with? trimmed-client-id ".apps.googleusercontent.com")
                      (throw (ex-info (tru "Invalid Google Sign-In Client ID: must end with \".apps.googleusercontent.com\"")
                                      {:status-code 400})))
                    (setting/set-value-of-type! :string :google-auth-client-id trimmed-client-id))
                  (do
                   (setting/set-value-of-type! :string :google-auth-client-id nil)
                   (setting/set-value-of-type! :boolean :google-auth-enabled false)))))

(defsetting google-auth-configured
  (deferred-tru "Is Google Sign-In configured?")
  :type   :boolean
  :setter :none
  :getter (fn [] (boolean (google-auth-client-id))))

(defsetting google-auth-enabled
  (deferred-tru "Is Google Sign-in currently enabled?")
  :visibility :public
  :type       :boolean
  :audit      :getter
  :getter     (fn []
                (if-some [value (setting/get-value-of-type :boolean :google-auth-enabled)]
                  value
                  (boolean (google-auth-client-id))))
  :setter     (fn [new-value]
                (if-let [new-value (boolean new-value)]
                  (if-not (google-auth-client-id)
                    (throw (ex-info (tru "Google Sign-In is not configured. Please set the Client ID first.")
                                    {:status-code 400}))
                    (setting/set-value-of-type! :boolean :google-auth-enabled new-value))
                  (setting/set-value-of-type! :boolean :google-auth-enabled new-value))))

(define-multi-setting-impl google.i/google-auth-auto-create-accounts-domain :oss
  :getter (fn [] (setting/get-value-of-type :string :google-auth-auto-create-accounts-domain))
  :setter (fn [domain]
              (when (and domain (str/includes? domain ","))
                ;; Multiple comma-separated domains requires the `:sso-google` premium feature flag
                (throw (ex-info (tru "Invalid domain") {:status-code 400})))
              (setting/set-value-of-type! :string :google-auth-auto-create-accounts-domain domain)))

(def ^:private google-auth-token-info-url "https://www.googleapis.com/oauth2/v3/tokeninfo?id_token=%s")

(defn- google-auth-token-info
  ([token-info-response]
   (google-auth-token-info token-info-response (google-auth-client-id)))
  ([token-info-response client-id]
   (let [{:keys [status body]} token-info-response]
     (when-not (= status 200)
       (throw (ex-info (tru "Invalid Google Sign-In token.") {:status-code 400})))
     (u/prog1 (json/parse-string body keyword)
       (let [audience (:aud <>)
             audience (if (string? audience) [audience] audience)]
         (when-not (contains? (set audience) client-id)
           (throw (ex-info (tru
                             (str "Google Sign-In token appears to be incorrect. "
                                  "Double check that it matches in Google and Metabase."))
                           {:status-code 400}))))
       (when-not (= (:email_verified <>) "true")
         (throw (ex-info (tru "Email is not verified.") {:status-code 400})))))))

(defn- autocreate-user-allowed-for-email? [email]
  (boolean
   (when-let [domains (google.i/google-auth-auto-create-accounts-domain)]
     (some
      (partial u/email-in-domain? email)
      (str/split domains #"\s*,\s*")))))

(defn- check-autocreate-user-allowed-for-email
  "Throws if an admin needs to intervene in the account creation."
  [email]
  (when-not (autocreate-user-allowed-for-email? email)
    (throw
     (ex-info (str non-existant-account-message)
              {:status-code 401
               :errors  {:_error non-existant-account-message}}))))

(mu/defn ^:private google-auth-create-new-user!
  [{:keys [email] :as new-user} :- user/NewUser]
  (check-autocreate-user-allowed-for-email email)
  ;; this will just give the user a random password; they can go reset it if they ever change their mind and want to
  ;; log in without Google Auth; this lets us keep the NOT NULL constraints on password / salt without having to make
  ;; things hairy and only enforce those for non-Google Auth users
  (user/create-new-google-auth-user! new-user))

(defn- maybe-update-google-user!
  "Update google user if the first or list name changed."
  [user first-name last-name]
  (when (or (not= first-name (:first_name user))
            (not= last-name (:last_name user)))
    (t2/update! :model/User (:id user) {:first_name first-name
                                        :last_name  last-name}))
  (assoc user :first_name first-name :last_name last-name))

(mu/defn ^:private google-auth-fetch-or-create-user! :- (ms/InstanceOf User)
  [first-name last-name email]
  (let [existing-user (t2/select-one [User :id :email :last_login :first_name :last_name] :%lower.email (u/lower-case-en email))]
    (if existing-user
      (maybe-update-google-user! existing-user first-name last-name)
      (google-auth-create-new-user! {:first_name first-name
                                     :last_name  last-name
                                     :email      email}))))

(defn do-google-auth
  "Call to Google to perform an authentication"
  [{{:keys [token]} :body, :as _request}]
  (let [token-info-response                    (http/post (format google-auth-token-info-url token))
        {:keys [given_name family_name email]} (google-auth-token-info token-info-response)]
    (log/infof "Successfully authenticated Google Sign-In token for: %s %s" given_name family_name)
    (api/check-500 (google-auth-fetch-or-create-user! given_name family_name email))))
