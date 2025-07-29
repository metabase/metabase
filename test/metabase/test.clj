(ns metabase.test
  "The stuff you need to write almost every test, all in one place. Nice!

  (Prefer using `metabase.test` to requiring bits and pieces from these various namespaces going forward, since it
  reduces the cognitive load required to write tests.)"
  (:require
   [clojure.test]
   [humane-are.core :as humane-are]
   [mb.hawk.assert-exprs.approximately-equal :as hawk.approx]
   [mb.hawk.init]
   [metabase.actions.test-util :as actions.test-util]
   [metabase.app-db.schema-migrations-test.impl :as schema-migrations-test.impl]
   [metabase.app-db.test-util :as mdb.test-util]
   [metabase.channel.email-test]
   [metabase.config.core :as config]
   [metabase.core.init]
   [metabase.driver :as driver]
   [metabase.driver.sql.query-processor-test-util :as sql.qp-test-util]
   [metabase.lib-be.metadata.jvm :as lib.metadata.jvm]
   [metabase.model-persistence.test-util]
   [metabase.permissions.test-util :as perms.test-util]
   [metabase.premium-features.test-util :as premium-features.test-util]
   [metabase.query-processor :as qp]
   [metabase.query-processor.store :as qp.store]
   [metabase.query-processor.test-util :as qp.test-util]
   [metabase.request.core]
   [metabase.test-runner.assert-exprs :as test-runner.assert-exprs]
   [metabase.test.data :as data]
   [metabase.test.data.datasets :as datasets]
   [metabase.test.data.env :as tx.env]
   [metabase.test.data.impl :as data.impl]
   [metabase.test.data.interface :as tx]
   [metabase.test.data.users :as test.users]
   [metabase.test.http-client :as client]
   [metabase.test.initialize :as initialize]
   [metabase.test.redefs :as test.redefs]
   [metabase.test.util :as tu]
   [metabase.test.util.async :as tu.async]
   [metabase.test.util.dynamic-redefs]
   [metabase.test.util.i18n :as i18n.tu]
   [metabase.test.util.log :as tu.log]
   [metabase.test.util.misc :as tu.misc]
   [metabase.test.util.thread-local :as tu.thread-local]
   [metabase.test.util.timezone :as test.tz]
   [metabase.util :as u]
   [metabase.util.log :as log]
   [metabase.util.log.capture]
   [metabase.util.random :as u.random]
   [methodical.core :as methodical]
   [pjstadig.humane-test-output :as humane-test-output]
   [potemkin :as p]
   [toucan2.pipeline :as t2.pipeline]
   [toucan2.tools.with-temp]))

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
  i18n.tu/keep-me
  initialize/keep-me
  lib.metadata.jvm/keep-me
  mb.hawk.init/keep-me
  mdb.test-util/keep-me
  metabase.channel.email-test/keep-me
  metabase.core.init/keep-me
  metabase.model-persistence.test-util/keep-me
  metabase.request.core/keep-me
  metabase.test.util.dynamic-redefs/keep-me
  metabase.util.log.capture/keep-me
  perms.test-util/keep-me
  qp.store/keep-me
  qp.test-util/keep-me
  qp/keep-me
  schema-migrations-test.impl/keep-me
  sql.qp-test-util/keep-me
  test-runner.assert-exprs/keep-me
  test.redefs/keep-me
  test.tz/keep-me
  test.users/keep-me
  toucan2.tools.with-temp/keep-me
  tu.async/keep-me
  tu.log/keep-me
  tu.misc/keep-me
  tu.thread-local/keep-me
  tu/keep-me
  tx.env/keep-me
  tx/keep-me
  u.random/keep-me)

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
  driver-select
  format-name
  id
  mbql-query
  metadata-provider
  native-query
  normal-driver-select
  query
  run-mbql-query
  with-db
  with-temp-copy-of-db
  with-empty-h2-app-db!]

 [data.impl
  *db-is-temp-copy?*]

 [datasets
  test-driver
  test-drivers]

 [driver
  with-driver]

 [metabase.channel.email-test
  email-to
  fake-inbox-email-fn
  inbox
  received-email-body?
  received-email-subject?
  regex-email-bodies
  reset-inbox!
  summarize-multipart-email
  summarize-multipart-single-email
  with-expected-messages
  with-fake-inbox]

 [client
  build-url
  client
  real-client
  client-full-response
  client-real-response]

 [i18n.tu
  with-mock-i18n-bundles!
  with-user-locale]

 [initialize
  initialize-if-needed!]

 [lib.metadata.jvm
  application-database-metadata-provider]

 [metabase.util.log.capture
  with-log-messages-for-level]

 [mdb.test-util
  with-app-db-timezone-id!]

 [metabase.model-persistence.test-util
  with-persistence-enabled!]

 [metabase.request.core
  as-admin
  with-current-user]

 [metabase.test.util.dynamic-redefs
  dynamic-value
  with-dynamic-fn-redefs]

 [premium-features.test-util
  assert-has-premium-feature-error
  with-premium-features
  with-additional-premium-features
  when-ee-evailable]

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
  boolish->bool
  card-with-metadata
  card-with-updated-metadata
  card-with-source-metadata-for-query
  col
  cols
  first-row
  formatted-rows+column-names
  format-rows-by
  formatted-rows
  metadata->native-form
  nest-query
  normal-drivers
  normal-drivers-with-feature
  normal-drivers-without-feature
  rows
  rows+column-names
  with-database-timezone-id
  with-report-timezone-id!
  with-results-timezone-id]

 [sql.qp-test-util
  with-native-query-testing-context]

 [test-runner.assert-exprs
  derecordize]

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

 [toucan2.tools.with-temp
  with-temp
  with-temp-defaults]

 [tu
  boolean-ids-and-timestamps
  call-with-map-params
  call-with-paused-query
  discard-setting-changes
  doall-recursive
  file->bytes
  file-path->bytes
  bytes->base64-data-uri
  latest-audit-log-entry
  let-url
  metric-value
  obj->json->obj
  ordered-subset?
  postwalk-pred
  round-all-decimals
  scheduler-current-tasks
  secret-value-equals?
  select-keys-sequentially
  throw-if-called!
  transitive
  repeat-concurrently
  with-all-users-permission
  with-column-remappings
  with-discarded-collections-perms-changes
  with-discard-model-updates!
  with-env-keys-renamed-by
  with-locale!
  with-model-cleanup
  with-non-admin-groups-no-root-collection-for-namespace-perms
  with-non-admin-groups-no-root-collection-perms
  with-non-admin-groups-no-collection-perms
  with-all-users-data-perms-graph!
  with-anaphora
  with-prometheus-system!
  with-temp-env-var-value!
  with-temp-dir
  with-temp-file
  with-temp-scheduler!
  with-temp-vals-in-db
  with-temporary-setting-values
  with-temporary-raw-setting-values
  with-user-in-groups
  with-verified-cards!
  works-after]

 [tu.async
  wait-for-result
  with-open-channels]

 [tu.log
  ns-log-level
  set-ns-log-level!
  with-log-level]

 [tu.misc
  object-defaults
  with-clock
  with-single-admin-user!]

 [u.random
  random-name
  random-hash
  random-email]

 [tu.thread-local
  test-helpers-set-global-values!]

 [test.tz
  with-system-timezone-id!]

 [tx
  arbitrary-select-query
  count-with-template-tag-query
  count-with-field-filter-query
  make-alias
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
  sorts-nil-first?]

 [tx.env
  set-test-drivers!
  with-test-drivers]

 [schema-migrations-test.impl
  with-temp-empty-app-db])

;; Rename this instead of using `import-vars` to make it clear that it's related to `=?`
(p/import-fn hawk.approx/malli malli=?)
(p/import-fn hawk.approx/exactly exactly=?)

(alter-meta! #'with-temp update :doc str "\n\n  Note: by default, this will execute its body inside a transaction, making
  it thread safe. If it is wrapped in a call to [[metabase.test/test-helpers-set-global-values!]], it will affect the
  global state of the application database.")

(defonce ^:private original-test-var clojure.test/test-var)

(defn- test-var-with-context
  "A modified version of `clojure.test/test-var` that:
  - logs every toucan2 query we run, with details on the query type, model, args, and resulting query
  - adds some context to any logs emitted during the test, so that we have information on what test ran
  "
  [v]
  (let [test-n (-> v meta :name)
        test-ns (-> v meta :ns str)]
    (log/with-context {:test (str test-ns "/" test-n)}
      (original-test-var v))))

(alter-var-root #'clojure.test/test-var (constantly test-var-with-context))

(methodical/defmethod t2.pipeline/compile :after
  [#_query-type  :default
   #_model       :default
   #_built-query :default]
  [query-type model built-query]
  (u/prog1 built-query
    (let [compiled-query-arg-map (into {} (map-indexed (fn [i v] [(str "compiled-query-arg-" i) v]) (rest <>)))]
      (log/with-context (merge {:query-type query-type
                                :model model
                                :compiled-query (first <>)
                                :compiled-query-args (rest <>)}
                               compiled-query-arg-map)
        (when config/is-test?
          (log/info "Compiled query"))))))
