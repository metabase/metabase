(ns metabase.comments.core
  "Public surface of the `comments` module."
  (:require
   [metabase.comments.api]
   [metabase.comments.models.comment]
   [potemkin :as p]))

(comment
  metabase.comments.api/keep-me
  metabase.comments.models.comment/keep-me)

(p/import-vars
 [metabase.comments.api
  notify-comment-id!]
 [metabase.comments.models.comment
  child-target-ids-for-document
  comments-for-document
  register-context-gate!])
