(ns metabase.auth-identity.validation
  "The `validate` multimethod the AuthIdentity hooks call. It lives apart from [[metabase.auth-identity.provider]] so
  that the model does not require the login code, which writes AuthIdentities through the model."
  (:require
   [metabase.auth-identity.hierarchy :as auth-identity.hierarchy]
   [methodical.core :as methodical]))

(set! *warn-on-reflection* true)

(methodical/defmulti validate
  "Validate credentials and settings for a provider before insert/update into AuthIdentity.
   Throws an exception with error details if invalid. This ensures transaction rollback on validation failure.
   Returns nil if valid.

   This method is called from define-before-insert and define-before-update hooks in the AuthIdentity model.

   Args:
     provider: Provider keyword (e.g., :provider/password)
     auth-identity-data: Map containing :credentials, :metadata, etc.

   Returns:
     nil if valid

   Throws:
     ExceptionInfo if validation fails

   Examples:
     ;; Password provider validates credentials structure
     (validate :provider/password {:credentials {:password_hash \"...\" :password_salt \"...\"}})
     => nil

     ;; Throws if invalid
     (validate :provider/password {:credentials {:password_hash nil}})
     => throws ExceptionInfo"
  {:arglists '([provider auth-identity-data])}
  (fn [provider _auth-identity-data]
    provider)
  :hierarchy #'auth-identity.hierarchy/hierarchy)

(methodical/defmethod validate :metabase.auth-identity.provider/provider
  [_provider _auth-identity-data]
  ;; Default: no validation (SSO providers typically don't need credential validation)
  nil)
