(ns metabase.auth-identity.core
  "Public API for the auth_identity module. This namespace provides the interface for managing
  authentication identities for users."
  (:require
   [metabase.auth-identity.models.auth-identity :as auth-identity]
   [metabase.auth-identity.provider :as provider]
   [metabase.auth-identity.providers.emailed-secret :as emailed-secret]
   [metabase.auth-identity.session :as auth-session]
   [potemkin :as p]))

;; Import model query functions
(p/import-vars
 [auth-identity
  hash-password-credentials])

;; ==============================================================================
;; Provider Multimethod System
;; ==============================================================================
;;
;; The auth-identity module uses a multimethod-based provider system for authentication.
;; Each provider (password, LDAP, Google, JWT, SAML) implements these three multimethods:
;;
;; - validate: Validate credentials before insert/update (throws on error)
;; - authenticate: Core authentication logic (returns success/failure/redirect)
;; - login!: Complete login orchestration (calls authenticate, creates session)
;;
;; ## Implementing a New Provider
;;
;; 1. Create a namespace for your provider (e.g., metabase.sso.providers.my-provider)
;; 2. Declare hierarchy: (derive :provider/my-provider ::provider/provider)
;; 3. For SSO providers: (derive :provider/my-provider ::provider/create-user-if-not-exists)
;; 4. Implement authenticate multimethod (required)
;; 5. Optionally implement validate for credential validation
;;
;; See metabase.auth-identity.provider namespace for detailed documentation and examples.
;;
;; ## Success States
;;
;; The authenticate and login! methods support three success states:
;; - {:success? true ...}       - Authentication succeeded
;; - {:success? :redirect ...}  - Need redirect to external provider (OAuth/OIDC)
;; - {:success? false ...}      - Authentication failed
;;
;; ==============================================================================

(p/import-vars
 [provider
  validate
  authenticate
  login!
  provider-string->keyword
  provider-keyword->string])

;; Import session integration functions
(p/import-vars
 [auth-session
  create-session-with-auth-tracking!])

;; Import emailed-secret provider functions
(p/import-vars
 [emailed-secret
  create-password-reset!
  create-reset-token-metadata
  generate-reset-token
  mark-token-consumed])

(defn with-fallback
  "Try multiple providers until one works. Always returns the result of the last provider run."
  [method [provider & rst-providers] request]
  (let [{:keys [success?] :as response} (try (method provider request)
                                             (catch Throwable _
                                               {:success? false}))]
    (if (or success? (empty? rst-providers))
      response
      (recur method rst-providers request))))
