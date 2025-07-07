(ns metabase.sso.oauth2
  (:require
   [clj-http.client :as http]
   [clojure.string :as str]
   [metabase.api.common :as api]
   [metabase.models.permissions-group :as perms-group]
   [metabase.sso.config :as sso.config]
   [metabase.users.models.user :as user]
   [metabase.util :as u]
   [metabase.util.i18n :refer [deferred-tru tru]]
   [metabase.util.json :as json]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu]
   [metabase.util.malli.schema :as ms]
   [ring.util.codec :as codec]
   [toucan2.core :as t2])
  (:import
   [java.util UUID]))

(def ^:private non-existant-account-message
  (deferred-tru "You''ll need an administrator to create a Metabase account before you can use SSO to log in."))

(defn- generate-state []
  (str (UUID/randomUUID)))

(defn- build-auth-url [redirect-uri]
  (let [config (sso.config/get-sso-config)
        params {"client_id"     (:client_id config)
                "response_type" "code"
                "scope"         (str/join " " (:scopes config ["openid" "email" "profile"]))
                "redirect_uri"  redirect-uri
                "state"         (generate-state)}
        query-string (str/join "&" (map (fn [[k v]] (str k "=" (codec/url-encode v))) params))]
    (str (:auth_url config) "?" query-string)))

(defn- exchange-code-for-token [code redirect-uri]
  (let [config (sso.config/get-sso-config)
        response (http/post (:token_url config)
                           {:form-params {"grant_type"    "authorization_code"
                                          "code"          code
                                          "redirect_uri"  redirect-uri
                                          "client_id"     (:client_id config)
                                          "client_secret" (:client_secret config)}
                            :accept :json
                            :as :json})]
    (when-not (= (:status response) 200)
      (throw (ex-info (tru "Failed to exchange authorization code for token.") {:status-code 400})))
    (get-in response [:body :access_token])))

(defn- fetch-user-info [access-token]
  (let [config (sso.config/get-sso-config)
        response (http/get (:userinfo_url config)
                          {:headers {"Authorization" (str "Bearer " access-token)}
                           :accept :json
                           :as :json})]
    (when-not (= (:status response) 200)
      (throw (ex-info (tru "Failed to fetch user information.") {:status-code 400})))
    (:body response)))

(defn- get-user-email [user-info]
  "Extract email from user info. Try different common fields."
  (or (:email user-info)
      (:emailAddress user-info)
      (:mail user-info)
      (throw (ex-info (tru "No email found in user information.") {:status-code 400}))))

(defn- get-user-name [user-info]
  "Extract first and last name from user info. Try different common fields."
  (let [first-name (or (:given_name user-info)
                       (:first_name user-info)
                       (:firstName user-info)
                       (:givenName user-info)
                       (first (str/split (str (:name user-info)) #"\s+" 2))
                       "")
        last-name (or (:family_name user-info)
                      (:last_name user-info)
                      (:lastName user-info)
                      (:familyName user-info)
                      (:surname user-info)
                      (second (str/split (str (:name user-info)) #"\s+" 2))
                      "")]
    [first-name last-name]))

(defn- get-default-group-id []
  (let [group-name (sso.config/get-default-group)]
    (or (:id (t2/select-one :model/PermissionsGroup :name group-name))
        (:id (perms-group/all-users)))))

(defn- autocreate-user-allowed? []
  ;; For now, always allow autocreation if SSO is configured
  ;; This could be extended to check domain restrictions like Google auth
  true)

(defn- check-autocreate-user-allowed []
  "Throws if an admin needs to intervene in the account creation."
  (when-not (autocreate-user-allowed?)
    (throw
     (ex-info (str non-existant-account-message)
              {:status-code 401
               :errors {:_error non-existant-account-message}}))))

(mu/defn oauth2-auth-create-new-user!
  "Create a new SSO user."
  [{:keys [email] :as new-user} :- user/NewUser]
  (check-autocreate-user-allowed)
  ;; Create user with random password and assign to default group
  (let [user (user/create-new-google-auth-user! new-user) ; Reuse existing user creation logic
        group-id (get-default-group-id)]
    (when group-id
      (t2/insert! :model/PermissionsGroupMembership
                  {:user_id  (:id user)
                   :group_id group-id}))
    user))

(defn- maybe-update-user!
  "Update user if the first or last name changed."
  [user first-name last-name external-id]
  (let [updates (cond-> {}
                  (not= first-name (:first_name user))
                  (assoc :first_name first-name)
                  
                  (not= last-name (:last_name user))
                  (assoc :last_name last-name)
                  
                  (and external-id (not= external-id (:sso_source user)))
                  (assoc :sso_source external-id))]
    (when (seq updates)
      (t2/update! :model/User (:id user) updates))
    (merge user updates)))

(mu/defn- oauth2-auth-fetch-or-create-user! :- (ms/InstanceOf :model/User)
  [email first-name last-name external-id]
  (let [existing-user (t2/select-one [:model/User :id :email :last_login :first_name :last_name :sso_source] 
                                     :%lower.email (u/lower-case-en email))]
    (if existing-user
      (maybe-update-user! existing-user first-name last-name external-id)
      (oauth2-auth-create-new-user! {:first_name first-name
                                     :last_name  last-name
                                     :email      email
                                     :sso_source external-id}))))

(defn get-auth-url
  "Generate OAuth2 authorization URL"
  [request]
  (when-not (sso.config/sso-enabled?)
    (throw (ex-info (tru "SSO is not configured.") {:status-code 404})))
  
  (let [scheme (name (:scheme request))
        host (get-in request [:headers "host"])
        redirect-uri (str scheme "://" host "/auth/sso/callback")]
    {:auth_url (build-auth-url redirect-uri)}))

(defn handle-callback
  "Handle OAuth2 callback"
  [{{:keys [code state error]} :params :as request}]
  (when-not (sso.config/sso-enabled?)
    (throw (ex-info (tru "SSO is not configured.") {:status-code 404})))
  
  (when error
    (throw (ex-info (tru "OAuth2 error: {0}" error) {:status-code 400})))
  
  (when-not code
    (throw (ex-info (tru "No authorization code received.") {:status-code 400})))
  
  (let [scheme (name (:scheme request))
        host (get-in request [:headers "host"])
        redirect-uri (str scheme "://" host "/auth/sso/callback")
        access-token (exchange-code-for-token code redirect-uri)
        user-info (fetch-user-info access-token)
        email (get-user-email user-info)
        [first-name last-name] (get-user-name user-info)
        external-id (str (:sub user-info) "@" (sso.config/get-provider))]
    
    (log/infof "Successfully authenticated SSO user: %s %s (%s)" first-name last-name email)
    (api/check-500 (oauth2-auth-fetch-or-create-user! email first-name last-name external-id))))