(ns metabase.users.core
  (:require
   [metabase.users.models.user]
   [potemkin :as p]))

(comment
  (metabase.users.models.user/keep-me))

(p/import-vars
 [metabase.users.models.user
  insert-new-user!])
