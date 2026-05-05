(ns metabase.driver.sql.test-util.unique-prefix
  "Tooling for testing Cloud-based SQL databases, creating unique schema names for every test run and 'garbage
  collecting' old ones.

  In the past we had one shared prefix for everybody, and everybody was expected to play nice and not screw with it.
  This eventually led to BIG problems when one CI job would think see that a dataset did not exist, and try to
  recreate it, and then another CI job would do the same thing at the same time, and eventually we'd end up with a
  half-created dataset that was missing a bunch of rows. So here is the new strategy going forward:

  1. Every instance of Metabase gets their own prefix like `<current-date-utc>_<hour>_<site-uuid>_` e.g. `test-data`
     becomes something like

         2025_12_18_20_82e897cb_ad31_4c82_a4b6_3e9e2e1dc1cb_test-data

     This will prevent jobs from running at the same time from stomping on each other's work.

  2. To avoid filling our Snowflake/Redshift/etc. accounts up with ephemeral data that never gets deleted, we will
     delete datasets following this pattern when they are more than 3 hours old. This allows aggressive cleanup while
     still being safe for long-running test suites. Old-format datasets (without hour) are deleted after more than 1
     day for backwards compatibility. Cleanup is done once the first time we create a test dataset in this process,
     i.e. done in [[metabase.test.data.interface/before-run]].
     See [[metabase.test.data.snowflake/delete-old-datasets-if-needed!]] for example.

  See this Slack thread for more info
  https://metaboat.slack.com/archives/CKZEMT1MJ/p1676659086280609?thread_ts=1676656964.624609&cid=CKZEMT1MJ or ask
  me (Cam) if you have any questions."
  (:require
   [clojure.string :as str]
   [clojure.test :refer :all]
   [java-time.api :as t]
   [metabase.system.core :as system]
   [metabase.test.initialize :as initialize]
   [metabase.util.date-2 :as u.date]))

(defn- utc-date
  "`LocalDate` in UTC time."
  []
  (t/local-date (t/instant) (t/zone-id "UTC")))

(defn- utc-date-time
  "`LocalDateTime` in UTC time."
  []
  (t/local-date-time (t/instant) (t/zone-id "UTC")))

(defn- unique-prefix*
  ([]
   (unique-prefix* (utc-date-time)))
  ([local-date-time]
   {:pre [(instance? java.time.LocalDateTime local-date-time)]}
   ;; app DB has to be initialized to get settings
   (initialize/initialize-if-needed! :db)
   ;; Format: YYYY_MM_DD_HH_<site-uuid>_ (hour precision allows cleanup after ~3 hours)
   (-> (format "%s_%02d_%s_"
               (t/local-date local-date-time)
               (t/as local-date-time :hour-of-day)
               (system/site-uuid))
       (str/replace #"-" "_"))))

(def ^{:arglists '([])} unique-prefix
  "Unique prefix for test datasets for this instance. Format is `<current-date-utc>_<hour-utc>_<site-uuid>_`. See comments above.
  Example:

    2025_12_18_20_82e897cb_ad31_4c82_a4b6_3e9e2e1dc1cb_"
  (memoize unique-prefix*))

(def ^:private old-dataset-hours-threshold
  "Number of hours after which a dataset is considered old and can be deleted. Because schema names only include the
  hour (not minutes/seconds), actual deletion can occur anywhere from N to N+1 hours after creation. Set this high
  enough that any running test won't have its schema deleted mid-run."
  3)

(defn old-dataset-name?
  "Is this dataset name old enough to be deleted?

  For new-format names (with hour): checks if more than [[old-dataset-hours-threshold]] hours old.
  For old-format names (date only): checks if more than 1 day old for backwards compatibility.
  If the date/time is invalid, we return false (not old) to be safe - we only want to delete
  datasets that match our known format."
  [dataset-name]
  ;; Try new format first: YYYY_MM_DD_HH_<uuid>_...
  (if-let [[_ year month day hour] (re-matches #"^(\d{4})_(\d{2})_(\d{2})_(\d{2})_.*$" dataset-name)]
    (let [dataset-date-time (try
                              (t/local-date-time (parse-long year) (parse-long month) (parse-long day) (parse-long hour) 0)
                              (catch Throwable _ nil))]
      (if-not dataset-date-time
        false
        (t/before? dataset-date-time (u.date/add (utc-date-time) :hour (- old-dataset-hours-threshold)))))
    ;; TODO (bryan 12-23-25) Remove old-format checks when this has been running for a few days.
    ;; Fall back to old format: YYYY_MM_DD_<uuid>_...
    (when-let [[_ year month day] (re-matches #"^(\d{4})_(\d{2})_(\d{2})_.*$" dataset-name)]
      (let [dataset-date (try
                           (t/local-date (parse-long year) (parse-long month) (parse-long day))
                           (catch Throwable _ nil))]
        (if-not dataset-date
          false
          (t/before? dataset-date (u.date/add (utc-date) :day -1)))))))

(deftest ^:parallel old-dataset-name?-test
  (testing "old-format names (date only) - more than 1 day old"
    (let [two-days-ago (str/replace (str (u.date/add (utc-date) :day -2)) "-" "_")
          yesterday (str/replace (str (u.date/add (utc-date) :day -1)) "-" "_")
          today (str/replace (str (utc-date)) "-" "_")]
      (are [s] (old-dataset-name? s)
        "2023_02_01_82e897cb_ad31_4c82_a4b6_3e9e2e1dc1cb_test-data"
        "2023_01_17_82e897cb_ad31_4c82_a4b6_3e9e2e1dc1cb_test-data"
        "2022_02_17_82e897cb_ad31_4c82_a4b6_3e9e2e1dc1cb_test-data"
        ;; 2 days ago is old
        (str two-days-ago "_82e897cb_ad31_4c82_a4b6_3e9e2e1dc1cb_test-data"))
      (are [s] (not (old-dataset-name? s))
        "2050_02_17_82e897cb_ad31_4c82_a4b6_3e9e2e1dc1cb_test-data"
        "v4_test-data"
        ;; yesterday is not old (must be MORE than 1 day)
        (str yesterday "_82e897cb_ad31_4c82_a4b6_3e9e2e1dc1cb_test-data")
        ;; today is not old
        (str today "_82e897cb_ad31_4c82_a4b6_3e9e2e1dc1cb_test-data")
        ;; invalid dates are not old - only delete datasets matching our known format
        "2022_00_00_82e897cb_ad31_4c82_a4b6_3e9e2e1dc1cb_test-data"
        "2022_13_01_82e897cb_ad31_4c82_a4b6_3e9e2e1dc1cb_test-data"
        "2022_02_31_82e897cb_ad31_4c82_a4b6_3e9e2e1dc1cb_test-data")))
  (testing "new-format names (with hour) - more than 3 hours old"
    (are [s] (old-dataset-name? s)
      ;; Ancient dates are old
      "2023_02_01_00_82e897cb_ad31_4c82_a4b6_3e9e2e1dc1cb_test-data"
      "2023_02_01_14_82e897cb_ad31_4c82_a4b6_3e9e2e1dc1cb_test-data"
      ;; 4 hours ago is old
      (str (unique-prefix* (u.date/add (utc-date-time) :hour -4)) "test-data")
      ;; 3 hours ago by hour is old (due to hour truncation, could be up to 3:59 hours old)
      (str (unique-prefix* (u.date/add (utc-date-time) :hour -3)) "test-data"))
    (are [s] (not (old-dataset-name? s))
      ;; Current time is not old
      (str (unique-prefix*) "test-data")
      ;; 1 hour ago is not old
      (str (unique-prefix* (u.date/add (utc-date-time) :hour -1)) "test-data")
      ;; 2 hours ago is not old
      (str (unique-prefix* (u.date/add (utc-date-time) :hour -2)) "test-data")
      ;; Future dates are not old
      "2050_02_17_14_82e897cb_ad31_4c82_a4b6_3e9e2e1dc1cb_test-data"
      ;; invalid hour is not old - only delete datasets matching our known format
      "2023_02_01_25_82e897cb_ad31_4c82_a4b6_3e9e2e1dc1cb_test-data")))
