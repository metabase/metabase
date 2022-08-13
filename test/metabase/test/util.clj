(ns metabase.test.util
  "Helper functions and macros for writing unit tests."
  (:require [cheshire.core :as json]
            [clojure.java.io :as io]
            [clojure.set :as set]
            [clojure.string :as str]
            [clojure.test :refer :all]
            [clojure.walk :as walk]
            [clojurewerkz.quartzite.scheduler :as qs]
            [colorize.core :as colorize]
            [environ.core :as env]
            [java-time :as t]
            [metabase.driver :as driver]
            [metabase.models :refer [Card Collection Dashboard DashboardCardSeries Database Dimension Field FieldValues
                                     LoginHistory Metric NativeQuerySnippet Permissions PermissionsGroup PermissionsGroupMembership
                                     PersistedInfo Pulse PulseCard PulseChannel Revision Segment Setting
                                     Table TaskHistory Timeline TimelineEvent User]]
            [metabase.models.collection :as collection]
            [metabase.models.permissions :as perms]
            [metabase.models.permissions-group :as perms-group]
            [metabase.models.setting :as setting]
            [metabase.models.setting.cache :as setting.cache]
            [metabase.models.timeline :as timeline]
            [metabase.plugins.classloader :as classloader]
            [metabase.task :as task]
            [metabase.test-runner.assert-exprs :as test-runner.assert-exprs]
            [metabase.test-runner.parallel :as test-runner.parallel]
            [metabase.test.data :as data]
            [metabase.test.fixtures :as fixtures]
            [metabase.test.initialize :as initialize]
            [metabase.test.util.log :as tu.log]
            [metabase.util :as u]
            [metabase.util.files :as u.files]
            [potemkin :as p]
            [toucan.db :as db]
            [toucan.models :as models]
            [toucan.util.test :as tt])
  (:import [java.io File FileInputStream]
           java.net.ServerSocket
           java.util.concurrent.TimeoutException
           java.util.Locale
           [org.quartz CronTrigger JobDetail JobKey Scheduler Trigger]))

(comment tu.log/keep-me
         test-runner.assert-exprs/keep-me)

(use-fixtures :once (fixtures/initialize :db))

;; these are imported because these functions originally lived in this namespace, and some tests might still be
;; referencing them from here. We can remove the imports once everyone is using `metabase.test` instead of using this
;; namespace directly.
(p/import-vars
 [tu.log
  with-log-level
  with-log-messages-for-level])

(defn- random-uppercase-letter []
  (char (+ (int \A) (rand-int 26))))

(defn random-name
  "Generate a random string of 20 uppercase letters."
  []
  (str/join (repeatedly 20 random-uppercase-letter)))

(defn random-hash
  "Generate a random hash of 44 characters to simulate a base64 encoded sha. Eg,
  \"y6dkn65bbhRZkXj9Yyp0awCKi3iy/xeVIGa/eFfsszM=\""
  []
  (let [chars (concat (map char (range (int \a) (+ (int \a) 25)))
                      (map char (range (int \A) (+ (int \A) 25)))
                      (range 10)
                      [\/ \+])]
    (str (apply str (repeatedly 43 #(rand-nth chars))) "=")))

(defn random-email
  "Generate a random email address."
  []
  (str (u/lower-case-en (random-name)) "@metabase.com"))

(defn boolean-ids-and-timestamps
  "Useful for unit test comparisons. Converts map keys found in `data` satisfying `pred` with booleans when not nil."
  ([data]
   (boolean-ids-and-timestamps
    (every-pred (some-fn keyword? string?)
                (some-fn #{:id :created_at :updated_at :last_analyzed :created-at :updated-at :field-value-id :field-id
                           :date_joined :date-joined :last_login :dimension-id :human-readable-field-id :timestamp
                           :entity_id}
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

(def ^:private with-temp-defaults-fns
  {Card
   (fn [_] {:creator_id             (rasta-id)
            :database_id            (data/id)
            :dataset_query          {}
            :display                :table
            :name                   (random-name)
            :visualization_settings {}})

   Collection
   (fn [_] {:name  (random-name)
            :color "#ABCDEF"})

   Dashboard
   (fn [_] {:creator_id (rasta-id)
            :name       (random-name)})

   DashboardCardSeries
   (constantly {:position 0})

   Database
   (fn [_] {:details   {}
            :engine    :h2
            :is_sample false
            :name      (random-name)})

   Dimension
   (fn [_] {:name (random-name)
            :type "internal"})

   Field
   (fn [_] {:database_type "VARCHAR"
            :base_type     :type/Text
            :name          (random-name)
            :position      1
            :table_id      (data/id :checkins)})

   LoginHistory
   (fn [_] {:device_id          "129d39d1-6758-4d2c-a751-35b860007002"
            :device_description "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML like Gecko) Chrome/89.0.4389.86 Safari/537.36"
            :ip_address         "0:0:0:0:0:0:0:1"})

   Metric
   (fn [_] {:creator_id  (rasta-id)
            :definition  {}
            :description "Lookin' for a blueberry"
            :name        "Toucans in the rainforest"
            :table_id    (data/id :checkins)})

   NativeQuerySnippet
   (fn [_] {:creator_id (user-id :crowberto)
            :name       (random-name)
            :content    "1 = 1"})

   PersistedInfo
   (fn [_] {:question_slug (random-name)
            :query_hash    (random-hash)
            :definition    {:table-name (random-name)
                            :field-definitions (repeatedly
                                                 4
                                                 #(do {:field-name (random-name) :base-type "type/Text"}))}
            :table_name    (random-name)
            :active        true
            :state         "persisted"
            :refresh_begin (t/zoned-date-time)
            :created_at    (t/zoned-date-time)
            :creator_id    (rasta-id)})

   PermissionsGroup
   (fn [_] {:name (random-name)})

   Pulse
   (fn [_] {:creator_id (rasta-id)
            :name       (random-name)})

   PulseCard
   (fn [_] {:position    0
            :include_csv false
            :include_xls false})

   PulseChannel
   (constantly {:channel_type  :email
                :details       {}
                :schedule_type :daily
                :schedule_hour 15})

   Revision
   (fn [_] {:user_id      (rasta-id)
            :is_creation  false
            :is_reversion false})

   Segment
   (fn [_] {:creator_id  (rasta-id)
            :definition  {}
            :description "Lookin' for a blueberry"
            :name        "Toucans in the rainforest"
            :table_id    (data/id :checkins)})

   ;; TODO - `with-temp` doesn't return `Sessions`, probably because their ID is a string?

   Table
   (fn [_] {:db_id  (data/id)
            :active true
            :name   (random-name)})

   TaskHistory
   (fn [_]
     (let [started (t/zoned-date-time)
           ended   (t/plus started (t/millis 10))]
       {:db_id      (data/id)
        :task       (random-name)
        :started_at started
        :ended_at   ended
        :duration   (.toMillis (t/duration started ended))}))

   Timeline
   (fn [_]
     {:name       "Timeline of bird squawks"
      :default    false
      :icon       timeline/DefaultIcon
      :creator_id (rasta-id)})

   TimelineEvent
   (fn [_]
     {:name         "default timeline event"
      :icon         timeline/DefaultIcon
      :timestamp    (t/zoned-date-time)
      :timezone     "US/Pacific"
      :time_matters true
      :creator_id   (rasta-id)})

   User
   (fn [_] {:first_name (random-name)
            :last_name  (random-name)
            :email      (random-email)
            :password   (random-name)})})

(defn- set-with-temp-defaults! []
  (doseq [[model defaults-fn] with-temp-defaults-fns]
    ;; make sure we have the latest version of the class in case it was redefined since we imported it
    (extend (Class/forName (.getCanonicalName (class model)))
      tt/WithTempDefaults
      {:with-temp-defaults defaults-fn})))

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
                   #'Timeline
                   #'User]]
  (remove-watch model-var ::reload)
  (add-watch
   model-var
   ::reload
   (fn [_key _reference _old-state _new-state]
     (println (format "%s changed, reloading with-temp-defaults" model-var))
     (set-with-temp-defaults!))))


;;; ------------------------------------------------- Other Util Fns -------------------------------------------------

(defn obj->json->obj
  "Convert an object to JSON and back again. This can be done to ensure something will match its serialized +
  deserialized form, e.g. keywords that aren't map keys, record types vs. plain map types, or timestamps vs ISO-8601
  strings:

     (obj->json->obj {:type :query}) -> {:type \"query\"}"
  {:style/indent 0}
  [obj]
  (json/parse-string (json/generate-string obj) keyword))

(defn- ->lisp-case-keyword [s]
  (-> (name s)
      (str/replace #"_" "-")
      str/lower-case
      keyword))

(defn do-with-temp-env-var-value
  "Impl for [[with-temp-env-var-value]] macro."
  [env-var-keyword value thunk]
  (test-runner.parallel/assert-test-is-not-parallel "with-temp-env-var-value")
  (let [value (str value)]
    (testing (colorize/blue (format "\nEnv var %s = %s\n" env-var-keyword (pr-str value)))
      (try
        ;; temporarily override the underlying environment variable value
        (with-redefs [env/env (assoc env/env env-var-keyword value)]
          ;; flush the Setting cache so it picks up the env var value for the Setting (if applicable)
          (setting.cache/restore-cache!)
          (thunk))
        (finally
          ;; flush the cache again so the original value of any env var Settings get restored
          (setting.cache/restore-cache!))))))

(defmacro with-temp-env-var-value
  "Temporarily override the value of one or more environment variables and execute `body`. Resets the Setting cache so
  any env var Settings will see the updated value, and resets the cache again at the conclusion of `body` so the
  original values are restored.

    (with-temp-env-var-value [mb-send-email-on-first-login-from-new-device \"FALSE\"]
      ...)"
  [[env-var value & more :as bindings] & body]
  {:pre [(vector? bindings) (even? (count bindings))]}
  `(do-with-temp-env-var-value
    ~(->lisp-case-keyword env-var)
    ~value
    (fn [] ~@(if (seq more)
               [`(with-temp-env-var-value ~(vec more) ~@body)]
               body))))

(setting/defsetting with-temp-env-var-value-test-setting
  "Setting for the `with-temp-env-var-value-test` test."
  :visibility :internal
  :setter     :none
  :default    "abc")

(deftest with-temp-env-var-value-test
  (is (= "abc"
         (with-temp-env-var-value-test-setting)))
  (with-temp-env-var-value [mb-with-temp-env-var-value-test-setting "def"]
    (testing "env var value"
      (is (= "def"
             (env/env :mb-with-temp-env-var-value-test-setting))))
    (testing "Setting value"
      (is (= "def"
             (with-temp-env-var-value-test-setting)))))
  (testing "original value should be restored"
    (testing "env var value"
      (is (= nil
             (env/env :mb-with-temp-env-var-value-test-setting))))
    (testing "Setting value"
      (is (= "abc"
             (with-temp-env-var-value-test-setting)))))

  (testing "override multiple env vars"
    (with-temp-env-var-value [some-fake-env-var 123, "ANOTHER_FAKE_ENV_VAR" "def"]
      (testing "Should convert values to strings"
        (is (= "123"
               (:some-fake-env-var env/env))))
      (testing "should handle CAPITALS/SNAKE_CASE"
        (is (= "def"
               (:another-fake-env-var env/env))))))

  (testing "validation"
    (are [form] (thrown?
                 clojure.lang.Compiler$CompilerException
                 (macroexpand form))
      (list `with-temp-env-var-value '[a])
      (list `with-temp-env-var-value '[a b c]))))

(defn- upsert-raw-setting!
  [original-value setting-k value]
  (if original-value
    (db/update! Setting setting-k :value value)
    (db/insert! Setting :key setting-k :value value))
  (setting.cache/restore-cache!))

(defn- restore-raw-setting!
  [original-value setting-k]
  (if original-value
    (db/update! Setting setting-k :value original-value)
    (db/delete! Setting :key setting-k))
  (setting.cache/restore-cache!))

(defn do-with-temporary-setting-value
  "Temporarily set the value of the Setting named by keyword `setting-k` to `value` and execute `f`, then re-establish
  the original value. This works much the same way as [[binding]].

  If an env var value is set for the setting, this acts as a wrapper around [[do-with-temp-env-var-value]].

  If `raw-setting?` is `true`, this works like [[with-temp*]] against the `Setting` table, but it ensures no exception
  is thrown if the `setting-k` already exists.

  Prefer the macro [[with-temporary-setting-values]] or [[with-temporary-raw-setting-values]] over using this function directly."
  [setting-k value thunk & {:keys [raw-setting?]}]
  ;; plugins have to be initialized because changing `report-timezone` will call driver methods
  (initialize/initialize-if-needed! :db :plugins)
  (let [setting-k     (name setting-k)
        setting       (try
                       (#'setting/resolve-setting setting-k)
                       (catch Exception e
                         (when-not raw-setting?
                           (throw e))))]
    (if-let [env-var-value (and (not raw-setting?) (#'setting/env-var-value setting-k))]
      (do-with-temp-env-var-value setting env-var-value thunk)
      (let [original-value (if raw-setting?
                             (db/select-one-field :value Setting :key setting-k)
                             (#'setting/get setting-k))]
        (try
         (if raw-setting?
           (upsert-raw-setting! original-value setting-k value)
           (setting/set! setting-k value))
         (testing (colorize/blue (format "\nSetting %s = %s\n" (keyword setting-k) (pr-str value)))
           (thunk))
         (catch Throwable e
           (throw (ex-info (str "Error in with-temporary-setting-values: " (ex-message e))
                           {:setting  setting-k
                            :location (symbol (name (:namespace setting)) (name setting-k))
                            :value    value}
                           e)))
         (finally
          (try
           (if raw-setting?
             (restore-raw-setting! original-value setting-k)
             (setting/set! setting-k original-value))
           (catch Throwable e
             (throw (ex-info (str "Error restoring original Setting value: " (ex-message e))
                             {:setting        setting-k
                              :location       (symbol (name (:namespace setting)) setting-k)
                              :original-value original-value}
                             e))))))))))

(defmacro with-temporary-setting-values
  "Temporarily bind the site-wide values of one or more `Settings`, execute body, and re-establish the original values.
  This works much the same way as `binding`.

     (with-temporary-setting-values [google-auth-auto-create-accounts-domain \"metabase.com\"]
       (google-auth-auto-create-accounts-domain)) -> \"metabase.com\"

  If an env var value is set for the setting, this will change the env var rather than the setting stored in the DB.
  To temporarily override the value of *read-only* env vars, use [[with-temp-env-var-value]]."
  [[setting-k value & more :as bindings] & body]
  (assert (even? (count bindings)) "mismatched setting/value pairs: is each setting name followed by a value?")
  (test-runner.parallel/assert-test-is-not-parallel "with-temporary-setting-vales")
  (if (empty? bindings)
    `(do ~@body)
    `(do-with-temporary-setting-value ~(keyword setting-k) ~value
       (fn []
         (with-temporary-setting-values ~more
           ~@body)))))

(defmacro with-temporary-raw-setting-values
  "Like `with-temporary-setting-values` but works with raw value and it allows settings that are not defined using `defsetting`."
  [[setting-k value & more :as bindings] & body]
  (assert (even? (count bindings)) "mismatched setting/value pairs: is each setting name followed by a value?")
  (test-runner.parallel/assert-test-is-not-parallel "with-temporary-raw-setting-values")
  (if (empty? bindings)
    `(do ~@body)
    `(do-with-temporary-setting-value ~(keyword setting-k) ~value
       (fn []
         (with-temporary-raw-setting-values ~more
           ~@body))
       :raw-setting? true)))

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
  (test-runner.parallel/assert-test-is-not-parallel "with-temp-vals-in-db")
  ;; use low-level `query` and `execute` functions here, because Toucan `select` and `update` functions tend to do
  ;; things like add columns like `common_name` that don't actually exist, causing subsequent update to fail
  (let [model                    (db/resolve-model model)
        [original-column->value] (db/query {:select (keys column->temp-value)
                                            :from   [model]
                                            :where  [:= :id (u/the-id object-or-id)]})]
    (assert original-column->value
            (format "%s %d not found." (name model) (u/the-id object-or-id)))
    (try
      (db/update! model (u/the-id object-or-id)
        column->temp-value)
      (f)
      (finally
        (db/execute!
         {:update model
          :set    original-column->value
          :where  [:= :id (u/the-id object-or-id)]})))))

(defmacro with-temp-vals-in-db
  "Temporary set values for an `object-or-id` in the application database, execute `body`, and then restore the
  original values. This is useful for cases when you want to test how something behaves with slightly different values
  in the DB for 'permanent' rows (rows that live for the life of the test suite, rather than just a single test). For
  example, Database/Table/Field rows related to the test DBs can be temporarily tweaked in this way.

    ;; temporarily make Field 100 a FK to Field 200 and call (do-something)
    (with-temp-vals-in-db Field 100 {:fk_target_field_id 200, :semantic_type \"type/FK\"}
      (do-something))"
  {:style/indent 3}
  [model object-or-id column->temp-value & body]
  `(do-with-temp-vals-in-db ~model ~object-or-id ~column->temp-value (fn [] ~@body)))

(defn is-uuid-string?
  "Is string S a valid UUID string?"
  ^Boolean [^String s]
  (boolean (when (string? s)
             (re-matches #"^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$" s))))

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
  (binding [task/*quartz-scheduler* scheduler]
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

(defmulti with-model-cleanup-additional-conditions
  "Additional conditions that should be used to restrict which instances automatically get deleted by
  `with-model-cleanup`. Conditions should be a HoneySQL `:where` clause."
  {:arglists '([model])}
  type)

(defmethod with-model-cleanup-additional-conditions :default
  [_]
  nil)

(defmethod with-model-cleanup-additional-conditions (type Collection)
  [_]
  ;; NEVER delete personal collections for the test users.
  [:or
   [:= :personal_owner_id nil]
   [:not-in :personal_owner_id (set (map (requiring-resolve 'metabase.test.data.users/user->id)
                                         @(requiring-resolve 'metabase.test.data.users/usernames)))]])

(defn do-with-model-cleanup [models f]
  {:pre [(sequential? models) (every? models/model? models)]}
  (test-runner.parallel/assert-test-is-not-parallel "with-model-cleanup")
  (initialize/initialize-if-needed! :db)
  (let [model->old-max-id (into {} (for [model models]
                                     [model (:max-id (db/select-one [model [:%max.id :max-id]]))]))]
    (try
      (testing (str "\n" (pr-str (cons 'with-model-cleanup (map name models))) "\n")
        (f))
      (finally
        (doseq [model models
                ;; might not have an old max ID if this is the first time the macro is used in this test run.
                :let  [old-max-id            (or (get model->old-max-id model)
                                                 0)
                       max-id-condition      [:> :id old-max-id]
                       additional-conditions (with-model-cleanup-additional-conditions model)]]
          (db/execute!
           {:delete-from model
            :where       (if (seq additional-conditions)
                           [:and max-id-condition additional-conditions]
                           max-id-condition)}))))))

(defmacro with-model-cleanup
  "Execute `body`, then delete any *new* rows created for each model in `models`. Calls `delete!`, so if the model has
  defined any `pre-delete` behavior, that will be preserved.

  It's preferable to use `with-temp` instead, but you can use this macro if `with-temp` wouldn't work in your
  situation (e.g. when creating objects via the API).

    (with-model-cleanup [Card]
      (create-card-via-api!)
      (is (= ...)))"
  [models & body]
  `(do-with-model-cleanup ~models (fn [] ~@body)))

(deftest with-model-cleanup-test
  (testing "Make sure the with-model-cleanup macro actually works as expected"
    (tt/with-temp Card [other-card]
      (let [card-count-before (db/count Card)
            card-name         (random-name)]
        (with-model-cleanup [Card]
          (db/insert! Card (-> other-card (dissoc :id :entity_id) (assoc :name card-name)))
          (testing "Card count should have increased by one"
            (is (= (inc card-count-before)
                   (db/count Card))))
          (testing "Card should exist"
            (is (db/exists? Card :name card-name))))
        (testing "Card should be deleted at end of with-model-cleanup form"
          (is (= card-count-before
                 (db/count Card)))
          (is (not (db/exists? Card :name card-name)))
          (testing "Shouldn't delete other Cards"
            (is (pos? (db/count Card)))))))))


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

(defn do-with-discarded-collections-perms-changes [collection-or-id f]
  (initialize/initialize-if-needed! :db)
  (let [read-path                   (perms/collection-read-path collection-or-id)
        readwrite-path              (perms/collection-readwrite-path collection-or-id)
        groups-with-read-perms      (db/select-field :group_id Permissions :object read-path)
        groups-with-readwrite-perms (db/select-field :group_id Permissions :object readwrite-path)]
    (test-runner.parallel/assert-test-is-not-parallel "with-discarded-collections-perms-changes")
    (try
      (f)
      (finally
        (db/delete! Permissions :object [:in #{read-path readwrite-path}])
        (doseq [group-id groups-with-read-perms]
          (perms/grant-collection-read-permissions! group-id collection-or-id))
        (doseq [group-id groups-with-readwrite-perms]
          (perms/grant-collection-readwrite-permissions! group-id collection-or-id))))))

(defmacro with-discarded-collections-perms-changes
  "Execute `body`; then, in a `finally` block, restore permissions to `collection-or-id` to what they were originally."
  [collection-or-id & body]
  `(do-with-discarded-collections-perms-changes ~collection-or-id (fn [] ~@body)))

(defn do-with-non-admin-groups-no-collection-perms [collection f]
  (test-runner.parallel/assert-test-is-not-parallel "with-non-admin-groups-no-collection-perms")
  (try
    (do-with-discarded-collections-perms-changes
     collection
     (fn []
       (db/delete! Permissions
         :object [:in #{(perms/collection-read-path collection) (perms/collection-readwrite-path collection)}]
         :group_id [:not= (u/the-id (perms-group/admin))])
       (f)))
    ;; if this is the default namespace Root Collection, then double-check to make sure all non-admin groups get
    ;; perms for it at the end. This is here mostly for legacy reasons; we can remove this but it will require
    ;; rewriting a few tests.
    (finally
      (when (and (:metabase.models.collection.root/is-root? collection)
                 (not (:namespace collection)))
        (doseq [group-id (db/select-ids PermissionsGroup :id [:not= (u/the-id (perms-group/admin))])]
          (when-not (db/exists? Permissions :group_id group-id, :object "/collection/root/")
            (perms/grant-collection-readwrite-permissions! group-id collection/root-collection)))))))

(defmacro with-non-admin-groups-no-root-collection-perms
  "Temporarily remove Root Collection perms for all Groups besides the Admin group (which cannot have them removed). By
  default, all Groups have full readwrite perms for the Root Collection; use this macro to test situations where an
  admin has removed them.

  Only affects the Root Collection for the default namespace. Use
  `with-non-admin-groups-no-root-collection-for-namespace-perms` to do the same thing for the Root Collection of other
  namespaces."
  [& body]
  `(do-with-non-admin-groups-no-collection-perms collection/root-collection (fn [] ~@body)))

(defmacro with-non-admin-groups-no-root-collection-for-namespace-perms
  "Like `with-non-admin-groups-no-root-collection-perms`, but for the Root Collection of a non-default namespace."
  [collection-namespace & body]
  `(do-with-non-admin-groups-no-collection-perms
    (assoc collection/root-collection
           :namespace (name ~collection-namespace))
    (fn [] ~@body)))

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
  (test-runner.parallel/assert-test-is-not-parallel "with-locale")
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

(defn do-with-column-remappings [orig->remapped thunk]
  (transduce
   identity
   (fn
     ([] thunk)
     ([thunk] (thunk))
     ([thunk [original-column-id remap]]
      (let [original       (db/select-one Field :id (u/the-id original-column-id))
            describe-field (fn [{table-id :table_id, field-name :name}]
                             (format "%s.%s" (db/select-one-field :name Table :id table-id) field-name))]
        (if (integer? remap)
          ;; remap is integer => fk remap
          (let [remapped (db/select-one Field :id (u/the-id remap))]
            (fn []
              (tt/with-temp Dimension [_ {:field_id                (:id original)
                                          :name                    (format "%s [external remap]" (:display_name original))
                                          :type                    :external
                                          :human_readable_field_id (:id remapped)}]
                (testing (format "With FK remapping %s -> %s\n" (describe-field original) (describe-field remapped))
                  (thunk)))))
          ;; remap is sequential or map => HRV remap
          (let [values-map (if (sequential? remap)
                             (zipmap (range 1 (inc (count remap)))
                                     remap)
                             remap)]
            (fn []
              (tt/with-temp* [Dimension   [_ {:field_id (:id original)
                                              :name     (format "%s [internal remap]" (:display_name original))
                                              :type     :internal}]
                              FieldValues [_ {:field_id              (:id original)
                                              :values                (keys values-map)
                                              :human_readable_values (vals values-map)}]]
                (testing (format "With human readable values remapping %s -> %s\n"
                                 (describe-field original) (pr-str values-map))
                  (thunk)))))))))
   orig->remapped))

(defn- col-remappings-arg [x]
  (cond
    (and (symbol? x)
         (not (str/starts-with? x "%")))
    `(data/$ids ~(symbol (str \% x)))

    (and (seqable? x)
         (= (first x) 'values-of))
    (let [[_ table+field] x
          [table field]   (str/split (str table+field) #"\.")]
      `(into {} (get-in (data/run-mbql-query ~(symbol table)
                          {:fields [~'$id ~(symbol (str \$ field))]})
                        [:data :rows])))

    :else
    x))

(defmacro with-column-remappings
  "Execute `body` with column remappings in place. Can create either FK \"external\" or human-readable-values
  \"internal\" remappings:

  FK 'external' remapping -- pass a column to remap to (either as a symbol, or an integer ID):

    (with-column-remappings [reviews.product_id products.title]
      ...)

  Symbols are normally converted to [[metabase.test/id]] forms e.g.

    reviews.product_id -> (mt/id :reviews :product_id)

  human-readable-values 'internal' remappings: pass a vector or map of values. Vector just sets the first `n` values
  starting with 1 (for common cases where the column is an FK ID column)

    (with-column-remappings [venues.category_id [\"My Cat 1\" \"My Cat 2\"]]
      ...)

  equivalent to:

    (with-column-remappings [venues.category_id {1 \"My Cat 1\", 2 \"My Cat 2\"}]
      ...)

  You can also do a human-readable-values 'internal' remapping using the values from another Field by using the
  special `values-of` form:

    (with-column-remappings [venues.category_id (values-of categories.name)]
      ...)"
  {:arglists '([[original-col source-col & more-remappings] & body])}
  [cols & body]
  `(do-with-column-remappings
    ~(into {} (comp (map col-remappings-arg)
                    (partition-all 2))
           cols)
    (fn []
      ~@body)))

(defn find-free-port
  "Finds and returns an available port number on the current host. Does so by briefly creating a ServerSocket, which
  is closed when returning."
  []
  (with-open [socket (ServerSocket. 0)]
    (.getLocalPort socket)))

(defn do-with-env-keys-renamed-by
  "Evaluates the thunk with the current core.environ/env being redefined, its keys having been renamed by the given
  rename-fn. Prefer to use the with-env-keys-renamed-by macro version instead."
  [rename-fn thunk]
  (let [orig-e     env/env
        renames-fn (fn [m k _]
                     (let [k-str (name k)
                           new-k (rename-fn k-str)]
                       (if (not= k-str new-k)
                         (assoc m k (keyword new-k))
                         m)))
        renames    (reduce-kv renames-fn {} orig-e)
        new-e      (set/rename-keys orig-e renames)]
    (testing (colorize/blue (format "\nRenaming env vars by map: %s\n" (u/pprint-to-str renames)))
      (with-redefs [env/env new-e]
        (thunk)))))

(defmacro with-env-keys-renamed-by
  "Evaluates body with the current core.environ/env being redefined, its keys having been renamed by the given
  rename-fn."
  {:arglists '([rename-fn & body])}
  [rename-fn & body]
  `(do-with-env-keys-renamed-by ~rename-fn (fn [] ~@body)))

(defn do-with-temp-file
  "Impl for `with-temp-file` macro."
  [filename f]
  {:pre [(or (string? filename) (nil? filename))]}
  (let [filename (if (string? filename)
                   filename
                   (random-name))
        filename (str (u.files/get-path (System/getProperty "java.io.tmpdir") filename))]
    ;; delete file if it already exists
    (io/delete-file (io/file filename) :silently)
    (try
      (f filename)
      (finally
        (io/delete-file (io/file filename) :silently)))))

(defmacro with-temp-file
  "Execute `body` with newly created temporary file(s) in the system temporary directory. You may optionally specify the
  `filename` (without directory components) to be created in the temp directory; if `filename` is nil, a random
  filename will be used. The file will be deleted if it already exists, but will not be touched; use `spit` to load
  something in to it.

    ;; create a random temp filename. File is deleted if it already exists.
    (with-temp-file [filename]
      ...)

    ;; get a temp filename ending in `parrot-list.txt`
    (with-temp-file [filename \"parrot-list.txt\"]
      ...)"
  [[filename-binding filename-or-nil & more :as bindings] & body]
  {:pre [(vector? bindings) (>= (count bindings) 1)]}
  `(do-with-temp-file
    ~filename-or-nil
    (fn [~(vary-meta filename-binding assoc :tag `String)]
      ~@(if (seq more)
          [`(with-temp-file ~(vec more) ~@body)]
          body))))

(deftest with-temp-file-test
  (testing "random filename"
    (let [temp-filename (atom nil)]
      (with-temp-file [filename]
        (is (string? filename))
        (is (not (.exists (io/file filename))))
        (spit filename "wow")
        (reset! temp-filename filename))
      (testing "File should be deleted at end of macro form"
        (is (not (.exists (io/file @temp-filename)))))))

  (testing "explicit filename"
    (with-temp-file [filename "parrot-list.txt"]
      (is (string? filename))
      (is (not (.exists (io/file filename))))
      (is (str/ends-with? filename "parrot-list.txt"))
      (spit filename "wow")
      (testing "should delete existing file"
        (with-temp-file [filename "parrot-list.txt"]
          (is (not (.exists (io/file filename))))))))

  (testing "multiple bindings"
    (with-temp-file [filename nil, filename-2 "parrot-list.txt"]
      (is (string? filename))
      (is (string? filename-2))
      (is (not (.exists (io/file filename))))
      (is (not (.exists (io/file filename-2))))
      (is (not (str/ends-with? filename "parrot-list.txt")))
      (is (str/ends-with? filename-2 "parrot-list.txt"))))

  (testing "should delete existing file"
    (with-temp-file [filename "parrot-list.txt"]
      (spit filename "wow")
      (with-temp-file [filename "parrot-list.txt"]
        (is (not (.exists (io/file filename)))))))

  (testing "validation"
    (are [form] (thrown?
                 clojure.lang.Compiler$CompilerException
                 (macroexpand form))
      `(with-temp-file [])
      `(with-temp-file (+ 1 2)))))

(defn do-with-user-in-groups
  ([f groups-or-ids]
   (tt/with-temp User [user]
     (do-with-user-in-groups f user groups-or-ids)))
  ([f user [group-or-id & more]]
   (if group-or-id
     (tt/with-temp PermissionsGroupMembership [_ {:group_id (u/the-id group-or-id), :user_id (u/the-id user)}]
       (do-with-user-in-groups f user more))
     (f user))))

(defmacro with-user-in-groups
  "Create a User (and optionally PermissionsGroups), add user to a set of groups, and execute `body`.

    ;; create a new User, add to existing group `some-group`, execute body`
    (with-user-in-groups [user [some-group]]
      ...)

    ;; create a Group, then create a new User and add to new Group, then execute body
    (with-user-in-groups [new-group {:name \"My New Group\"}
                          user      [new-group]]
      ...)"
  {:arglists '([[group-binding-and-definition-pairs* user-binding groups-to-put-user-in?] & body]), :style/indent 1}
  [[& bindings] & body]
  (if (> (count bindings) 2)
    (let [[group-binding group-definition & more] bindings]
      `(tt/with-temp PermissionsGroup [~group-binding ~group-definition]
         (with-user-in-groups ~more ~@body)))
    (let [[user-binding groups-or-ids-to-put-user-in] bindings]
      `(do-with-user-in-groups (fn [~user-binding] ~@body) ~groups-or-ids-to-put-user-in))))

(defn secret-value-equals?
  "Checks whether a secret's `value` matches an `expected` value. If `expected` is a string, then the value's bytes are
  interpreted as a UTF-8 encoded string, then compared to `expected. Otherwise, the individual bytes of each are
  compared."
  {:added "0.42.0"}
  [expected ^bytes value]
  (cond (string? expected)
        (= expected (String. value "UTF-8"))

        (bytes? expected)
        (= (seq expected) (seq value))

        :else
        (throw (ex-info "expected parameter must be a string or bytes" {:expected expected :value value}))))

(defn select-keys-sequentially
  "`expected` is a vector of maps, and `actual` is a sequence of maps.  Maps a function over all items in `actual` that
  performs `select-keys` on the map at the equivalent index from `expected`.  Note the actual values of the maps in
  `expected` don't matter here, only the keys.

  Sample invocation:
  (select-keys-sequentially [{:a nil :b nil}
                             {:a nil :b nil}
                             {:b nil :x nil}] [{:a 1 :b 2}
                                               {:a 3 :b 4 :c 5 :d 6}
                                               {:b 7 :x 10 :y 11}])
  => ({:a 1, :b 2} {:a 3, :b 4} {:b 7, :x 10})

  This function can be used to help assert that certain (but not necessarily all) key/value pairs in a
  `connection-properties` vector match against some expected data."
  [expected actual]
  (cond (vector? expected)
    (map-indexed (fn [idx prop]
                   (reduce-kv (fn [acc k v]
                                (assoc acc k (if (map? v)
                                               (select-keys-sequentially (get (nth expected idx) k) v)
                                               v)))
                              {}
                              (select-keys prop (keys (nth expected idx)))))
                 actual)

    (map? expected)
    ;; recursive case (ex: to turn value that might be a flatland.ordered.map into a regular Clojure map)
    (select-keys actual (keys expected))

    :else
    actual))

(defn file->bytes
  "Reads a file at `file-path` completely into a byte array, returning that array."
  [^String file-path]
  (let [f   (File. file-path)
        ary (byte-array (.length f))]
    (with-open [is (FileInputStream. f)]
      (.read is ary)
      ary)))

(defn works-after
  "Returns a function which works as `f` except that on the first `n` calls an
  exception is thrown instead.

  If `n` is not positive, the returned function will not throw any exceptions
  not thrown by `f` itself."
  [n f]
  (let [a (atom n)]
    (fn [& args]
      (swap! a #(dec (max 0 %)))
      (if (neg? @a)
        (apply f args)
        (throw (ex-info "Not yet" {:remaining @a}))))))
