(ns metabase.users.core
  (:require
   [metabase.users.util]
   [potemkin :as p]))

(comment metabase.users.util/keep-me)

(p/import-vars
 [metabase.users.util
  check-self-or-superuser
  fetch-user
  filter-clauses-without-paging
  invite-user!
  maybe-set-user-group-memberships!])
