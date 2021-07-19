(ns metabase.integrations.google
  (:require [cheshire.core :as json]
            [clj-http.client :as http]
            [clojure.string :as str]
            [clojure.tools.logging :as log]
            [metabase.api.common :as api]
            [metabase.integrations.google.interface :as google.i]
            [metabase.models.setting :as setting :refer [defsetting]]
            [metabase.models.setting.multi-setting :refer [define-multi-setting-impl]]
            [metabase.models.user :as user :refer [User]]
            [metabase.plugins.classloader :as classloader]
            [metabase.util :as u]
            [metabase.util.i18n :as ui18n :refer [deferred-tru trs tru]]
            [schema.core :as s]
            [toucan.db :as db]))

;; Load EE implementation if available
(u/ignore-exceptions (classloader/require 'metabase-enterprise.enhancements.integrations.google))

(def ^:private non-existant-account-message
  (deferred-tru "You'll need an administrator to create a Metabase account before you can use Google to log in."))

(defsetting google-auth-client-id
  (deferred-tru "Client ID for Google Auth SSO. If this is set, Google Auth is considered to be enabled.")
  :visibility :public)

(define-multi-setting-impl google.i/google-auth-auto-create-accounts-domain :oss
  :getter (fn [] (setting/get-string :google-auth-auto-create-accounts-domain))
  :setter (fn [domain]
              (when (and domain (str/includes? domain ","))
                ;; Multiple comma-separated domains is EE-only feature
                (throw (ex-info (tru "Invalid domain") {:status-code 400})))
              (setting/set-string! :google-auth-auto-create-accounts-domain domain)))

(def ^:private google-auth-token-info-url "https://www.googleapis.com/oauth2/v3/tokeninfo?id_token=%s")

(defn- google-auth-token-info
  ([token-info-response]
   (google-auth-token-info token-info-response (google-auth-client-id)))
  ([token-info-response client-id]
   (let [{:keys [status body]} token-info-response]
     (when-not (= status 200)
       (throw (ex-info (tru "Invalid Google Auth token.") {:status-code 400})))
     (u/prog1 (json/parse-string body keyword)
       (let [audience (:aud <>)
             audience (if (string? audience) [audience] audience)]
         (when-not (contains? (set audience) client-id)
           (throw (ex-info (str (deferred-tru "Google Auth token appears to be incorrect. ")
                                (deferred-tru "Double check that it matches in Google and Metabase."))
                           {:status-code 400}))))
       (when-not (= (:email_verified <>) "true")
         (throw (ex-info (tru "Email is not verified.") {:status-code 400})))))))

; TODO - are these general enough to move to `metabase.util`?
(defn- email->domain ^String [email]
  (last (re-find #"^.*@(.*$)" email)))

(defn- email-in-domain? ^Boolean [email domain]
  {:pre [(u/email? email)]}
  (= (email->domain email) domain))

(defn- autocreate-user-allowed-for-email? [email]
  (boolean
   (when-let [domains (google.i/google-auth-auto-create-accounts-domain)]
     (some
      (partial email-in-domain? email)
      (str/split domains #"\s*,\s*")))))

(defn- check-autocreate-user-allowed-for-email
  "Throws if an admin needs to intervene in the account creation."
  [email]
  (when-not (autocreate-user-allowed-for-email? email)
    (throw
     (ex-info (str non-existant-account-message)
              {:status-code 401
               :errors  {:_error non-existant-account-message}}))))

(s/defn ^:private google-auth-create-new-user!
  [{:keys [email] :as new-user} :- user/NewUser]
  (check-autocreate-user-allowed-for-email email)
  ;; this will just give the user a random password; they can go reset it if they ever change their mind and want to
  ;; log in without Google Auth; this lets us keep the NOT NULL constraints on password / salt without having to make
  ;; things hairy and only enforce those for non-Google Auth users
  (user/create-new-google-auth-user! new-user))

(s/defn ^:private google-auth-fetch-or-create-user! :- metabase.models.user.UserInstance
  [first-name last-name email]
  (or (db/select-one [User :id :email :last_login] :%lower.email (u/lower-case-en email))
                      (google-auth-create-new-user! {:first_name first-name
                                                     :last_name  last-name
                                                     :email      email})))

(defn do-google-auth
  "Call to Google to perform an authentication"
  [{{:keys [token]} :body, :as request}]
  (let [token-info-response                    (http/post (format google-auth-token-info-url token))
        {:keys [given_name family_name email]} (google-auth-token-info token-info-response)]
    (log/info (trs "Successfully authenticated Google Auth token for: {0} {1}" given_name family_name))
    (api/check-500 (google-auth-fetch-or-create-user! given_name family_name email))))
