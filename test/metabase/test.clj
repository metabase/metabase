(ns metabase.test
  "The stuff you need to write almost every test, all in one place. Nice!

  (Prefer using `metabase.test` to requiring bits and pieces from these various namespaces going forward, since it
  reduces the cognitive load required to write tests.)"
  (:refer-clojure :exclude [compile])
  (:require
   [humane-are.core :as humane-are]
   [metabase.config :as config]
   [metabase.driver :as driver]
   [metabase.driver.sql-jdbc.test-util :as sql-jdbc.tu]
   [metabase.driver.sql.query-processor-test-util :as sql.qp-test-util]
   [metabase.email-test :as et]
   [metabase.http-client :as client]
   [metabase.lib.jvm.test-util :as lib.jvm.test-util]
   [metabase.query-processor :as qp]
   [metabase.query-processor-test :as qp.test]
   [metabase.query-processor.test-util :as qp.test-util]
   [metabase.server.middleware.session :as mw.session]
   [metabase.test-runner.assert-exprs :as test-runner.assert-exprs]
   [metabase.test.data :as data]
   [metabase.test.data.datasets :as datasets]
   [metabase.test.data.env :as tx.env]
   [metabase.test.data.impl :as data.impl]
   [metabase.test.data.interface :as tx]
   [metabase.test.data.users :as test.users]
   [metabase.test.initialize :as initialize]
   [metabase.test.misc :as test.misc]
   [metabase.test.persistence :as test.persistence]
   [metabase.test.redefs]
   [metabase.test.util :as tu]
   [metabase.test.util.async :as tu.async]
   [metabase.test.util.i18n :as i18n.tu]
   [metabase.test.util.log :as tu.log]
   [metabase.test.util.random :as tu.random]
   [metabase.test.util.timezone :as test.tz]
   [pjstadig.humane-test-output :as humane-test-output]
   [potemkin :as p]
   [toucan.util.test :as tt]
   [toucan2.tools.with-temp :as t2.with-temp]))

(set! *warn-on-reflection* true)

(humane-are/install!)

;; don't enable humane-test-output when running tests from the CLI, it breaks diffs.
(when-not config/is-test?
  (humane-test-output/activate!))

;; Fool the linters into thinking these namespaces are used! See discussion on
;; https://github.com/clojure-emacs/refactor-nrepl/pull/270
(comment
  client/keep-me
  data.impl/keep-me
  data/keep-me
  datasets/keep-me
  driver/keep-me
  et/keep-me
  i18n.tu/keep-me
  initialize/keep-me
  lib.jvm.test-util/keep-me
  metabase.test.redefs/keep-me
  mw.session/keep-me
  qp.test-util/keep-me
  qp.test/keep-me
  qp/keep-me
  sql-jdbc.tu/keep-me
  sql.qp-test-util/keep-me
  t2.with-temp/keepme
  test-runner.assert-exprs/keep-me
  test.misc/keep-me
  test.persistence/keep-me
  test.tz/keep-me
  test.users/keep-me
  tt/keep-me
  tu.async/keep-me
  tu.log/keep-me
  tu.random/keep-me
  tu/keep-me
  tx.env/keep-me
  tx/keep-me)

;; Add more stuff here as needed
#_{:clj-kondo/ignore [:discouraged-var]}
(p/import-vars
 [actions.test-util
  with-actions
  with-actions-disabled
  with-actions-enabled
  with-actions-test-data
  with-actions-test-data-tables
  with-actions-test-data-and-actions-enabled
  with-empty-db
  with-temp-test-data]

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
  with-empty-h2-app-db]

 [data.impl
  *db-is-temp-copy?*]

 [datasets
  test-driver
  test-drivers
  when-testing-driver]

 [driver
  with-driver]

 [et
  email-to
  fake-inbox-email-fn
  inbox
  received-email-body?
  received-email-subject?
  regex-email-bodies
  reset-inbox!
  summarize-multipart-email
  with-expected-messages
  with-fake-inbox]

 [client
  authenticate
  build-url
  client
  client-full-response]

 [i18n.tu
  with-mock-i18n-bundles
  with-user-locale]

 [initialize
  initialize-if-needed!]

 [lib.jvm.test-util
  pmbql-query-for-source-card]

 [mw.session
  with-current-user]

 [qp
  compile
  preprocess
  process-query]

 [qp.test
  col
  cols
  first-row
  format-rows-by
  formatted-rows
  nest-query
  normal-drivers
  normal-drivers-except
  normal-drivers-with-feature
  normal-drivers-without-feature
  rows
  rows+column-names
  with-bigquery-fks]

 [qp.test-util
  card-with-source-metadata-for-query
  store-contents
  with-database-timezone-id
  with-everything-store
  with-report-timezone-id
  with-results-timezone-id]

 [sql-jdbc.tu
  sql-jdbc-drivers]

 [sql.qp-test-util
  with-native-query-testing-context]

 [test-runner.assert-exprs
  derecordize]

 [test.misc
  with-clock
  with-single-admin-user
  test-qp-middleware
  object-defaults]

 [test.persistence
  with-persistence-enabled]

 [test.users
  fetch-user
  test-user?
  user->credentials
  user->id
  user-descriptor
  user-http-request
  with-group
  with-group-for-user
  with-test-user]

 [tt
  with-temp*]

 [t2.with-temp
  with-temp
  with-temp-defaults]

 [tu
  boolean-ids-and-timestamps
  call-with-paused-query
  discard-setting-changes
  doall-recursive
  file->bytes
  is-uuid-string?
  obj->json->obj
  postwalk-pred
  round-all-decimals
  scheduler-current-tasks
  secret-value-equals?
  select-keys-sequentially
  throw-if-called
  with-all-users-permission
  with-column-remappings
  with-discarded-collections-perms-changes
  with-env-keys-renamed-by
  with-locale
  with-model-cleanup
  with-non-admin-groups-no-root-collection-for-namespace-perms
  with-non-admin-groups-no-root-collection-perms
  with-temp-env-var-value
  with-temp-dir
  with-temp-file
  with-temp-scheduler
  with-temp-vals-in-db
  with-temporary-setting-values
  with-temporary-raw-setting-values
  with-user-in-groups]

 [tu.async
  wait-for-result
  with-open-channels]

 [tu.log
  ns-log-level
  set-ns-log-level!
  with-log-messages-for-level
  with-log-level]

 [tu.random
  random-name
  random-hash
  random-email]

 [test.tz
  with-system-timezone-id]

 [tx
  count-with-template-tag-query
  count-with-field-filter-query
  dataset-definition
  db-qualified-table-name
  db-test-env-var
  db-test-env-var!
  db-test-env-var-or-throw
  dbdef->connection-details
  defdataset
  dispatch-on-driver-with-test-extensions
  get-dataset-definition
  has-test-extensions?
  metabase-instance
  sorts-nil-first?
  supports-time-type?
  supports-timestamptz-type?]

 [tx.env
  set-test-drivers!
  with-test-drivers])

;;; these are deprecated at runtime so Kondo doesn't complain, also because we can't go around deprecating stuff from
;;; other libaries any other way. They're marked deprecated to encourage you to use the `t2.with-temp` versions.
#_{:clj-kondo/ignore [:discouraged-var]}
(alter-meta! #'with-temp* assoc :deprecated true)
