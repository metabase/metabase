(ns metabase.sso.google
  (:require
   [clojure.string :as str]
   [metabase.sso.settings :as sso.settings]
   [metabase.util :as u]
   [metabase.util.i18n :refer [tru]]
   [metabase.util.json :as json]))

(defn google-auth-token-info
  "Validates and parses Google Sign-In token information from an HTTP response.

  Takes a `token-info-response` (an HTTP response map with `:status` and `:body` keys) and optionally a `client-id`
  to validate against. If `client-id` is not provided, uses the configured Google auth client ID from settings.

  Validates that:
  - The response status is 200
  - The token's audience (`:aud`) matches the expected client ID
  - The email in the token is verified (`:email_verified` is `\"true\"`)

  Returns the parsed token info as a Clojure map with keyword keys.

  Throws an ex-info with a 400 status code if validation fails."
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

(defn autocreate-user-allowed-for-email?
  "Checks whether automatic user creation is allowed for the given email address.

  Returns `true` if the `email` address belongs to one of the domains configured in the Google auth auto-create
  accounts domain setting. The setting should be a comma-separated list of allowed domains.

  Returns `false` if no domains are configured or if the email doesn't match any configured domain."
  [email]
  (boolean
   (when-let [domains (sso.settings/google-auth-auto-create-accounts-domain)]
     (some
      (partial u/email-in-domain? email)
      (str/split domains #"\s*,\s*")))))
