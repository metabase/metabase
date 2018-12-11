(ns metabase.test.util
  "Helper functions and macros for writing unit tests."
  (:require [cheshire.core :as json]
            [clj-time.core :as time]
            [clojure
             [string :as s]
             [walk :as walk]]
            [clojure.tools.logging :as log]
            [clojurewerkz.quartzite.scheduler :as qs]
            [expectations :refer :all]
            [metabase
             [driver :as driver]
             [task :as task]
             [util :as u]]
            [metabase.driver.sql-jdbc.connection :as sql-jdbc.conn]
            [metabase.models
             [card :refer [Card]]
             [collection :as collection :refer [Collection]]
             [dashboard :refer [Dashboard]]
             [dashboard-card-series :refer [DashboardCardSeries]]
             [database :refer [Database]]
             [dimension :refer [Dimension]]
             [field :refer [Field]]
             [metric :refer [Metric]]
             [permissions :as perms :refer [Permissions]]
             [permissions-group :as group :refer [PermissionsGroup]]
             [pulse :refer [Pulse]]
             [pulse-card :refer [PulseCard]]
             [pulse-channel :refer [PulseChannel]]
             [revision :refer [Revision]]
             [segment :refer [Segment]]
             [setting :as setting]
             [table :refer [Table]]
             [task-history :refer [TaskHistory]]
             [user :refer [User]]]
            [metabase.test.data :as data]
            [metabase.test.data.dataset-definitions :as defs]
            [metabase.util.date :as du]
            [toucan.db :as db]
            [toucan.util.test :as test])
  (:import java.util.TimeZone
           org.apache.log4j.Logger
           org.joda.time.DateTimeZone
           [org.quartz CronTrigger JobDetail JobKey Scheduler Trigger]))

;;; ---------------------------------------------------- match-$ -----------------------------------------------------

(defn- $->prop
  "If FORM is a symbol starting with a `$`, convert it to the form `(form-keyword SOURCE-OBJ)`.

    ($->prop my-obj 'fish)  -> 'fish
    ($->prop my-obj '$fish) -> '(:fish my-obj)"
  [source-obj form]
  (or (when (and (symbol? form)
                 (= (first (name form)) \$)
                 (not= form '$))
        (if (= form '$$)
          source-obj
          `(~(keyword (apply str (rest (name form)))) ~source-obj)))
      form))

(defmacro ^:deprecated match-$
  "Walk over map DEST-OBJECT and replace values of the form `$`, `$key`, or `$$` as follows:

    {k $}     -> {k (k SOURCE-OBJECT)}
    {k $symb} -> {k (:symb SOURCE-OBJECT)}
    $$        -> {k SOURCE-OBJECT}

  ex.

    (match-$ m {:a $, :b 3, :c $b}) -> {:a (:a m), b 3, :c (:b m)}"
  ;; DEPRECATED - This is an old pattern for writing tests and is probably best avoided going forward.
  ;; Tests that use this macro end up being huge, often with giant maps with many values that are `$`.
  ;; It's better just to write a helper function that only keeps values relevant to the tests you're writing
  ;; and use that to pare down the results (e.g. only keeping a handful of keys relevant to the test).
  ;; Alternatively, you can also consider converting fields that naturally change to boolean values indiciating their
  ;; presence see the `boolean-ids-and-timestamps` function below
  {:style/indent 1}
  [source-obj dest-object]
  {:pre [(map? dest-object)]}
  (let [source##    (gensym)
        dest-object (into {} (for [[k v] dest-object]
                               {k (condp = v
                                    '$ `(~k ~source##)
                                    '$$ source##
                                    v)}))]
    `(let [~source## ~source-obj]
       ~(walk/prewalk (partial $->prop source##)
                      dest-object))))


;;; random-name
(def ^:private ^{:arglists '([])} random-uppercase-letter
  (partial rand-nth (mapv char (range (int \A) (inc (int \Z))))))

(defn random-name
  "Generate a random string of 20 uppercase letters."
  []
  (apply str (repeatedly 20 random-uppercase-letter)))

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
                           :fields_hash :date_joined :date-joined :last_login :dimension-id :human-readable-field-id}
                         #(s/ends-with? % "_id")
                         #(s/ends-with? % "_at")))
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
  (require 'metabase.test.data.users)
  ((resolve 'metabase.test.data.users/user->id) username))

(defn- rasta-id [] (user-id :rasta))

(u/strict-extend (class Card)
  test/WithTempDefaults
  {:with-temp-defaults (fn [_] {:creator_id             (rasta-id)
                                :dataset_query          {}
                                :display                :table
                                :name                   (random-name)
                                :visualization_settings {}})})

(u/strict-extend (class Collection)
  test/WithTempDefaults
  {:with-temp-defaults (fn [_] {:name  (random-name)
                                :color "#ABCDEF"})})

(u/strict-extend (class Dashboard)
  test/WithTempDefaults
  {:with-temp-defaults (fn [_] {:creator_id   (rasta-id)
                                :name         (random-name)})})

(u/strict-extend (class DashboardCardSeries)
  test/WithTempDefaults
  {:with-temp-defaults (constantly {:position 0})})

(u/strict-extend (class Database)
  test/WithTempDefaults
  {:with-temp-defaults (fn [_] {:details   {}
                                :engine    :h2
                                :is_sample false
                                :name      (random-name)})})

(u/strict-extend (class Dimension)
  test/WithTempDefaults
  {:with-temp-defaults (fn [_] {:name (random-name)
                                :type "internal"})})

(u/strict-extend (class Field)
  test/WithTempDefaults
  {:with-temp-defaults (fn [_] {:database_type "VARCHAR"
                                :base_type     :type/Text
                                :name          (random-name)
                                :position      1
                                :table_id      (data/id :checkins)})})

(u/strict-extend (class Metric)
  test/WithTempDefaults
  {:with-temp-defaults (fn [_] {:creator_id  (rasta-id)
                                :definition  {}
                                :description "Lookin' for a blueberry"
                                :name        "Toucans in the rainforest"
                                :table_id    (data/id :checkins)})})

(u/strict-extend (class PermissionsGroup)
  test/WithTempDefaults
  {:with-temp-defaults (fn [_] {:name (random-name)})})

(u/strict-extend (class Pulse)
  test/WithTempDefaults
  {:with-temp-defaults (fn [_] {:creator_id (rasta-id)
                                :name       (random-name)})})

(u/strict-extend (class PulseCard)
  test/WithTempDefaults
  {:with-temp-defaults (fn [_] {:position    0
                                :include_csv false
                                :include_xls false})})

(u/strict-extend (class PulseChannel)
  test/WithTempDefaults
  {:with-temp-defaults (constantly {:channel_type  :email
                                    :details       {}
                                    :schedule_type :daily
                                    :schedule_hour 15})})

(u/strict-extend (class Revision)
  test/WithTempDefaults
  {:with-temp-defaults (fn [_] {:user_id      (rasta-id)
                                :is_creation  false
                                :is_reversion false})})

(u/strict-extend (class Segment)
  test/WithTempDefaults
  {:with-temp-defaults (fn [_] {:creator_id (rasta-id)
                                :definition  {}
                                :description "Lookin' for a blueberry"
                                :name        "Toucans in the rainforest"
                                :table_id    (data/id :checkins)})})

;; TODO - `with-temp` doesn't return `Sessions`, probably because their ID is a string?

(u/strict-extend (class Table)
  test/WithTempDefaults
  {:with-temp-defaults (fn [_] {:db_id  (data/id)
                                :active true
                                :name   (random-name)})})

(u/strict-extend (class TaskHistory)
  test/WithTempDefaults
  {:with-temp-defaults (fn [_]
                         (let [started (time/now)
                               ended   (time/plus started (time/millis 10))]
                           {:db_id      (data/id)
                            :task       (random-name)
                            :started_at (du/->Timestamp started)
                            :ended_at   (du/->Timestamp ended)
                            :duration   (du/calculate-duration started ended)}))})

(u/strict-extend (class User)
  test/WithTempDefaults
  {:with-temp-defaults (fn [_] {:first_name (random-name)
                                :last_name  (random-name)
                                :email      (random-email)
                                :password   (random-name)})})


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
  "Temporarily set the value of the `Setting` named by keyword SETTING-K to VALUE and execute F, then re-establish the
  original value. This works much the same way as `binding`.

   Prefer the macro `with-temporary-setting-values` over using this function directly."
  {:style/indent 2}
  [setting-k value f]
  (let [original-value (setting/get setting-k)]
    (try
      (setting/set! setting-k value)
      (f)
      (finally
        (setting/set! setting-k original-value)))))

(defmacro with-temporary-setting-values
  "Temporarily bind the values of one or more `Settings`, execute body, and re-establish the original values. This
  works much the same way as `binding`.

     (with-temporary-setting-values [google-auth-auto-create-accounts-domain \"metabase.com\"]
       (google-auth-auto-create-accounts-domain)) -> \"metabase.com\""
  [[setting-k value & more] & body]
  (let [body `(do-with-temporary-setting-value ~(keyword setting-k) ~value (fn [] ~@body))]
    (if (seq more)
      `(with-temporary-setting-values ~more ~body)
      body)))


(defn do-with-temp-vals-in-db
  "Implementation function for `with-temp-vals-in-db` macro. Prefer that to using this directly."
  [model object-or-id column->temp-value f]
  (let [original-column->value (db/select-one (vec (cons model (keys column->temp-value)))
                                 :id (u/get-id object-or-id))]
    (try
      (db/update! model (u/get-id object-or-id)
        column->temp-value)
      (f)
      (finally
        (db/update! model (u/get-id object-or-id)
          original-column->value)))))

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
  "Execute BODY, and return a vector of all messages logged using the `log/` family of functions. Messages are of the
  format `[:level throwable message]`, and are returned in chronological order from oldest to newest.

     (with-log-messages (log/warn \"WOW\")) ; -> [[:warn nil \"WOW\"]]"
  {:style/indent 0}
  [& body]
  `(do-with-log-messages (fn [] ~@body)))

(def level-kwd->level
  "Conversion from a keyword log level to the Log4J constance mapped to that log level.
   Not intended for use outside of the `with-mb-log-messages-at-level` macro."
  {:error org.apache.log4j.Level/ERROR
   :warn  org.apache.log4j.Level/WARN
   :info  org.apache.log4j.Level/INFO
   :debug org.apache.log4j.Level/DEBUG
   :trace org.apache.log4j.Level/TRACE})

(defn ^Logger metabase-logger
  "Gets the root logger for all metabase namespaces. Not intended for use outside of the
  `with-mb-log-messages-at-level` macro."
  []
  (Logger/getLogger "metabase"))

(defmacro with-mb-log-messages-at-level
  "Executes `body` with the metabase logging level set to `level-kwd`. This is needed when the logging level is set at
  a higher threshold than the log messages you're wanting to example. As an example if the metabase logging level is
  set to `ERROR` in the log4j.properties file and you are looking for a `WARN` message, it won't show up in the
  `with-log-messages` call as there's a guard around the log invocation, if it's not enabled (it is set to `ERROR`)
  the log function will never be invoked. This macro will temporarily set the logging level to `level-kwd`, then
  invoke `with-log-messages`, then set the level back to what it was before the invocation. This allows testing log
  messages even if the threshold is higher than the message you are looking for."
  [level-kwd & body]
  `(let  [orig-log-level# (.getLevel (metabase-logger))]
     (try
       (.setLevel (metabase-logger) (get level-kwd->level ~level-kwd))
       (with-log-messages ~@body)
       (finally
         (.setLevel (metabase-logger) orig-log-level#)))))

(defn vectorize-byte-arrays
  "Walk form X and convert any byte arrays in the results to standard Clojure vectors. This is useful when writing
  tests that return byte arrays (such as things that work with query hashes),since identical arrays are not considered
  equal."
  {:style/indent 0}
  [x]
  (walk/postwalk (fn [form]
                   (if (instance? (Class/forName "[B") form)
                     (vec form)
                     form))
                 x))

(defn- update-in-if-present
  "If the path `KS` is found in `M`, call update-in with the original
  arguments to this function, otherwise, return `M`"
  [m ks f & args]
  (if (= ::not-found (get-in m ks ::not-found))
    m
    (apply update-in m ks f args)))

(defn- round-fingerprint-fields [fprint-type-map decimal-places fields]
  (reduce (fn [fprint field]
            (update-in-if-present fprint [field] (fn [num]
                                                   (if (integer? num)
                                                     num
                                                     (u/round-to-decimals decimal-places num)))))
          fprint-type-map fields))

(defn round-fingerprint
  "Rounds the numerical fields of a fingerprint to 2 decimal places"
  [field]
  (-> field
      (update-in-if-present [:fingerprint :type :type/Number] round-fingerprint-fields 2 [:min :max :avg :sd])
      ;; quartal estimation is order dependent and the ordering is not stable across different DB engines, hence more aggressive trimming
      (update-in-if-present [:fingerprint :type :type/Number] round-fingerprint-fields 0 [:q1 :q3])
      (update-in-if-present [:fingerprint :type :type/Text] round-fingerprint-fields 2 [:percent-json :percent-url :percent-email :average-length])))

(defn round-fingerprint-cols
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
  (postwalk-pred double?
                 #(u/round-to-decimals decimal-place %)
                 data))


;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                                   SCHEDULER                                                    |
;;; +----------------------------------------------------------------------------------------------------------------+

;; Various functions for letting us check that things get scheduled properly. Use these to put a temporary scheduler
;; in place and then check the tasks that get scheduled

(defn do-with-scheduler [scheduler f]
  (with-redefs [metabase.task/scheduler (constantly scheduler)]
    (f)))

(defmacro with-scheduler
  "Temporarily bind the Metabase Quartzite scheduler to SCHEULDER and run BODY."
  {:style/indent 1}
  [scheduler & body]
  `(do-with-scheduler ~scheduler (fn [] ~@body)))

(defn do-with-temp-scheduler [f]
  (let [temp-scheduler (qs/start (qs/initialize))]
    (with-scheduler temp-scheduler
      (try (f)
           (finally
             (qs/shutdown temp-scheduler))))))

(defmacro with-temp-scheduler
  "Execute BODY with a temporary scheduler in place.

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

(defn db-timezone-id
  "Return the timezone id from the test database. Must be called with `*driver*` bound,such as via `driver/with-driver`"
  []
  (assert driver/*driver*)
  (let [db (data/db)]
    ;; clear the connection pool for SQL JDBC drivers. It's possible that a previous test ran and set the session's
    ;; timezone to something, then returned the session to the pool. Sometimes that connection's session can remain
    ;; intact and subsequent queries will continue in that timezone. That causes problems for tests that we can
    ;; determine the database's timezone.
    (driver/notify-database-updated driver/*driver* db)
    (data/dataset test-data
      (-> (driver/current-db-time driver/*driver* db)
          .getChronology
          .getZone
          .getID))))

(defn call-with-jvm-tz
  "Invokes the thunk `F` with the JVM timezone set to `DTZ`, puts the various timezone settings back the way it found
  it when it exits."
  [^DateTimeZone dtz f]
  (let [orig-tz (TimeZone/getDefault)
        orig-dtz (time/default-time-zone)
        orig-tz-prop (System/getProperty "user.timezone")]
    (try
      ;; It looks like some DB drivers cache the timezone information
      ;; when instantiated, this clears those to force them to reread
      ;; that timezone value
      (reset! @#'sql-jdbc.conn/database-id->connection-pool {})
      ;; Used by JDBC, and most JVM things
      (TimeZone/setDefault (.toTimeZone dtz))
      ;; Needed as Joda time has a different default TZ
      (DateTimeZone/setDefault dtz)
      ;; We read the system property directly when formatting results, so this needs to be changed
      (System/setProperty "user.timezone" (.getID dtz))
      (with-redefs [du/jvm-timezone (delay (.toTimeZone dtz))]
        (f))
      (finally
        ;; We need to ensure we always put the timezones back the way
        ;; we found them as it will cause test failures
        (TimeZone/setDefault orig-tz)
        (DateTimeZone/setDefault orig-dtz)
        (System/setProperty "user.timezone" orig-tz-prop)))))

(defmacro with-jvm-tz
  "Invokes `BODY` with the JVM timezone set to `DTZ`"
  [dtz & body]
  `(call-with-jvm-tz ~dtz (fn [] ~@body)))


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
    (f)
    (finally
      (doseq [model model-seq]
        (do-model-cleanup! (db/resolve-model model))))))

(defmacro with-model-cleanup
  "This will delete all rows found for each model in `model-seq`. By default, this calls `delete!`, so if the model has
  defined any `pre-delete` behavior, that will be preserved. Alternatively, you can define a custom implementation by
  using the `do-model-cleanup!` multimethod above."
  [model-seq & body]
  `(do-with-model-cleanup ~model-seq (fn [] ~@body)))

(defn call-with-paused-query
  "This is a function to make testing query cancellation eaiser as it can be complex handling the multiple threads
  needed to orchestrate a query cancellation.

  This function takes `f` which is a function of 4 arguments:
     - query-thunk - no-arg function that will invoke a query
     - query promise - promise used to validate the query function was called
     - cancel promise - promise used to validate a cancellation function was called
     - pause query promise - promise used to hang the query function, allowing cancellation

  This function returns a vector of booleans indicating the various statuses of the promises, useful for comparison
  in an `expect`"
  [f]
  (data/with-db (data/get-or-create-database! defs/test-data)
    (let [called-cancel?             (promise)
          called-query?              (promise)
          pause-query                (promise)
          before-query-called-cancel (realized? called-cancel?)
          before-query-called-query  (realized? called-query?)
          query-thunk                (fn [] (data/run-mbql-query checkins
                                              {:aggregation [[:count]]}))
          ;; When the query is ran via the datasets endpoint, it will run in a future. That future can be cancelled,
          ;; which should cause an interrupt
          query-future               (f query-thunk called-query? called-cancel? pause-query)]

      ;; Make sure that we start out with our promises not having a value
      [before-query-called-cancel
       before-query-called-query
       ;; The cancelled-query? and called-cancel? timeouts are very high and are really just intended to
       ;; prevent the test from hanging indefinitely. It shouldn't be hit unless something is really wrong
       (deref called-query? 120000 ::query-never-called)
       ;; At this point in time, the query is blocked, waiting for `pause-query` do be delivered
       (realized? called-cancel?)
       (do
         ;; If we cancel the future, it should throw an InterruptedException, which should call the cancel
         ;; method on the prepared statement
         (future-cancel query-future)
         (deref called-cancel? 120000 ::cancel-never-called))
       (do
         ;; This releases the fake query function so it finishes
         (deliver pause-query true)
         true)])))

(defmacro throw-if-called
  "Redefines `fn-var` with a function that throws an exception if it's called"
  {:style/indent 1}
  [fn-var & body]
  `(with-redefs [~fn-var (fn [& args#]
                           (throw (RuntimeException. "Should not be called!")))]
     ~@body))


(defn do-with-non-admin-groups-no-root-collection-perms [f]
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
