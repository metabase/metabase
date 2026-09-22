(ns metabase.driver.sql.test-util.unique-prefix
  "Tooling for testing Cloud-based SQL databases, creating unique schema names for every test run and 'garbage
  collecting' old ones. (Note that Athena and Databricks are Cloud-based DBs, but they don't use this because
  they don't support creating databases during CI, so this is only used by Redshift, Snowflake, and Bigquery.)

  In the past we had one shared prefix for everybody, and everybody was expected to play nice and not screw with it.
  This eventually led to BIG problems when one CI job would think see that a dataset did not exist, and try to
  recreate it, and then another CI job would do the same thing at the same time, and eventually we'd end up with a
  half-created dataset that was missing a bunch of rows. So here is the new strategy going forward:

  1. Static datasets don't use this; they get checksummed and prefixed with `sha_` and aren't subject to
     automated cleanup.

  2. Other datasets get their own prefix like `temp_<current-date-utc>_<hour>_<site-uuid>_` e.g. `transform-abc`
     becomes something like

         temp_2025_12_18_20_82e897cb_ad31_4c82_a4b6_3e9e2e1dc1cb_transform-abc

     This will prevent jobs from running at the same time from stomping on each other's work.

  3. To avoid filling our Snowflake/Redshift/etc. accounts up with ephemeral data that never gets deleted, we will
     delete datasets following this pattern when they are too old. This allows aggressive cleanup while
     still being safe for long-running test suites.

  4. Cleanup is done in the nightly `metabase.test.data.gc/gc-orphans!` job."
  (:require
   [clojure.string :as str]
   [clojure.test :refer :all]
   [java-time.api :as t]
   [metabase.system.core :as system]
   [metabase.test.initialize :as initialize]
   [metabase.util.date-2 :as u.date]))

(defn- utc-date-time
  "`LocalDateTime` in UTC time."
  []
  (t/local-date-time (t/instant) (t/zone-id "UTC")))

(defn- unique-prefix* [suffix & [local-dt]]
  ;; app DB has to be initialized to get settings
  (initialize/initialize-if-needed! :db)
  ;; Format: YYYY_MM_DD_HH_<site-uuid>_
  (let [local-date-time (or local-dt (utc-date-time))]
    (-> (format "temp_%s_%02d_%s_%s"
                (t/local-date local-date-time)
                (t/as local-date-time :hour-of-day)
                (system/site-uuid)
                suffix)
        (str/replace #"-" "_"))))

(def ^{:arglists '([suffix])} unique-prefix
  "Uniquely prefix the non-static dataset name to allow it to be GC'd later."
  (memoize unique-prefix*))

(defn- parse-name [dataset-name]
  (if-let [[_ year month day hour] (re-matches #"^temp_(\d{4})_(\d{2})_(\d{2})_(\d{2})_.*$" dataset-name)]
    (t/local-date-time (parse-long year) (parse-long month) (parse-long day) (parse-long hour) 0)
    false))

(defn old-temp-dataset?
  "Is this dataset name old enough to be deleted?

  For new-format names (with hour): more than `hours-threshold` hours old, defaulting to
  [[old-dataset-hours-threshold]]. Hour precision resolves conservatively, so a dataset goes between N and N+1 hours
  after creation, never before N.

  For old-format names (date only): more than 1 day old. Not parameterized -- those truncate to midnight, so an
  hours-based threshold could delete one stamped 23:00 out from under a running test.

  If the date/time is invalid, we return false (not old) to be safe - we only want to delete
  datasets that match our known format."
  [hours dataset-name]
  (try
    (if-let [dataset-date-time (parse-name dataset-name)]
      (t/before? (u.date/add dataset-date-time :hour 1)
                 ;; a name stamped 10 was created in [10:00, 11:00), so age from
                 ;; the end of the hour -- otherwise an N hour threshold collects
                 ;; things only N-1 hours old
                 (u.date/add (utc-date-time) :hour (- hours)))
      false)
    (catch Exception _)))

(deftest ^:parallel old-dataset-name?-test
  (testing "names - more than 3 hours old"
    (are [s] (old-temp-dataset? 3 s)
      ;; Ancient dates are old
      "temp_2023_02_01_00_82e897cb_ad31_4c82_a4b6_3e9e2e1dc1cb_test-data"
      "temp_2023_02_01_14_82e897cb_ad31_4c82_a4b6_3e9e2e1dc1cb_test-data"
      ;; 5 hours ago is old
      (unique-prefix* "test-data" (u.date/add (utc-date-time) :hour -5)))
    (are [s] (not (old-temp-dataset? 3 s))
      ;; Current time is not old
      (unique-prefix* "test-data")
      (unique-prefix* "test-data" (u.date/add (utc-date-time) :hour -1))
      (unique-prefix* "test-data" (u.date/add (utc-date-time) :hour -2))
      ;; 3 hours ago by hour is NOT old: the name records only the hour, so it may have been stamped as late as
      ;; :59 and be barely over 2 hours old. Collecting it here is what let a 2 hour threshold reach inside a
      ;; running driver job.
      (unique-prefix* "test-data" (u.date/add (utc-date-time) :hour -3))
      ;; Future dates are not old
      "2050_02_17_14_82e897cb_ad31_4c82_a4b6_3e9e2e1dc1cb_test-data"
      ;; invalid hour is not old - only delete datasets matching our known format
      "2023_02_01_25_82e897cb_ad31_4c82_a4b6_3e9e2e1dc1cb_test-data")))
