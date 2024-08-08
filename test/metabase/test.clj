(ns metabase.test
  "The stuff you need to write almost every test, all in one place. Nice!

  (Prefer using `metabase.test` to requiring bits and pieces from these various namespaces going forward, since it
  reduces the cognitive load required to write tests.)"
  (:require
   [humane-are.core :as humane-are]
   [mb.hawk.assert-exprs.approximately-equal :as hawk.approx]
   [mb.hawk.init]
   [mb.hawk.parallel]
   [metabase.actions.test-util :as actions.test-util]
   [metabase.config :as config]
   [metabase.db.schema-migrations-test.impl :as schema-migrations-test.impl]
   [metabase.driver :as driver]
   [metabase.driver.sql-jdbc.test-util :as sql-jdbc.tu]
   [metabase.driver.sql.query-processor-test-util :as sql.qp-test-util]
   [metabase.email-test :as et]
   [metabase.http-client :as client]
   [metabase.lib.metadata.jvm :as lib.metadata.jvm]
   [metabase.permissions.test-util :as perms.test-util]
   [metabase.query-processor :as qp]
   [metabase.query-processor.store :as qp.store]
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
   [metabase.test.persistence :as test.persistence]
   [metabase.test.redefs :as test.redefs]
   [metabase.test.util :as tu]
   [metabase.test.util.async :as tu.async]
   [metabase.test.util.dynamic-redefs :as tu.dr]
   [metabase.test.util.i18n :as i18n.tu]
   [metabase.test.util.log :as tu.log]
   [metabase.test.util.misc :as tu.misc]
   [metabase.test.util.public-settings :as tu.public-setings]
   [metabase.test.util.thread-local :as tu.thread-local]
   [metabase.test.util.timezone :as test.tz]
   [metabase.util.random :as u.random]
   [pjstadig.humane-test-output :as humane-test-output]
   [potemkin :as p]
   [toucan2.tools.with-temp :as t2.with-temp]))

(set! *warn-on-reflection* true)

(humane-are/install!)

;; don't enable humane-test-output when running tests from the CLI, it breaks diffs.
(when-not config/is-test?
  (humane-test-output/activate!))

;; Fool the linters into thinking these namespaces are used! See discussion on
;; https://github.com/clojure-emacs/refactor-nrepl/pull/270
(comment
  actions.test-util/keep-me
  client/keep-me
  data.impl/keep-me
  data/keep-me
  datasets/keep-me
  driver/keep-me
  et/keep-me
  i18n.tu/keep-me
  initialize/keep-me
  lib.metadata.jvm/keep-me
  mb.hawk.init/keep-me
  mb.hawk.parallel/keep-me
  test.redefs/keep-me
  mw.session/keep-me
  perms.test-util/keep-me
  qp.store/keep-me
  qp.test-util/keep-me
  qp/keep-me
  sql-jdbc.tu/keep-me
  sql.qp-test-util/keep-me
  t2.with-temp/keepme
  test-runner.assert-exprs/keep-me
  test.persistence/keep-me
  test.tz/keep-me
  test.users/keep-me
  tu.async/keep-me
  tu.log/keep-me
  tu.misc/keep-me
  tu.public-setings/keep-me
  tu.thread-local/keep-me
  u.random/keep-me
  tu/keep-me
  tx.env/keep-me
  tx/keep-me
  schema-migrations-test.impl/keep-me)

;; Add more stuff here as needed
#_{:clj-kondo/ignore [:discouraged-var :deprecated-var]}
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
  test-drivers]

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
  real-client
  client-full-response
  client-real-response]

 [i18n.tu
  with-mock-i18n-bundles
  with-user-locale]

 [initialize
  initialize-if-needed!]

 [lib.metadata.jvm
  application-database-metadata-provider]

 [mw.session
  with-current-user
  as-admin]

 [perms.test-util
  with-restored-data-perms!
  with-restored-data-perms-for-group!
  with-restored-data-perms-for-groups!
  with-no-data-perms-for-all-users!
  with-full-data-perms-for-all-users!
  with-perm-for-group!
  with-perm-for-group-and-table!]

 [qp
  process-query
  userland-query]

 [qp.store
  with-metadata-provider]

 [qp.test-util
  card-with-source-metadata-for-query
  col
  cols
  first-row
  formatted-rows+column-names
  format-rows-by
  formatted-rows
  nest-query
  normal-drivers
  normal-drivers-except
  normal-drivers-with-feature
  normal-drivers-without-feature
  rows
  rows+column-names
  with-database-timezone-id
  with-mock-fks-for-drivers-without-fk-constraints
  with-report-timezone-id!
  with-results-timezone-id]

 [sql-jdbc.tu
  sql-jdbc-drivers]

 [sql.qp-test-util
  with-native-query-testing-context]

 [test-runner.assert-exprs
  derecordize]

 [test.persistence
  with-persistence-enabled]

 [test.users
  fetch-user
  test-user?
  user->credentials
  user->id
  user-descriptor
  user-http-request
  user-real-request
  with-group
  with-group-for-user
  with-test-user]

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
  latest-audit-log-entry
  let-url
  obj->json->obj
  postwalk-pred
  round-all-decimals
  scheduler-current-tasks
  secret-value-equals?
  select-keys-sequentially
  throw-if-called!
  repeat-concurrently
  with-all-users-permission
  with-column-remappings
  with-discarded-collections-perms-changes
  with-discard-model-updates
  with-env-keys-renamed-by
  with-locale
  with-model-cleanup
  with-non-admin-groups-no-root-collection-for-namespace-perms
  with-non-admin-groups-no-root-collection-perms
  with-non-admin-groups-no-collection-perms
  with-all-users-data-perms-graph!
  with-temp-env-var-value!
  with-temp-dir
  with-temp-file
  with-temp-scheduler
  with-temp-vals-in-db
  with-temporary-setting-values
  with-temporary-raw-setting-values
  with-user-in-groups
  with-verified-cards]

 [tu.async
  wait-for-result
  with-open-channels]

 [tu.log
  ns-log-level
  set-ns-log-level!
  with-log-messages-for-level
  with-log-level]

 [tu.misc
  object-defaults
  with-clock
  with-single-admin-user]

 [tu.public-setings
  with-premium-features
  with-additional-premium-features]

 [u.random
  random-name
  random-hash
  random-email]

 [tu.thread-local
  test-helpers-set-global-values!]

 [test.tz
  with-system-timezone-id!]

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
  native-query-with-card-template-tag
  sorts-nil-first?
  supports-time-type?
  supports-timestamptz-type?]

 [tx.env
  set-test-drivers!
  with-test-drivers]

 [schema-migrations-test.impl
  with-temp-empty-app-db]

 [tu.dr
  dynamic-value
  with-dynamic-redefs])

;; Rename this instead of using `import-vars` to make it clear that it's related to `=?`
(p/import-fn hawk.approx/malli malli=?)
(p/import-fn hawk.approx/exactly exactly=?)

(alter-meta! #'with-temp update :doc str "\n\n  Note: by default, this will execute its body inside a transaction, making
  it thread safe. If it is wrapped in a call to [[metabase.test/test-helpers-set-global-values!]], it will affect the
  global state of the application database.")
