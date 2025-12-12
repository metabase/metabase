(ns metabase.sso.providers.google
  "Google OAuth authentication provider implementation."
  (:require
   [clj-http.client :as http]
   [metabase.auth-identity.core :as auth-identity]
   [metabase.sso.google :as sso.google]
   [metabase.util.i18n :refer [tru]]
   [metabase.util.log :as log]
   [methodical.core :as methodical]))

(set! *warn-on-reflection* true)

;; Register Google OAuth provider
(derive :provider/google :metabase.auth-identity.provider/provider)
(derive :provider/google :metabase.auth-identity.provider/create-user-if-not-exists)

(def ^:private google-auth-token-info-url "https://www.googleapis.com/oauth2/v3/tokeninfo?id_token=%s")

(methodical/defmethod auth-identity/authenticate :provider/google
  [_provider {:keys [token] :as _request}]
  (cond
    (not token)
    {:success? false
     :error :invalid-request
     :message "Google ID token is required"}

    :else
    (try
      (let [token-info-response (http/post (format google-auth-token-info-url token))
            {first-name :given_name last-name  :family_name :keys [email]}
            (sso.google/google-auth-token-info token-info-response)]
        (log/infof "Successfully authenticated Google Sign-In token for: %s %s" first-name last-name)
        ;; Always return user data - let login! handle account creation policy
        {:success? true
         :user-data {:email email
                     :first_name first-name
                     :last_name last-name
                     :sso_source :google}
         :provider-id email})
      (catch clojure.lang.ExceptionInfo e
        (log/errorf e "Google authentication failed: %s" (.getMessage e))
        {:success? false
         :error :authentication-failed
         :message (.getMessage e)})
      (catch Exception e
        (log/errorf e "Unexpected error during Google authentication: %s" (.getMessage e))
        {:success? false
         :error :server-error
         :message "An unexpected error occurred during authentication"}))))

(methodical/defmethod auth-identity/login! :provider/google
  "Handle Google login with account creation policy enforcement.

   This method checks if auto-creation is allowed for the user's email domain
   before allowing the user to be created. If the user already exists, they can
   log in regardless of the domain policy."
  [provider request]
  (cond
    ;; Authentication needs redirect (shouldn't happen for Google but handle it)
    (= :redirect (:success? request))
    request

    ;; Authentication failed
    (not (:success? request))
    request

    ;; Authentication succeeded - check account creation policy
    :else
    (if (or (sso.google/autocreate-user-allowed-for-email? (get-in request [:user-data :email]))
            (:user request))
      (next-method provider request)
      {:success? false
       :error :account-creation-not-allowed
       :message (tru "You''ll need an administrator to create a Metabase account before you can use Google to log in.")})))
