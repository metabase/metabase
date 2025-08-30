(ns metabase.query-permissions.core
  "`query-permissions` is a module for calculating permissions for ad-hoc queries. This is separate from the main
  `permissions` module because it has a dependency on the `query-processor` and we want to keep the dependencies of
  `permissions` itself to a minimum."
  (:require
   [metabase.query-permissions.impl]
   [potemkin :as p]))

(p/import-vars
 [metabase.query-permissions.impl
  can-query-table?
  can-run-query?
  check-card-read-perms
  check-card-result-metadata-data-perms
  check-data-perms
  check-result-metadata-data-perms
  check-run-permissions-for-query
  has-perm-for-query?
  perms-exception
  query->source-ids
  query->source-table-ids
  required-perms-for-query])

(defmacro with-card-instances
  "Provide a map of Card ID -> instance to use instead of hitting a metadata provider for more efficient perms
  calculation.

  TODO -- we should just rework the functions in question to take an explicit metadata provider that you can pre-warm
  as needed. I guess the one thing stopping is us that 'transient dashboards' create Cards that don't even have
  integer IDs yet. Maybe we can think of a way to decouple this stuff. -- Cam"
  [card-id->instance & body]
  `(binding [metabase.query-permissions.impl/*card-instances* ~card-id->instance]
     ~@body))
