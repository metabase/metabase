(ns metabase.comments.core
  (:require
   [metabase.comments.api :as api.comments]
   [metabase.comments.models.comment :as models.comment]
   [potemkin :as p]))

(comment
  api.comments/keep-me
  models.comment/keep-me)

(p/import-vars
 [api.comments
  notify-comment-id!]
 [models.comment
  child-target-ids-for-document
  comments-for-document])
