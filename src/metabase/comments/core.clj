(ns metabase.comments.core
  "Public surface of the `comments` module."
  (:require
   [metabase.comments.models.comment]
   [potemkin :as p]))

(comment
  metabase.comments.models.comment/keep-me)

(p/import-vars
 [metabase.comments.models.comment
  register-context-gate!])
