(ns metabase.session.core
  (:require
   [metabase.session.models.session :as session]
   [potemkin :as p]))

(comment session/keep-me)

(p/import-vars
 [session
  create-session!
  generate-session-key
  generate-session-id
  hash-session-key])
