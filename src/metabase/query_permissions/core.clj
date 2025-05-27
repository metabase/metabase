(ns metabase.query-permissions.core
  (:require
   [metabase.query-permissions.impl]
   [potemkin :as p]))

(p/import-vars
 [metabase.query-permissions.impl
  can-query-table?
  can-run-query?
  check-card-read-perms
  check-data-perms
  check-run-permissions-for-query
  has-perm-for-query?
  perms-exception
  query->source-ids
  query->source-table-ids
  required-perms-for-query])

(defmacro ^:deprecated with-card-instances
  "Provide a map of Card ID -> instance to use instead of hitting a metadata provider for more efficient perms
  calculation.

  TODO -- we should just rework the functions in question to take an explicit metadata provider that you can pre-warm
  as needed. -- Cam"
  [card-id->instance & body]
  `(binding [metabase.query-permissions.impl/*card-instances* ~card-id->instance]
     ~@body))
