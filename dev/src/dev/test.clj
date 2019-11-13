(ns dev.test
  "The stuff you need to write almost every test, all in one place. Nice!"
  (:require [metabase
             [driver :as driver]
             [query-processor :as qp]
             [query-processor-test :as qp.test]]
            [metabase.driver.sql-jdbc-test :as sql-jdbc-test]
            [metabase.query-processor.test-util :as qp.test-util]
            [metabase.test
             [data :as data]
             [initialize :as initialize]
             [util :as tu]]
            [metabase.test.data
             [datasets :as datasets]
             [env :as tx.env]
             [interface :as tx]
             [users :as test-users]]
            [metabase.test.util
             [log :as tu.log]
             [timezone :as tu.tz]]
            [potemkin :as p]
            [toucan.util.test :as tt]))

;; Fool the linters into thinking these namespaces are used! See discussion on
;; https://github.com/clojure-emacs/refactor-nrepl/pull/270
(comment
  data/keep-me
  datasets/keep-me
  driver/keep-me
  initialize/keep-me
  qp/keep-me
  qp.test-util/keep-me
  qp.test/keep-me
  sql-jdbc-test/keep-me
  [test-users/keep-me]
  tt/keep-me
  tu/keep-me
  tu.log/keep-me
  tu.tz/keep-me
  tx/keep-me
  tx.env/keep-me)

;; Add more stuff here as needed
(p/import-vars
 [data
  $ids
  dataset
  db
  format-name
  id
  mbql-query
  native-query
  query
  run-mbql-query
  with-db
  with-temp-copy-of-db
  with-temp-objects]

 [datasets
  test-driver
  test-drivers
  when-testing-driver]

 [driver
  *driver*
  with-driver]

 [initialize
  initialize-if-needed!]

 [qp
  process-query
  query->native
  query->preprocessed]

 [qp.test
  col
  cols
  first-row
  format-rows-by
  formatted-rows
  normal-drivers
  normal-drivers-except
  normal-drivers-with-feature
  normal-drivers-without-feature
  rows
  rows+column-names]

 [qp.test-util
  with-everything-store]

 [sql-jdbc-test
  sql-jdbc-drivers]

 [test-users
  user->id
  user->client
  with-test-user]

 [tt
  with-temp
  with-temp*]

 [tu
  boolean-ids-and-timestamps
  call-with-paused-query
  discard-setting-changes
  doall-recursive
  exception-and-message
  is-uuid-string?
  metabase-logger
  postwalk-pred
  random-email
  random-name
  round-all-decimals
  scheduler-current-tasks
  throw-if-called
  with-log-messages
  with-log-messages-for-level
  with-log-level
  with-model-cleanup
  with-non-admin-groups-no-root-collection-perms
  with-scheduler
  with-temp-scheduler
  with-temp-vals-in-db
  with-temporary-setting-values]

 [tu.log
  suppress-output]

 [tu.tz
  with-jvm-tz]

 [tx
  dataset-definition
  db-qualified-table-name
  db-test-env-var
  db-test-env-var-or-throw
  dbdef->connection-details
  get-dataset-definition
  has-questionable-timezone-support?
  has-test-extensions?
  metabase-instance]

 [tx.env
  set-test-drivers!
  test-drivers
  with-test-drivers])
