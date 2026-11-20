(ns metabase.users.core
  (:require
   [metabase.users.util]
   [metabase.users.write]
   [potemkin :as p]))

(comment metabase.users.util/keep-me
         metabase.users.write/keep-me)

(p/import-vars
 [metabase.users.util
  check-self-or-superuser
  fetch-user
  filter-clauses-without-paging]
 [metabase.users.write
  invite-user!
  maybe-set-user-group-memberships!
  reactivate-user!
  update-user!])
