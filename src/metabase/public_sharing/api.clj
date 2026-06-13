(ns metabase.public-sharing.api
  "OSS stubs for public-link password management. EE implementations live in
  `metabase-enterprise.public-link-passwords.core`."
  (:require
   [metabase.premium-features.core :refer [defenterprise]]
   [metabase.util.i18n :refer [tru]]))

(defenterprise set-public-link-password!
  "Validate, encrypt, and store a password on a public link. OSS: throws 402."
  metabase-enterprise.public-link-passwords.core
  [_model _id _password]
  (throw (ex-info (tru "Setting passwords on public links is a paid feature.") {:status-code 402})))

(defenterprise get-public-link-password-existence
  "Return whether a public link has a password set, without exposing the secret. OSS: throws 402."
  metabase-enterprise.public-link-passwords.core
  [_model _id]
  (throw (ex-info (tru "Public link passwords is a paid feature.") {:status-code 402})))

(defenterprise get-public-link-password-value
  "Return the decrypted plaintext password for a public link. OSS: throws 402."
  metabase-enterprise.public-link-passwords.core
  [_model _id]
  (throw (ex-info (tru "Public link passwords is a paid feature.") {:status-code 402})))

(defenterprise delete-public-link-password!
  "Remove the password from a public link without revoking it. OSS: throws 402."
  metabase-enterprise.public-link-passwords.core
  [_model _id]
  (throw (ex-info (tru "Public link passwords is a paid feature.") {:status-code 402})))
