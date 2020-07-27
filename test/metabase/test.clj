(ns metabase.test
  "The stuff you need to write almost every test, all in one place. Nice!

  (Prefer using `metabase.test` to requiring bits and pieces from these various namespaces going forward, since it
  reduces the cognitive load required to write tests.)"
  (:require [clojure
             data
             [test :refer :all]
             [walk :as walk]]
            [java-time :as t]
            [medley.core :as m]
            [metabase
             [driver :as driver]
             [email-test :as et]
             [http-client :as http]
             [query-processor :as qp]
             [query-processor-test :as qp.test]]
            [metabase.driver.sql-jdbc.test-util :as sql-jdbc.tu]
            [metabase.query-processor
             [context :as qp.context]
             [reducible :as qp.reducible]
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
             [i18n :as i18n.tu]
             [log :as tu.log]
             [timezone :as tu.tz]]
            [potemkin :as p]
            [toucan.db :as db]
            [toucan.util.test :as tt]))

;; Fool the linters into thinking these namespaces are used! See discussion on
;; https://github.com/clojure-emacs/refactor-nrepl/pull/270
(comment
  data/keep-me
  datasets/keep-me
  driver/keep-me
  et/keep-me
  http/keep-me
  i18n.tu/keep-me
  initialize/keep-me
  qp/keep-me
  qp.test-util/keep-me
  qp.test/keep-me
  sql-jdbc.tu/keep-me
  test-users/keep-me
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

 [et
  email-to
  fake-inbox-email-fn
  inbox
  regex-email-bodies
  reset-inbox!
  summarize-multipart-email
  with-expected-messages
  with-fake-inbox]

 [http
  authenticate
  build-url
  client
  client-full-response]

 [i18n.tu
  with-mock-i18n-bundles
  with-user-locale]

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

 [sql-jdbc.tu
  sql-jdbc-drivers]

 [test-users
  fetch-user
  test-user?
  user->id
  user->client
  user->credentials
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
  obj->json->obj
  postwalk-pred
  random-email
  random-name
  round-all-decimals
  scheduler-current-tasks
  throw-if-called
  with-locale
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
  count-with-template-tag-query
  count-with-field-filter-query
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

;; TODO -- move this stuff into some other namespace and refer to it here

(defn do-with-clock [clock thunk]
  (testing (format "\nsystem clock = %s" (pr-str clock))
    (let [clock (cond
                  (t/clock? clock)           clock
                  (t/zoned-date-time? clock) (t/mock-clock (t/instant clock) (t/zone-id clock))
                  :else                      (throw (Exception. (format "Invalid clock: ^%s %s"
                                                                        (.getName (class clock))
                                                                        (pr-str clock)))))]
      (t/with-clock clock
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

    * `:result`   ­ final result
    * `:pre`      ­ `query` after preprocessing
    * `:metadata` ­ `metadata` after post-processing
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
   (let [async-qp (qp.reducible/async-qp
                   (qp.reducible/combine-middleware
                    (if (sequential? middleware-fn)
                      middleware-fn
                      [middleware-fn])))
         context  (merge
                   {:timeout 500
                    :runf    (fn [query rff context]
                               (try
                                 (when run (run))
                                 (qp.context/reducef rff context (assoc metadata :pre query) rows)
                                 (catch Throwable e
                                   (println "Error in test-qp-middleware runf:" e)
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

(defn derecordize
  "Convert all record types in `form` to plain maps, so tests won't fail."
  [form]
  (walk/postwalk
   (fn [form]
     (if (record? form)
       (into {} form)
       form))
   form))

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
               (mt/decrecordize (db/select-one User :id (:id user)))))))"
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
     (initialize/initialize-if-needed! :db)
     (db/resolve-model toucan-model))))
