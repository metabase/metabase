(ns metabase.comments.core
  (:require
   [metabase.comments.api :as api.comments]
   [metabase.comments.models.comment :as comment]
   [potemkin :as p]))

(comment comment/keep-me)

(p/import-vars
 [api.comments
  notify-comment-id!]
 [comment
  threads-anchored-to])
