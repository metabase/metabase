(ns metabase.test.util
  "Helper functions and macros for writing unit tests."
  (:require [cheshire.core :as json]
            [clj-time.core :as time]
            [clojure
             [string :as str]
             [test :as t]
             [walk :as walk]]
            [clojure.tools.logging :as log]
            [clojurewerkz.quartzite.scheduler :as qs]
            [metabase
             [driver :as driver]
             [task :as task]
             [util :as u]]
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
            [metabase.plugins.classloader :as classloader]
            [metabase.test.data :as data]
            [metabase.util.date :as du]
            [schema.core :as s]
            [toucan.db :as db]
            [toucan.util.test :as tt])
  (:import java.util.concurrent.TimeoutException
           org.apache.log4j.Logger
           [org.quartz CronTrigger JobDetail JobKey Scheduler Trigger]))

(defmethod t/assert-expr 'schema=
  [message form]
  (let [[_ schema actual] form]
    `(let [schema# ~schema
           actual# ~actual
           pass?#  (nil? (s/check schema# actual#))]
       (t/do-report
        {:type     (if pass?# :pass :fail)
         :message  ~message
         :expected (s/explain schema#)
         :actual   actual#
         :diffs    (when-not pass?#
                     [(s/check schema# actual#)])}))))

(defmacro ^:deprecated expect-schema
  "Like `expect`, but checks that results match a schema."
  {:style/indent 0}
  [expected actual]
  `(t/deftest ~(symbol (format "expect-schema-%d" (hash &form)))
     (t/is (~'schema= ~expected ~actual))))

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
                           :fields_hash :date_joined :date-joined :last_login :dimension-id :human-readable-field-id}
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

(u/strict-extend (class Card)
  tt/WithTempDefaults
  {:with-temp-defaults (fn [_] {:creator_id             (rasta-id)
                                :dataset_query          {}
                                :display                :table
                                :name                   (random-name)
                                :visualization_settings {}})})

(u/strict-extend (class Collection)
  tt/WithTempDefaults
  {:with-temp-defaults (fn [_] {:name  (random-name)
                                :color "#ABCDEF"})})

(u/strict-extend (class Dashboard)
  tt/WithTempDefaults
  {:with-temp-defaults (fn [_] {:creator_id   (rasta-id)
                                :name         (random-name)})})

(u/strict-extend (class DashboardCardSeries)
  tt/WithTempDefaults
  {:with-temp-defaults (constantly {:position 0})})

(u/strict-extend (class Database)
  tt/WithTempDefaults
  {:with-temp-defaults (fn [_] {:details   {}
                                :engine    :h2
                                :is_sample false
                                :name      (random-name)})})

(u/strict-extend (class Dimension)
  tt/WithTempDefaults
  {:with-temp-defaults (fn [_] {:name (random-name)
                                :type "internal"})})

(u/strict-extend (class Field)
  tt/WithTempDefaults
  {:with-temp-defaults (fn [_] {:database_type "VARCHAR"
                                :base_type     :type/Text
                                :name          (random-name)
                                :position      1
                                :table_id      (data/id :checkins)})})

(u/strict-extend (class Metric)
  tt/WithTempDefaults
  {:with-temp-defaults (fn [_] {:creator_id  (rasta-id)
                                :definition  {}
                                :description "Lookin' for a blueberry"
                                :name        "Toucans in the rainforest"
                                :table_id    (data/id :checkins)})})

(u/strict-extend (class PermissionsGroup)
  tt/WithTempDefaults
  {:with-temp-defaults (fn [_] {:name (random-name)})})

(u/strict-extend (class Pulse)
  tt/WithTempDefaults
  {:with-temp-defaults (fn [_] {:creator_id (rasta-id)
                                :name       (random-name)})})

(u/strict-extend (class PulseCard)
  tt/WithTempDefaults
  {:with-temp-defaults (fn [_] {:position    0
                                :include_csv false
                                :include_xls false})})

(u/strict-extend (class PulseChannel)
  tt/WithTempDefaults
  {:with-temp-defaults (constantly {:channel_type  :email
                                    :details       {}
                                    :schedule_type :daily
                                    :schedule_hour 15})})

(u/strict-extend (class Revision)
  tt/WithTempDefaults
  {:with-temp-defaults (fn [_] {:user_id      (rasta-id)
                                :is_creation  false
                                :is_reversion false})})

(u/strict-extend (class Segment)
  tt/WithTempDefaults
  {:with-temp-defaults (fn [_] {:creator_id (rasta-id)
                                :definition  {}
                                :description "Lookin' for a blueberry"
                                :name        "Toucans in the rainforest"
                                :table_id    (data/id :checkins)})})

;; TODO - `with-temp` doesn't return `Sessions`, probably because their ID is a string?

(u/strict-extend (class Table)
  tt/WithTempDefaults
  {:with-temp-defaults (fn [_] {:db_id  (data/id)
                                :active true
                                :name   (random-name)})})

(u/strict-extend (class TaskHistory)
  tt/WithTempDefaults
  {:with-temp-defaults (fn [_]
                         (let [started (time/now)
                               ended   (time/plus started (time/millis 10))]
                           {:db_id      (data/id)
                            :task       (random-name)
                            :started_at (du/->Timestamp started)
                            :ended_at   (du/->Timestamp ended)
                            :duration   (du/calculate-duration started ended)}))})

(u/strict-extend (class User)
  tt/WithTempDefaults
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
  "Temporarily set the value of the Setting named by keyword `setting-k` to `value` and execute `f`, then re-establish
  the original value. This works much the same way as `binding`.

   Prefer the macro `with-temporary-setting-values` over using this function directly."
  {:style/indent 2}
  [setting-k value f]
  (let [setting        (#'setting/resolve-setting setting-k)
        original-value (when (or (#'setting/db-or-cache-value setting)
                                 (#'setting/env-var-value setting))
                         (setting/get setting-k))]
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

(defmacro discard-setting-changes
  "Execute `body` in a try-finally block, restoring any changes to listed `settings` to their original values at its
  conclusion.

    (discard-setting-changes [site-name]
      ...)"
  {:style/indent 1}
  [settings & body]
  `(with-temporary-setting-values ~(vec (mapcat (juxt identity #(list `setting/get (keyword %))) settings))
     ~@body))


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

  DEPRECATED -- this should no longer be needed; use `qp.tt/col` to get the actual real-life fingerprint of the
  column instead."
  [field]
  (-> field
      (update-in-if-present [:fingerprint :type :type/Number] round-fingerprint-fields 2 [:min :max :avg :sd])
      ;; quartal estimation is order dependent and the ordering is not stable across different DB engines, hence more
      ;; aggressive trimming
      (update-in-if-present [:fingerprint :type :type/Number] round-fingerprint-fields 0 [:q1 :q3])
      (update-in-if-present [:fingerprint :type :type/Text] round-fingerprint-fields 2 [:percent-json :percent-url :percent-email :average-length])))

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

(defn do-with-scheduler [scheduler f]
  (with-redefs [metabase.task/scheduler (constantly scheduler)]
    (f)))

(defmacro with-scheduler
  "Temporarily bind the Metabase Quartzite scheduler to SCHEULDER and run BODY."
  {:style/indent 1}
  [scheduler & body]
  `(do-with-scheduler ~scheduler (fn [] ~@body)))

(defn do-with-temp-scheduler [f]
  (classloader/the-classloader)
  (let [temp-scheduler (qs/start (qs/initialize))]
    (with-scheduler temp-scheduler
      (try
        (f)
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
