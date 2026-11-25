(ns metabase.secrets.core
  (:require
   [metabase.secrets.models.secret]
   [potemkin :as p]))

(comment metabase.secrets.models.secret/keep-me)

(p/import-vars
 [metabase.secrets.models.secret
  clean-secret-properties-from-database
  clean-secret-properties-from-details
  latest-for-id
  protected-password
  secret-conn-props-by-name
  to-json-hydrate-redacted-secrets
  uploaded-base-64-prefix-pattern
  value-as-file!
  value-as-string])
