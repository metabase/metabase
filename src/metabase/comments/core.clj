(ns metabase.comments.core
  (:require
   [metabase.comments.api :as api.comments]
   [potemkin :as p]))

(p/import-vars
 [api.comments
  notify-comment-id!])
