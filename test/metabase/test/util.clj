(ns metabase.test.util
  "Helper functions and macros for writing unit tests."
  (:require [cheshire.core :as json]
            [clojure
             [string :as str]
             [test :refer :all]
             [walk :as walk]]
            [clojure.tools.logging :as log]
            [clojurewerkz.quartzite.scheduler :as qs]
            [colorize.core :as colorize]
            [java-time :as t]
            [metabase
             [driver :as driver]
             [models :refer [Card Collection Dashboard DashboardCardSeries Database Dimension Field Metric
                             NativeQuerySnippet Permissions PermissionsGroup Pulse PulseCard PulseChannel Revision
                             Segment Table TaskHistory User]]
             [task :as task]
             [util :as u]]
            [metabase.models
             [collection :as collection]
             [permissions :as perms]
             [permissions-group :as group]
             [setting :as setting]]
            [metabase.plugins.classloader :as classloader]
            [metabase.test
             [data :as data]
             [initialize :as initialize]]
            [schema.core :as s]
            [toucan.db :as db]
            [toucan.util.test :as tt])
  (:import java.util.concurrent.TimeoutException
           java.util.Locale
           org.apache.log4j.Logger
           [org.quartz CronTrigger JobDetail JobKey Scheduler Trigger]))

(defmethod assert-expr 're= [msg [_ pattern actual]]
  `(let [pattern#  ~pattern
         actual#   ~actual
         matches?# (some->> actual# (re-matches pattern#))]
     (assert (instance? java.util.regex.Pattern pattern#))
     (do-report
      {:type     (if matches?# :pass :fail)
       :message  ~msg
       :expected pattern#
       :actual   actual#
       :diffs    (when-not matches?#
                   [[actual# [pattern# nil]]])})))

(defmethod assert-expr 'schema=
  [message [_ schema actual]]
  `(let [schema# ~schema
         actual# ~actual
         pass?#  (nil? (s/check schema# actual#))]
     (do-report
      {:type     (if pass?# :pass :fail)
       :message  ~message
       :expected (s/explain schema#)
       :actual   actual#
       :diffs    (when-not pass?#
                   [[actual# [(s/check schema# actual#) nil]]])})))

(defmacro ^:deprecated expect-schema
  "Like `expect`, but checks that results match a schema. DEPRECATED -- you can use `deftest` combined with `schema=`
  instead.

    (deftest my-test
      (is (schema= expected-schema
                   actual-value)))"
  {:style/indent 0}
  [expected actual]
  (let [symb (symbol (format "expect-schema-%d" (hash &form)))]
    `(deftest ~symb
       (testing (format ~(str (ns-name *ns*) ":%s") (:line (meta (var ~symb))))
         (is (~'schema= ~expected ~actual))))))

(defn- random-uppercase-letter []
  (char (+ (int \A) (rand-int 26))))

(defn random-name
  "Generate a random string of 20 uppercase letters."
  []
  (str/join (repeatedly 20 random-uppercase-letter)))

(defn random-email
  "Generate a random email address."
  []
  (str (random-name) "@metabase.com"))

(defn boolean-ids-and-timestamps
  "Useful for unit test comparisons. Converts map keys found in `DATA`
  satisfying `PRED` with booleans when not nil"
  ([data]
   (boolean-ids-and-timestamps
    (every-pred (some-fn keyword? string?)
                (some-fn #{:id :created_at :updated_at :last_analyzed :created-at :updated-at :field-value-id :field-id
                           :date_joined :date-joined :last_login :dimension-id :human-readable-field-id}
                         #(str/ends-with? % "_id")
                         #(str/ends-with? % "_at")))
    data))
  ([pred data]
   (walk/prewalk (fn [maybe-map]
                   (if (map? maybe-map)
                     (reduce-kv (fn [acc k v]
                                  (if (pred k)
                                    (assoc acc k (some? v))
                                    (assoc acc k v)))
                                {} maybe-map)
                     maybe-map))
                 data)))


(defn- user-id [username]
  (classloader/require 'metabase.test.data.users)
  ((resolve 'metabase.test.data.users/user->id) username))

(defn- rasta-id [] (user-id :rasta))

(defn- set-with-temp-defaults! []
  (extend (class Card)
    tt/WithTempDefaults
    {:with-temp-defaults (fn [_] {:creator_id             (rasta-id)
                                  :dataset_query          {}
                                  :display                :table
                                  :name                   (random-name)
                                  :visualization_settings {}})})

  (extend (class Collection)
    tt/WithTempDefaults
    {:with-temp-defaults (fn [_] {:name  (random-name)
                                  :color "#ABCDEF"})})

  (extend (class Dashboard)
    tt/WithTempDefaults
    {:with-temp-defaults (fn [_] {:creator_id   (rasta-id)
                                  :name         (random-name)})})

  (extend (class DashboardCardSeries)
    tt/WithTempDefaults
    {:with-temp-defaults (constantly {:position 0})})

  (extend (class Database)
    tt/WithTempDefaults
    {:with-temp-defaults (fn [_] {:details   {}
                                  :engine    :h2
                                  :is_sample false
                                  :name      (random-name)})})

  (extend (class Dimension)
    tt/WithTempDefaults
    {:with-temp-defaults (fn [_] {:name (random-name)
                                  :type "internal"})})

  (extend (class Field)
    tt/WithTempDefaults
    {:with-temp-defaults (fn [_] {:database_type "VARCHAR"
                                  :base_type     :type/Text
                                  :name          (random-name)
                                  :position      1
                                  :table_id      (data/id :checkins)})})

  (extend (class Metric)
    tt/WithTempDefaults
    {:with-temp-defaults (fn [_] {:creator_id  (rasta-id)
                                  :definition  {}
                                  :description "Lookin' for a blueberry"
                                  :name        "Toucans in the rainforest"
                                  :table_id    (data/id :checkins)})})

  (extend (class NativeQuerySnippet)
    tt/WithTempDefaults
    {:with-temp-defaults (fn [_] {:creator_id (user-id :crowberto)
                                  :name       (random-name)
                                  :content    "1 = 1"})})

  (extend (class PermissionsGroup)
    tt/WithTempDefaults
    {:with-temp-defaults (fn [_] {:name (random-name)})})

  (extend (class Pulse)
    tt/WithTempDefaults
    {:with-temp-defaults (fn [_] {:creator_id (rasta-id)
                                  :name       (random-name)})})

  (extend (class PulseCard)
    tt/WithTempDefaults
    {:with-temp-defaults (fn [_] {:position    0
                                  :include_csv false
                                  :include_xls false})})

  (extend (class PulseChannel)
    tt/WithTempDefaults
    {:with-temp-defaults (constantly {:channel_type  :email
                                      :details       {}
                                      :schedule_type :daily
                                      :schedule_hour 15})})

  (extend (class Revision)
    tt/WithTempDefaults
    {:with-temp-defaults (fn [_] {:user_id      (rasta-id)
                                  :is_creation  false
                                  :is_reversion false})})

  (extend (class Segment)
    tt/WithTempDefaults
    {:with-temp-defaults (fn [_] {:creator_id (rasta-id)
                                  :definition  {}
                                  :description "Lookin' for a blueberry"
                                  :name        "Toucans in the rainforest"
                                  :table_id    (data/id :checkins)})})

  ;; TODO - `with-temp` doesn't return `Sessions`, probably because their ID is a string?

  (extend (class Table)
    tt/WithTempDefaults
    {:with-temp-defaults (fn [_] {:db_id  (data/id)
                                  :active true
                                  :name   (random-name)})})

  (extend (class TaskHistory)
    tt/WithTempDefaults
    {:with-temp-defaults (fn [_]
                           (let [started (t/zoned-date-time)
                                 ended   (t/plus started (t/millis 10))]
                             {:db_id      (data/id)
                              :task       (random-name)
                              :started_at started
                              :ended_at   ended
                              :duration   (.toMillis (t/duration started ended))}))})

  (extend (class User)
    tt/WithTempDefaults
    {:with-temp-defaults (fn [_] {:first_name (random-name)
                                  :last_name  (random-name)
                                  :email      (random-email)
                                  :password   (random-name)})}))

(set-with-temp-defaults!)

;; if any of the models get redefined, reload the `with-temp-defaults` so they apply to the new version of the model
(doseq [model-var [#'Card
                   #'Collection
                   #'Dashboard
                   #'DashboardCardSeries
                   #'Database
                   #'Dimension
                   #'Field
                   #'Metric
                   #'NativeQuerySnippet
                   #'Permissions
                   #'PermissionsGroup
                   #'Pulse
                   #'PulseCard
                   #'PulseChannel
                   #'Revision
                   #'Segment
                   #'Table
                   #'TaskHistory
                   #'User]]
  (remove-watch model-var ::reload)
  (add-watch
   model-var
   ::reload
   (fn [_ reference _ _]
     (println (format "%s changed, reloading with-temp-defaults" model-var))
     #_(set-with-temp-defaults!))))


;;; ------------------------------------------------- Other Util Fns -------------------------------------------------

(defn- namespace-or-symbol? [x]
  (or (symbol? x)
      (instance? clojure.lang.Namespace x)))


(defn obj->json->obj
  "Convert an object to JSON and back again. This can be done to ensure something will match its serialized +
  deserialized form, e.g. keywords that aren't map keys, record types vs. plain map types, or timestamps vs ISO-8601
  strings:

     (obj->json->obj {:type :query}) -> {:type \"query\"}"
  {:style/indent 0}
  [obj]
  (json/parse-string (json/generate-string obj) keyword))


(defn mappify
  "Walk COLL and convert all record types to plain Clojure maps.
  Useful because expectations will consider an instance of a record type to be different from a plain Clojure map,
  even if all keys & values are the same."
  [coll]
  {:style/indent 0}
  (walk/postwalk (fn [x]
                   (if (map? x)
                     (into {} x)
                     x))
                 coll))


(defn do-with-temporary-setting-value
  "Temporarily set the value of the Setting named by keyword `setting-k` to `value` and execute `f`, then re-establish
  the original value. This works much the same way as `binding`.

   Prefer the macro `with-temporary-setting-values` over using this function directly."
  {:style/indent 2}
  [setting-k value f]
  ;; plugins have to be initialized because changing `report-timezone` will call driver methods
  (initialize/initialize-if-needed! :db :plugins)
  (let [setting        (#'setting/resolve-setting setting-k)
        original-value (when (or (#'setting/db-or-cache-value setting)
                                 (#'setting/env-var-value setting))
                         (setting/get setting-k))]
    (try
      (setting/set! setting-k value)
      (testing (colorize/blue (format "\nSetting %s = %s\n" (keyword setting-k) (pr-str value)))
        (f))
      (finally
        (setting/set! setting-k original-value)))))

(defmacro with-temporary-setting-values
  "Temporarily bind the values of one or more `Settings`, execute body, and re-establish the original values. This
  works much the same way as `binding`.

     (with-temporary-setting-values [google-auth-auto-create-accounts-domain \"metabase.com\"]
       (google-auth-auto-create-accounts-domain)) -> \"metabase.com\""
  [[setting-k value & more :as bindings] & body]
  (assert (even? (count bindings)) "mismatched setting/value pairs: is each setting name followed by a value?")
  (if (empty? bindings)
    `(do ~@body)
    `(do-with-temporary-setting-value ~(keyword setting-k) ~value
       (fn []
         (with-temporary-setting-values ~more
           ~@body)))))

(defn do-with-discarded-setting-changes [settings thunk]
  (initialize/initialize-if-needed! :db :plugins)
  ((reduce
    (fn [thunk setting-k]
      (fn []
        (do-with-temporary-setting-value setting-k (setting/get setting-k) thunk)))
    thunk
    settings)))

(defmacro discard-setting-changes
  "Execute `body` in a try-finally block, restoring any changes to listed `settings` to their original values at its
  conclusion.

    (discard-setting-changes [site-name]
      ...)"
  {:style/indent 1}
  [settings & body]
  `(do-with-discarded-setting-changes ~(mapv keyword settings) (fn [] ~@body)))


(defn do-with-temp-vals-in-db
  "Implementation function for `with-temp-vals-in-db` macro. Prefer that to using this directly."
  [model object-or-id column->temp-value f]
  ;; use low-level `query` and `execute` functions here, because Toucan `select` and `update` functions tend to do
  ;; things like add columns like `common_name` that don't actually exist, causing subsequent update to fail
  (let [model                    (db/resolve-model model)
        [original-column->value] (db/query {:select (keys column->temp-value)
                                            :from   [model]
                                            :where  [:= :id (u/get-id object-or-id)]})]
    (assert original-column->value
      (format "%s %d not found." (name model) (u/get-id object-or-id)))
    (try
      (db/update! model (u/get-id object-or-id)
                  column->temp-value)
      (f)
      (finally
        (db/execute!
         {:update model
          :set    original-column->value
          :where  [:= :id (u/get-id object-or-id)]})))))

(defmacro with-temp-vals-in-db
  "Temporary set values for an `object-or-id` in the application database, execute `body`, and then restore the
  original values. This is useful for cases when you want to test how something behaves with slightly different values
  in the DB for 'permanent' rows (rows that live for the life of the test suite, rather than just a single test). For
  example, Database/Table/Field rows related to the test DBs can be temporarily tweaked in this way.

    ;; temporarily make Field 100 a FK to Field 200 and call (do-something)
    (with-temp-vals-in-db Field 100 {:fk_target_field_id 200, :special_type \"type/FK\"}
      (do-something))"
  {:style/indent 3}
  [model object-or-id column->temp-value & body]
  `(do-with-temp-vals-in-db ~model ~object-or-id ~column->temp-value (fn [] ~@body)))

(defn is-uuid-string?
  "Is string S a valid UUID string?"
  ^Boolean [^String s]
  (boolean (when (string? s)
             (re-matches #"^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$" s))))

(defn do-with-log-messages [f]
  (let [messages (atom [])]
    (with-redefs [log/log* (fn [_ & message]
                             (swap! messages conj (vec message)))]
      (f))
    @messages))

(defmacro with-log-messages
  "Execute `body`, and return a vector of all messages logged using the `log/` family of functions. Messages are of the
  format `[:level throwable message]`, and are returned in chronological order from oldest to newest.

     (with-log-messages (log/warn \"WOW\")) ; -> [[:warn nil \"WOW\"]]"
  {:style/indent 0}
  [& body]
  `(do-with-log-messages (fn [] ~@body)))

(def level-kwd->level
  "Conversion from a keyword log level to the Log4J constance mapped to that log level.
   Not intended for use outside of the `with-log-messages-for-level` macro."
  {:error org.apache.log4j.Level/ERROR
   :warn  org.apache.log4j.Level/WARN
   :info  org.apache.log4j.Level/INFO
   :debug org.apache.log4j.Level/DEBUG
   :trace org.apache.log4j.Level/TRACE})

(defn ^Logger metabase-logger
  "Gets the root logger for all metabase namespaces. Not intended for use outside of the
  `with-log-messages-for-level` macro."
  []
  (Logger/getLogger "metabase"))

(defn do-with-log-messages-for-level [level thunk]
  (let [original-level (.getLevel (metabase-logger))
        new-level      (get level-kwd->level (keyword level))]
    (try
      (.setLevel (metabase-logger) new-level)
      (thunk)
      (finally
        (.setLevel (metabase-logger) original-level)))))

(defmacro with-log-level
  "Sets the log level (e.g. `:debug` or `:trace`) while executing `body`. Not thread safe! But good for debugging from
  the REPL or for tests.

    (with-log-level :debug
      (do-something))"
  [level & body]
  `(do-with-log-messages-for-level ~level (fn [] ~@body)))

(defmacro with-log-messages-for-level
  "Executes `body` with the metabase logging level set to `level-kwd`. This is needed when the logging level is set at a
  higher threshold than the log messages you're wanting to example. As an example if the metabase logging level is set
  to `ERROR` in the log4j.properties file and you are looking for a `WARN` message, it won't show up in the
  `with-log-messages` call as there's a guard around the log invocation, if it's not enabled (it is set to `ERROR`)
  the log function will never be invoked. This macro will temporarily set the logging level to `level-kwd`, then
  invoke `with-log-messages`, then set the level back to what it was before the invocation. This allows testing log
  messages even if the threshold is higher than the message you are looking for."
  [level-kwd & body]
  `(with-log-level ~level-kwd
     (with-log-messages
       ~@body)))

(defn- update-in-if-present
  "If the path `KS` is found in `M`, call update-in with the original
  arguments to this function, otherwise, return `M`"
  [m ks f & args]
  (if (= ::not-found (get-in m ks ::not-found))
    m
    (apply update-in m ks f args)))

(defn- ^:deprecated round-fingerprint-fields [fprint-type-map decimal-places fields]
  (reduce (fn [fprint field]
            (update-in-if-present fprint [field] (fn [num]
                                                   (if (integer? num)
                                                     num
                                                     (u/round-to-decimals decimal-places num)))))
          fprint-type-map fields))

(defn ^:deprecated round-fingerprint
  "Rounds the numerical fields of a fingerprint to 2 decimal places

  DEPRECATED -- this should no longer be needed; use `metabase.query-processor-test/col` to get the actual real-life
  fingerprint of the column instead."
  [field]
  (-> field
      (update-in-if-present [:fingerprint :type :type/Number] round-fingerprint-fields 2 [:min :max :avg :sd])
      ;; quartal estimation is order dependent and the ordering is not stable across different DB engines, hence more
      ;; aggressive trimming
      (update-in-if-present [:fingerprint :type :type/Number] round-fingerprint-fields 0 [:q1 :q3])
      (update-in-if-present [:fingerprint :type :type/Text]
                            round-fingerprint-fields 2
                            [:percent-json :percent-url :percent-email :average-length])))

(defn ^:deprecated round-fingerprint-cols
  "Round fingerprints to a few digits, so it can be included directly in 'expected' parts of tests.

  DEPRECATED -- this should no longer be needed; use `qp.tt/col` to get the actual real-life fingerprint of the
  column instead."
  ([query-results]
   (if (map? query-results)
     (let [maybe-data-cols (if (contains? query-results :data)
                             [:data :cols]
                             [:cols])]
       (round-fingerprint-cols maybe-data-cols query-results))
     (map round-fingerprint query-results)))

  ([k query-results]
   (update-in query-results k #(map round-fingerprint %))))

(defn postwalk-pred
  "Transform `form` by applying `f` to each node where `pred` returns true"
  [pred f form]
  (walk/postwalk (fn [node]
                   (if (pred node)
                     (f node)
                     node))
                 form))

(defn round-all-decimals
  "Uses `walk/postwalk` to crawl `data`, looking for any double values, will round any it finds"
  [decimal-place data]
  (postwalk-pred (some-fn double? decimal?)
                 #(u/round-to-decimals decimal-place %)
                 data))


;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                                   SCHEDULER                                                    |
;;; +----------------------------------------------------------------------------------------------------------------+

;; Various functions for letting us check that things get scheduled properly. Use these to put a temporary scheduler
;; in place and then check the tasks that get scheduled

(defn do-with-scheduler [scheduler thunk]
  (with-redefs [task/scheduler (constantly scheduler)]
    (thunk)))

(defmacro with-scheduler
  "Temporarily bind the Metabase Quartzite scheduler to `scheulder` and run `body`."
  {:style/indent 1}
  [scheduler & body]
  `(do-with-scheduler ~scheduler (fn [] ~@body)))

(defn do-with-temp-scheduler [f]
  (classloader/the-classloader)
  (initialize/initialize-if-needed! :db)
  (let [temp-scheduler        (qs/start (qs/initialize))
        is-default-scheduler? (identical? temp-scheduler (#'metabase.task/scheduler))]
    (if is-default-scheduler?
      (f)
      (with-scheduler temp-scheduler
        (try
          (f)
          (finally
            (qs/shutdown temp-scheduler)))))))

(defmacro with-temp-scheduler
  "Execute `body` with a temporary scheduler in place.

    (with-temp-scheduler
      (do-something-to-schedule-tasks)
      ;; verify that the right thing happened
      (scheduler-current-tasks))"
  {:style/indent 0}
  [& body]
  `(do-with-temp-scheduler (fn [] ~@body)))

(defn scheduler-current-tasks
  "Return information about the currently scheduled tasks (jobs+triggers) for the current scheduler. Intended so we
  can test that things were scheduled correctly."
  []
  (when-let [^Scheduler scheduler (#'task/scheduler)]
    (vec
     (sort-by
      :key
      (for [^JobKey job-key (.getJobKeys scheduler nil)]
        (let [^JobDetail job-detail (.getJobDetail scheduler job-key)
              triggers              (.getTriggersOfJob scheduler job-key)]
          {:description (.getDescription job-detail)
           :class       (.getJobClass job-detail)
           :key         (.getName job-key)
           :data        (into {} (.getJobDataMap job-detail))
           :triggers    (vec (for [^Trigger trigger triggers]
                               (merge
                                {:key (.getName (.getKey trigger))}
                                (when (instance? CronTrigger trigger)
                                  {:cron-schedule (.getCronExpression ^CronTrigger trigger)
                                   :data          (into {} (.getJobDataMap trigger))}))))}))))))

(defn ^:deprecated db-timezone-id
  "Return the timezone id from the test database. Must be called with `*driver*` bound,such as via `driver/with-driver`.
  DEPRECATED — just call `metabase.driver/db-default-timezone` instead directly."
  []
  (assert driver/*driver*)
  (let [db (data/db)]
    ;; clear the connection pool for SQL JDBC drivers. It's possible that a previous test ran and set the session's
    ;; timezone to something, then returned the session to the pool. Sometimes that connection's session can remain
    ;; intact and subsequent queries will continue in that timezone. That causes problems for tests that we can
    ;; determine the database's timezone.
    (driver/notify-database-updated driver/*driver* db)
    (data/dataset test-data
      (or
       (driver/db-default-timezone driver/*driver* db)
       (-> (driver/current-db-time driver/*driver* db)
           .getChronology
           .getZone
           .getID)))))

(defmulti ^:private do-model-cleanup! class)

(defmethod do-model-cleanup! :default
  [model]
  (db/delete! model))

(defmethod do-model-cleanup! (class Collection)
  [_]
  ;; don't delete Personal Collections <3
  (db/delete! Collection :personal_owner_id nil))

(defn do-with-model-cleanup [model-seq f]
  (try
    (testing (str "\n" (pr-str (cons 'with-model-cleanup (map name model-seq))) "\n")
      (f))
    (finally
      (doseq [model model-seq]
        (do-model-cleanup! (db/resolve-model model))))))

(defmacro with-model-cleanup
  "This will delete all rows found for each model in `model-seq`. By default, this calls `delete!`, so if the model has
  defined any `pre-delete` behavior, that will be preserved. Alternatively, you can define a custom implementation by
  using the `do-model-cleanup!` multimethod above."
  [model-seq & body]
  `(do-with-model-cleanup ~model-seq (fn [] ~@body)))

;; TODO - not 100% sure I understand
(defn call-with-paused-query
  "This is a function to make testing query cancellation eaiser as it can be complex handling the multiple threads
  needed to orchestrate a query cancellation.

  This function takes `f` which is a function of 4 arguments:
     - query-thunk         - No-arg function that will invoke a query.
     - query promise       - Promise used to validate the query function was called.  Deliver something to this once the
                             query has started running
     - cancel promise      - Promise used to validate a cancellation function was called. Deliver something to this once
                             the query was successfully canceled.
     - pause query promise - Promise used to hang the query function, allowing cancellation. Wait for this to be
                             delivered to hang the query.

  `f` should return a future that can be canceled."
  [f]
  (let [called-cancel? (promise)
        called-query?  (promise)
        pause-query    (promise)
        query-thunk    (fn []
                         (data/run-mbql-query checkins
                           {:aggregation [[:count]]}))
        ;; When the query is ran via the datasets endpoint, it will run in a future. That future can be canceled,
        ;; which should cause an interrupt
        query-future   (f query-thunk called-query? called-cancel? pause-query)]
    ;; The cancelled-query? and called-cancel? timeouts are very high and are really just intended to
    ;; prevent the test from hanging indefinitely. It shouldn't be hit unless something is really wrong
    (when (= ::query-never-called (deref called-query? 10000 ::query-never-called))
      (throw (TimeoutException. "query should have been called by now.")))
    ;; At this point in time, the query is blocked, waiting for `pause-query` do be delivered. Cancel still should
    ;; not have been called yet.
    (assert (not (realized? called-cancel?)) "cancel still should not have been called yet.")
    ;; If we cancel the future, it should throw an InterruptedException, which should call the cancel
    ;; method on the prepared statement
    (future-cancel query-future)
    (when (= ::cancel-never-called (deref called-cancel? 10000 ::cancel-never-called))
      (throw (TimeoutException. "cancel should have been called by now.")))
    ;; This releases the fake query function so it finishes
    (deliver pause-query true)
    ::success))

(defmacro throw-if-called
  "Redefines `fn-var` with a function that throws an exception if it's called"
  {:style/indent 1}
  [fn-symb & body]
  {:pre [(symbol? fn-symb)]}
  `(with-redefs [~fn-symb (fn [& ~'_]
                            (throw (RuntimeException. ~(format "%s should not be called!" fn-symb))))]
     ~@body))


(defn do-with-non-admin-groups-no-root-collection-perms [f]
  (initialize/initialize-if-needed! :db)
  (try
    (doseq [group-id (db/select-ids PermissionsGroup :id [:not= (u/get-id (group/admin))])]
      (perms/revoke-collection-permissions! group-id collection/root-collection))
    (f)
    (finally
      (doseq [group-id (db/select-ids PermissionsGroup :id [:not= (u/get-id (group/admin))])]
        (when-not (db/exists? Permissions
                    :group_id group-id
                    :object   (perms/collection-readwrite-path collection/root-collection))
          (perms/grant-collection-readwrite-permissions! group-id collection/root-collection))))))

(defmacro with-non-admin-groups-no-root-collection-perms
  "Temporarily remove Root Collection perms for all Groups besides the Admin group (which cannot have them removed). By
  default, all Groups have full readwrite perms for the Root Collection; use this macro to test situations where an
  admin has removed them."
  [& body]
  `(do-with-non-admin-groups-no-root-collection-perms (fn [] ~@body)))


(defn doall-recursive
  "Like `doall`, but recursively calls doall on map values and nested sequences, giving you a fully non-lazy object.
  Useful for tests when you need the entire object to be realized in the body of a `binding`, `with-redefs`, or
  `with-temp` form."
  [x]
  (cond
    (map? x)
    (into {} (for [[k v] (doall x)]
               [k (doall-recursive v)]))

    (sequential? x)
    (mapv doall-recursive (doall x))

    :else
    x))

(defmacro exception-and-message
  "Invokes `body`, catches the exception and returns a map with the exception class, message and data"
  [& body]
  `(try
     ~@body
     (catch Exception e#
       {:ex-class (class e#)
        :msg      (.getMessage e#)
        :data     (ex-data e#)})))

(defn call-with-locale
  "Sets the default locale temporarily to `locale-tag`, then invokes `f` and reverts the locale change"
  [locale-tag f]
  (let [current-locale (Locale/getDefault)]
    (try
      (Locale/setDefault (Locale/forLanguageTag locale-tag))
      (f)
      (finally
        (Locale/setDefault current-locale)))))

(defmacro with-locale
  "Allows a test to override the locale temporarily"
  [locale-tag & body]
  `(call-with-locale ~locale-tag (fn [] ~@body)))
