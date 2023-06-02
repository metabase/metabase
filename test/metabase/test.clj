(ns metabase.test
  "The stuff you need to write almost every test, all in one place. Nice!

  (Prefer using `metabase.test` to requiring bits and pieces from these various namespaces going forward, since it
  reduces the cognitive load required to write tests.)"
  (:refer-clojure :exclude [compile])
  (:require
   [clojure.data]
   [clojure.test :refer :all]
   [environ.core :as env]
   [humane-are.core :as humane-are]
   [java-time :as t]
   [mb.hawk.init]
   [mb.hawk.parallel]
   [medley.core :as m]
   [metabase.actions.test-util :as actions.test-util]
   [metabase.config :as config]
   [metabase.db.util :as mdb.u]
   [metabase.driver :as driver]
   [metabase.driver.sql-jdbc.test-util :as sql-jdbc.tu]
   [metabase.driver.sql.query-processor-test-util :as sql.qp-test-util]
   [metabase.email-test :as et]
   [metabase.http-client :as client]
   [metabase.models :refer [PermissionsGroupMembership User]]
   [metabase.models.permissions-group :as perms-group]
   [metabase.query-processor :as qp]
   [metabase.query-processor-test :as qp.test]
   [metabase.query-processor.context :as qp.context]
   [metabase.query-processor.reducible :as qp.reducible]
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
   [metabase.test.redefs]
   [metabase.test.util :as tu]
   [metabase.test.util.async :as tu.async]
   [metabase.test.util.i18n :as i18n.tu]
   [metabase.test.util.log :as tu.log]
   [metabase.test.util.random :as tu.random]
   [metabase.test.util.timezone :as test.tz]
   [metabase.util.log :as log]
   [pjstadig.humane-test-output :as humane-test-output]
   [potemkin :as p]
   [toucan.util.test :as tt]
   [toucan2.core :as t2]
   [toucan2.model :as t2.model]))

(set! *warn-on-reflection* true)

(humane-are/install!)

;; don't enable humane-test-output when running tests from the CLI, it breaks diffs.
(when-not config/is-test?
  (humane-test-output/activate!))

;; Fool the linters into thinking these namespaces are used! See discussion on
;; https://github.com/clojure-emacs/refactor-nrepl/pull/270
(comment
  client/keep-me
  data/keep-me
  data.impl/keep-me
  datasets/keep-me
  driver/keep-me
  et/keep-me
  i18n.tu/keep-me
  initialize/keep-me
  metabase.test.redefs/keep-me
  mw.session/keep-me
  test.persistence/keep-me
  qp/keep-me
  qp.test-util/keep-me
  qp.test/keep-me
  sql-jdbc.tu/keep-me
  sql.qp-test-util/keep-me
  test-runner.assert-exprs/keep-me
  test.users/keep-me
  tt/keep-me
  tu/keep-me
  tu.async/keep-me
  tu.log/keep-me
  tu.random/keep-me
  test.tz/keep-me
  tx/keep-me
  tx.env/keep-me)

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
  with-temp
  with-temp*
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

;;; TODO -- move all the stuff below into some other namespace and import it here.

(defn do-with-clock [clock thunk]
  (mb.hawk.parallel/assert-test-is-not-parallel "with-clock")
  (testing (format "\nsystem clock = %s" (pr-str clock))
    (let [clock (cond
                  (t/clock? clock)           clock
                  (t/zoned-date-time? clock) (t/mock-clock (t/instant clock) (t/zone-id clock))
                  :else                      (throw (Exception. (format "Invalid clock: ^%s %s"
                                                                        (.getName (class clock))
                                                                        (pr-str clock)))))]
      #_{:clj-kondo/ignore [:discouraged-var]}
      (t/with-clock clock
        (thunk)))))

(defmacro with-clock
  "Same as [[t/with-clock]], but adds [[testing]] context, and also supports using `ZonedDateTime` instances
  directly (converting them to a mock clock automatically).

    (mt/with-clock #t \"2019-12-10T00:00-08:00[US/Pacific]\"
      ...)"
  [clock & body]
  `(do-with-clock ~clock (fn [] ~@body)))

(defn do-with-single-admin-user
  [attributes thunk]
  (let [existing-admin-memberships (t2/select PermissionsGroupMembership :group_id (:id (perms-group/admin)))
        _                          (t2/delete! (t2/table-name PermissionsGroupMembership) :group_id (:id (perms-group/admin)))
        existing-admin-ids         (t2/select-pks-set User :is_superuser true)
        _                          (when (seq existing-admin-ids)
                                     (t2/update! (t2/table-name User) {:id [:in existing-admin-ids]} {:is_superuser false}))
        temp-admin                 (first (t2/insert-returning-instances! User (merge (with-temp-defaults User)
                                                                                      attributes
                                                                                      {:is_superuser true})))
        primary-key                (mdb.u/primary-key User)]
    (try
      (thunk temp-admin)
      (finally
        (t2/delete! User primary-key (primary-key temp-admin))
        (when (seq existing-admin-ids)
          (t2/update! (t2/table-name User) {:id [:in existing-admin-ids]} {:is_superuser true}))
        (t2/insert! PermissionsGroupMembership existing-admin-memberships)))))

(defmacro with-single-admin-user
  "Creates an admin user (with details described in the `options-map`) and (temporarily) removes the administrative
  powers of all other users in the database.

  Example:

  (testing \"Check that the last superuser cannot deactivate themselves\"
    (mt/with-single-admin-user [{id :id}]
      (is (= \"You cannot remove the last member of the 'Admin' group!\"
             (mt/user-http-request :crowberto :delete 400 (format \"user/%d\" id))))))"
  [[binding-form & [options-map]] & body]
  `(do-with-single-admin-user ~options-map (fn [~binding-form]
                                             ~@body)))

;;;; New QP middleware test util fns. Experimental. These will be put somewhere better if confirmed useful.

(defn test-qp-middleware
  "Helper for testing QP middleware that uses the

    (defn middleware [qp]
      (fn [query rff context]
        (qp query rff context)))

  pattern, such as stuff in [[metabase.query-processor/around-middleware]]. Changes are returned in a map with keys:

    * `:result`   ­ final result
    * `:pre`      ­ `query` after preprocessing
    * `:metadata` ­ `metadata` after post-processing. Should be a map e.g. with `:cols`
    * `:post`     ­ `rows` after post-processing transduction"
  ([middleware-fn]
   (test-qp-middleware middleware-fn {}))

  ([middleware-fn query]
   (test-qp-middleware middleware-fn query []))

  ([middleware-fn query rows]
   (test-qp-middleware middleware-fn query {} rows))

  ([middleware-fn query metadata rows]
   (test-qp-middleware middleware-fn query metadata rows nil))

  ([middleware-fn query metadata rows {:keys [run async?], :as context}]
   {:pre [((some-fn nil? map?) metadata)]}
   (let [async-qp (qp.reducible/async-qp
                   (qp.reducible/combine-middleware
                    (if (sequential? middleware-fn)
                      middleware-fn
                      [middleware-fn])))
         context  (merge
                   ;; CI is S U P E R  S L O W so give this a longer timeout.
                   {:timeout (if (env/env :ci)
                               5000
                               500)
                    :runf    (fn [query rff context]
                               (try
                                 (when run (run))
                                 (qp.context/reducef rff context (assoc metadata :pre query) rows)
                                 (catch Throwable e
                                   (log/errorf "Error in test-qp-middleware runf: %s" e)
                                   (throw e))))}
                   context)]
     (if async?
       (async-qp query context)
       (binding [qp.reducible/*run-on-separate-thread?* true]
         (let [qp     (qp.reducible/sync-qp async-qp)
               result (qp query context)]
           {:result   (m/dissoc-in result [:data :pre])
            :pre      (-> result :data :pre)
            :post     (-> result :data :rows)
            :metadata (update result :data #(dissoc % :pre :rows))}))))))

(def ^{:arglists '([toucan-model])} object-defaults
  "Return the default values for columns in an instance of a `toucan-model`, excluding ones that differ between
  instances such as `:id`, `:name`, or `:created_at`. Useful for writing tests and comparing objects from the
  application DB. Example usage:

    (deftest update-user-first-name-test
      (mt/with-temp User [user]
        (update-user-first-name! user \"Cam\")
        (is (= (merge (mt/object-defaults User)
                      (select-keys user [:id :last_name :created_at :updated_at])
                      {:name \"Cam\"})
               (mt/decrecordize (t2/select-one User :id (:id user)))))))"
  (comp
   (memoize
    (fn [toucan-model]
      (with-temp* [toucan-model [x]
                   toucan-model [y]]
        (let [[_ _ things-in-both] (clojure.data/diff x y)]
          ;; don't include created_at/updated_at even if they're the exactly the same, as might be the case with MySQL
          ;; TIMESTAMP columns (which only have second resolution by default)
          (dissoc things-in-both :created_at :updated_at)))))
   (fn [toucan-model]
     (mb.hawk.init/assert-tests-are-not-initializing (list 'object-defaults (symbol (name toucan-model))))
     (initialize/initialize-if-needed! :db)
     (t2.model/resolve-model toucan-model))))

;;; these are deprecated at runtime so Kondo doesn't complain, also because we can't go around deprecating stuff from
;;; other libaries any other way. They're marked deprecated to encourage you to use the `t2.with-temp` versions.
#_{:clj-kondo/ignore [:discouraged-var]}
(doseq [varr [#'with-temp
              #'with-temp*]]
  (alter-meta! varr assoc :deprecated true))
