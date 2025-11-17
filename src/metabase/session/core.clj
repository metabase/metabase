(ns metabase.session.core
  (:require
   [metabase.session.models.session]
   [metabase.session.settings]
   [potemkin :as p]))

(comment metabase.session.models.session/keep-me
         metabase.session.settings/keep-me)

(p/import-vars
 [metabase.session.models.session
  generate-session-key
  generate-session-id
  hash-session-key]
 (metabase.session.settings
  enable-password-login
  enable-password-login!
  password-complexity
  session-cookies))
