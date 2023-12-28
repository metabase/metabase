(ns metabase.driver.sql.test-util.unique-prefix
  "Tooling for testing Cloud-based SQL databases, creating unique schema names for every test run and 'garbage
  collecting' old ones.

  In the past we had one shared prefix for everybody, and everybody was expected to play nice and not screw with it.
  This eventually led to BIG problems when one CI job would think see that a dataset did not exist, and try to
  recreate it, and then another CI job would do the same thing at the same time, and eventually we'd end up with a
  half-created dataset that was missing a bunch of rows. So here is the new strategy going forward:

  1. Every instance of Metabase gets their own prefix like `<current-date-utc>_<site-uuid>_` e.g. `test-data` becomes
     something like

         2023_02_17_82e897cb_ad31_4c82_a4b6_3e9e2e1dc1cb_test-data

     This will prevent jobs from running at the same time from stomping on each other's work.

  2. To avoid filling our Snowflake/Redshift/etc. accounts up with ephemeral data that never gets deleted, we will
     delete datasets following this pattern when they are two days old or older. E.g. if it is currently `2023-02-17` in
     UTC then we can delete anything dataset starts with `2023_02_15` or older. This is done once the first time we
     create a test dataset in this process, i.e. done in [[metabase.test.data.interface/before-run]].
     See [[metabase.test.data.snowflake/delete-old-datasets-if-needed!]] for example.

  See this Slack thread for more info
  https://metaboat.slack.com/archives/CKZEMT1MJ/p1676659086280609?thread_ts=1676656964.624609&cid=CKZEMT1MJ or ask
  me (Cam) if you have any questions."
  (:require
   [clojure.string :as str]
   [clojure.test :refer :all]
   [java-time.api :as t]
   [metabase.public-settings :as public-settings]
   [metabase.util.date-2 :as u.date]))

(defn- utc-date
  "`LocalDate` in UTC time."
  []
  (t/local-date (u.date/with-time-zone-same-instant (t/zoned-date-time) "UTC")))

(defn- unique-prefix*
  ([]
   (unique-prefix* (utc-date)))
  ([local-date]
   {:pre [(instance? java.time.LocalDate local-date)]}
   (-> (format "%s_%s_" local-date (public-settings/site-uuid))
       (str/replace  #"-" "_"))))

(def ^{:arglists '([])} unique-prefix
  "Unique prefix for test datasets for this instance. Format is `<current-date-utc>_<site-uuid>_`. See comments above.
  Example:

    2023_02_17_82e897cb_ad31_4c82_a4b6_3e9e2e1dc1cb_"
  (memoize unique-prefix*))

(defn old-dataset-name?
  "Is this dataset name prefixed by a date two days ago or older?

  If the date is invalid e.g. `2023-02-31` then we'll count it as old so it will get deleted anyway."
  [dataset-name]
  (when-let [[_ year month day] (re-matches #"^(\d{4})_(\d{2})_(\d{2}).*$" dataset-name)]
    (let [dataset-date (try
                         (t/local-date (parse-long year) (parse-long month) (parse-long day))
                         (catch Throwable _
                           nil))]
      (if-not dataset-date
        true
        (t/before? dataset-date (u.date/add (utc-date) :day -1))))))

(deftest ^:parallel old-dataset-name?-test
  (are [s] (old-dataset-name? s)
    "2023_02_01_82e897cb_ad31_4c82_a4b6_3e9e2e1dc1cb_test-data"
    "2023_01_17_82e897cb_ad31_4c82_a4b6_3e9e2e1dc1cb_test-data"
    "2022_02_17_82e897cb_ad31_4c82_a4b6_3e9e2e1dc1cb_test-data"
    (str (unique-prefix* (u.date/add (utc-date) :day -2)) "test-data")
    ;; if the date is invalid we should just treat it as old and delete it.
    "2022_00_00_82e897cb_ad31_4c82_a4b6_3e9e2e1dc1cb_test-data"
    "2022_13_01_82e897cb_ad31_4c82_a4b6_3e9e2e1dc1cb_test-data"
    "2022_02_31_82e897cb_ad31_4c82_a4b6_3e9e2e1dc1cb_test-data")
  (are [s] (not (old-dataset-name? s))
    "2050_02_17_82e897cb_ad31_4c82_a4b6_3e9e2e1dc1cb_test-data"
    "v4_test-data"
    (str (unique-prefix*) "test-data")
    (str (unique-prefix* (u.date/add (utc-date) :day -1)) "test-data")))
