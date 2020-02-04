(ns metabase.test
  "The stuff you need to write almost every test, all in one place. Nice!

  (Prefer using `metabase.test` to requiring bits and pieces from these various namespaces going forward, since it
  reduces the cognitive load required to write tests.)"
  (:require [clojure.test :refer :all]
            [java-time :as t]
            [metabase
             [driver :as driver]
             [query-processor :as qp]
             [query-processor-test :as qp.test]]
            [metabase.driver.sql-jdbc-test :as sql-jdbc-test]
            [metabase.query-processor
             [build :as qp.build]
             [test-util :as qp.test-util]]
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
             [async :as tu.async]
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
  tu.async/keep-me
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
  with-database-timezone-id
  with-everything-store
  with-report-timezone-id
  with-results-timezone-id]

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

 [tu.async
  wait-for-close
  wait-for-result
  with-open-channels]

 [tu.log
  suppress-output]

 [tu.tz
  with-system-timezone-id]

 [tx
  dataset-definition
  db-qualified-table-name
  db-test-env-var
  db-test-env-var-or-throw
  dbdef->connection-details
  defdataset
  dispatch-on-driver-with-test-extensions
  get-dataset-definition
  has-questionable-timezone-support?
  has-test-extensions?
  metabase-instance]

 [tx.env
  set-test-drivers!
  with-test-drivers])

(defn do-with-clock [clock thunk]
  (let [clock (cond
                (t/clock? clock)           clock
                (t/zoned-date-time? clock) (t/mock-clock (t/instant clock) (t/zone-id clock))
                :else                      (throw (Exception. (format "Invalid clock: ^%s %s"
                                                                      (.getName (class clock))
                                                                      (pr-str clock)))))]
    (t/with-clock clock
      (testing (format "\nsystem clock = %s" (pr-str clock))
        (thunk)))))

(defmacro with-clock
  "Same as `t/with-clock`, but adds `testing` context, and also supports using `ZonedDateTime` instances
  directly (converting them to a mock clock automatically).

    (mt/with-clock #t \"2019-12-10T00:00-08:00[US/Pacific]\"
      ...)"
  [clock & body]
  `(do-with-clock ~clock (fn [] ~@body)))

;; New QP middleware test util fns. Experimental. These will be put somewhere better if confirmed useful.

(defn test-qp-middleware
  "Helper for testing QP middleware. Changes are returned in a map with keys:

    * `:pre`(`query` after preprocessing)
    * `:metadata` (`metadata` after post-processing modification)
    * `:post`(`rows` after post-processing transduction)"
  ([middleware-fn query rows]
   (test-qp-middleware middleware-fn query {} rows {}))

  ([middleware-fn query metadata rows]
   (test-qp-middleware middleware-fn query metadata rows {}))

  ([middleware-fn query metadata rows chans]
   ((middleware-fn
     (fn [query xformf _]
       (let [xform             (xformf metadata)
             rf                (xform (qp.build/default-rff metadata))
             [metadata result] (transduce identity rf rows)]
         {:pre      query
          :metadata metadata
          :post     result})))
    query
    (fn xformf [metadata]
      (fn xform [rf]
        (fn rf*
          ([] (rf))
          ([result] [metadata (rf result)])
          ([result row] (rf result row)))))
    chans)))
