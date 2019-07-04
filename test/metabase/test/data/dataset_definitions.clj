(ns metabase.test.data.dataset-definitions
  "Definitions of various datasets for use in tests with `data/dataset` and the like."
  (:require [medley.core :as m]
            [metabase.test.data.interface :as tx])
  (:import java.sql.Time
           [java.util Calendar TimeZone]))

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                                Various Datasets                                                |
;;; +----------------------------------------------------------------------------------------------------------------+

(tx/defdataset-edn test-data
  "The O.G. \"Test Database\" dataset.")

 (tx/defdataset-edn sad-toucan-incidents
   "Times when the Toucan cried")

(tx/defdataset-edn tupac-sightings
  "Places, times, and circumstances where Tupac was sighted. Sighting timestamps are UNIX Timestamps in seconds")

(tx/defdataset-edn geographical-tips
  "Dataset with nested columns, for testing a MongoDB-style database")

(tx/defdataset-edn places-cam-likes
  "A very tiny dataset with a list of places and a booleans")

(tx/defdataset-edn avian-singles
  "A small dataset with users and a set of messages between them. Each message has *2* foreign keys to user -- sender
  and receiver -- allowing us to test situations where multiple joins for a *single* table should occur.")

(tx/defdataset-edn daily-bird-counts
  "A small dataset that includes an integer column with some NULL and ZERO values, meant for testing things like
  expressions to make sure they behave correctly.

  As an added bonus this dataset has a table with a name in a slash in it, so the driver will need to support that
  correctly in order for this to work!")

(tx/defdataset-edn office-checkins
  "A small dataset that includes TIMESTAMP dates. People who stopped by the Metabase office and the time they did so.")

(tx/defdataset-edn bird-flocks
  "A small dataset with birds and the flocks they belong to (a many-to-one relationship). Some birds belong to no
  flocks, and one flock has no birds, so this is useful for testing behavior of various types of joins. (`flock_id` is
  not explicitly marked as a foreign key, because the test dataset syntax does not yet have a way to support nullable
  foreign keys.)")


(defn- calendar-with-fields ^Calendar [date & fields]
  (let [^Calendar cal-from-date  (doto (Calendar/getInstance (TimeZone/getTimeZone "UTC"))
                                   (.setTime date))
        ^Calendar blank-calendar (doto ^Calendar (.clone cal-from-date)
                                   .clear)]
    (doseq [field fields]
      (.set blank-calendar field (.get cal-from-date field)))
    blank-calendar))

(defn- date-only
  "This function emulates a date only field as it would come from the JDBC driver. The hour/minute/second/millisecond
  fields should be 0s"
  [date]
  (.getTime (calendar-with-fields date Calendar/DAY_OF_MONTH Calendar/MONTH Calendar/YEAR)))

(defn- time-only
  "This function will return a java.sql.Time object. To create a Time object similar to what JDBC would return, the time
  needs to be relative to epoch. As an example a time of 4:30 would be a Time instance, but it's a subclass of Date,
  so it looks like 1970-01-01T04:30:00.000"
  [date]
  (Time. (.getTimeInMillis (calendar-with-fields date Calendar/HOUR_OF_DAY Calendar/MINUTE Calendar/SECOND))))


(defonce ^{:doc "The main `test-data` dataset, but only the `users` table, and with `last_login_date` and
  `last_login_time` instead of `last_login`."}
  test-data-with-time
  (tx/transformed-dataset-definition "test-data-with-time" test-data
    (tx/transform-dataset-only-tables "users")
    (tx/transform-dataset-update-table "users"
      :table
      (fn [tabledef]
        (update
         tabledef
         :field-definitions
         (fn [[name-field-def _ password-field-def]]
           [name-field-def
            (tx/map->FieldDefinition {:field-name "last_login_date", :base-type :type/Date})
            (tx/map->FieldDefinition {:field-name "last_login_time", :base-type :type/Time})
            password-field-def])))
      :rows
      (fn [rows]
        (for [[username last-login password-text] rows]
          [username (date-only last-login) (time-only last-login) password-text])))))

(defonce ^{:doc "The main `test-data` dataset, with an additional (all-null) `null_only_date` Field."}
  test-data-with-null-date-checkins
  (tx/transformed-dataset-definition "test-data-with-null-date-checkins" test-data
    (tx/transform-dataset-update-table "checkins"
      :table
      (fn [tabledef]
        (update
         tabledef
         :field-definitions
         concat
         [(tx/map->FieldDefinition {:field-name "null_only_date" :base-type :type/Date})]))
      :rows
      (fn [rows]
        (for [row rows]
          (concat row [nil]))))))

(defonce ^{:doc "The main `test-data` dataset, but `last_login` has a base type of `:type/DateTimeWithTZ`."}
  test-data-with-timezones
  (tx/transformed-dataset-definition "test-data-with-timezones" test-data
    (tx/transform-dataset-update-table "users"
      :table
      (fn [tabledef]
        (update
         tabledef
         :field-definitions
         (fn [[name-field-def _ password-field-def]]
           [name-field-def
            (tx/map->FieldDefinition {:field-name "last_login", :base-type :type/DateTimeWithTZ})
            password-field-def]))))))

(defonce ^{:doc "The usual `test-data` dataset, but only the `users` table; adds a `created_by` column to the users
  table that is self referencing."}
  test-data-self-referencing-user
  (tx/transformed-dataset-definition "test-data-self-referencing-user" test-data
    (tx/transform-dataset-only-tables "users")
    (tx/transform-dataset-update-table "users"
      :table
      (fn [tabledef]
        (update tabledef :field-definitions concat [(tx/map->FieldDefinition
                                                     {:field-name "created_by", :base-type :type/Integer, :fk :users})]))
      ;; created_by = user.id - 1, except for User 1, who was created by himself (?)
      :rows
      (fn [rows]
        (for [[idx [username last-login password-text]] (m/indexed rows)]
          [username last-login password-text (if (zero? idx)
                                               1
                                               idx)])))))
