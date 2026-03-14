(ns metabase.server.middleware.mfa-enforcement
  "Ring middleware that enforces MFA setup for password-authenticated users when the `require-mfa`
   setting is enabled. Returns 403 for non-allowlisted API requests from users who haven't set up TOTP."
  (:require
   [clojure.string :as str]
   [metabase.session.settings :as session.settings]))

(set! *warn-on-reflection* true)

(def ^:private allowlisted-paths
  "Paths that are always accessible, even when MFA enforcement is active.
   Users need these to complete MFA setup, view their account, and log out."
  #{"/api/user/current"
    "/api/mfa/setup"
    "/api/mfa/confirm"
    "/api/session"
    "/api/session/properties"
    "/api/setting/require-mfa"})

(defn- allowlisted-request?
  "Check whether this request path is allowlisted for MFA-pending users."
  [{:keys [uri]}]
  (or (contains? allowlisted-paths uri)
      ;; Allow non-API paths (static assets, health check, etc.)
      (not (str/starts-with? uri "/api/"))))

(defn- mfa-enforcement-applies?
  "Should MFA enforcement block this request?
   Returns true when:
   1. require-mfa setting is enabled
   2. User is authenticated via session (not API key)
   3. User is a password-auth user (no SSO source)
   4. User has not set up TOTP
   5. Request is not on the allowlist"
  [request]
  (and (session.settings/require-mfa)
       ;; Only enforce for session-based auth (not API keys)
       (not (get-in request [:headers "x-api-key"]))
       ;; Only enforce for password-auth users (SSO users are exempt)
       (not (:sso-source request))
       ;; Only enforce for users who haven't set up TOTP
       (not (:totp-enabled? request))
       ;; Only block non-allowlisted paths
       (not (allowlisted-request? request))))

(defn wrap-enforce-mfa
  "Middleware that blocks API requests from password-authenticated users who haven't set up TOTP
   when the `require-mfa` setting is enabled. Returns a 403 response with `{:mfa-setup-required true}`
   so the frontend can redirect to the MFA setup page."
  [handler]
  (fn [request respond raise]
    (if (mfa-enforcement-applies? request)
      (respond {:status  403
                :headers {"Content-Type" "application/json; charset=utf-8"}
                :body    {:mfa-setup-required true
                          :message            "Two-factor authentication setup is required for your account."}})
      (handler request respond raise))))
