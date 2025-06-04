(ns metabase.sso.google
  (:require
   [clj-http.client :as http]
   [clojure.string :as str]
   [metabase.api.common :as api]
   [metabase.sso.settings :as sso.settings]
   [metabase.users.models.user :as user]
   [metabase.util :as u]
   [metabase.util.i18n :refer [deferred-tru tru]]
   [metabase.util.json :as json]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu]
   [metabase.util.malli.schema :as ms]
   [toucan2.core :as t2]))

(def ^:private non-existant-account-message
  (deferred-tru "You''ll need an administrator to create a Metabase account before you can use Google to log in."))

(def ^:private google-auth-token-info-url "https://www.googleapis.com/oauth2/v3/tokeninfo?id_token=%s")

(defn- google-auth-token-info
  ([token-info-response]
   (google-auth-token-info token-info-response (sso.settings/google-auth-client-id)))
  ([token-info-response client-id]
   (let [{:keys [status body]} token-info-response]
     (when-not (= status 200)
       (throw (ex-info (tru "Invalid Google Sign-In token.") {:status-code 400})))
     (u/prog1 (json/decode+kw body)
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
   (when-let [domains (sso.settings/google-auth-auto-create-accounts-domain)]
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

(mu/defn google-auth-create-new-user!
  "Create a new Google Auth user."
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

(mu/defn- google-auth-fetch-or-create-user! :- (ms/InstanceOf :model/User)
  [first-name last-name email]
  (let [existing-user (t2/select-one [:model/User :id :email :last_login :first_name :last_name] :%lower.email (u/lower-case-en email))]
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
