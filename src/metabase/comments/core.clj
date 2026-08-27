(ns metabase.comments.core
  "Public surface of the `comments` module."
  (:require
   [metabase.comments.models.comment :as models.comment]
   [potemkin :as p]))

(comment
  models.comment/keep-me)

(p/import-vars
 [models.comment
  child-target-ids-for-document
  comments-for-document
  register-context-gate!])
