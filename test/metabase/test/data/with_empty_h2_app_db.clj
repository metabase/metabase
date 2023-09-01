(ns metabase.test.data.with-empty-h2-app-db
  (:require
   [metabase.db :as mdb]
   [metabase.db.schema-migrations-test.impl
    :as schema-migrations-test.impl]
   [metabase.models.permissions-group :as perms-group]))

(defmacro with-empty-h2-app-db
  "Runs `body` under a new, blank, H2 application database (randomly named), in which all model tables have been
  created via Liquibase schema migrations. After `body` is finished, the original app DB bindings are restored.

  Makes use of functionality in the [[metabase.db.schema-migrations-test.impl]] namespace since that already does what
  we need."
  {:style/indent 0}
  [& body]
  `(schema-migrations-test.impl/with-temp-empty-app-db [conn# :h2]
     (schema-migrations-test.impl/run-migrations-in-range! conn# [0 "v99.00-000"]) ; this should catch all migrations)
     ;; since the actual group defs are not dynamic, we need with-redefs to change them here
     (with-redefs [perms-group/all-users (#'perms-group/magic-group perms-group/all-users-group-name)
                   perms-group/admin     (#'perms-group/magic-group perms-group/admin-group-name)]
       (mdb/setup-db!)
       ~@body)))
