(ns metabase-enterprise.comments.core
  (:require
   [metabase-enterprise.comments.api :as api.comments]
   [potemkin :as p]))

(p/import-vars
 [api.comments
  notify-comment-id!])
