(ns metabase.test.data.dataset-definitions
  "Definitions of various datasets for use in tests with `data/dataset` and the like."
  (:require [java-time :as t]
            [medley.core :as m]
            [metabase.test.data.interface :as tx]
            [metabase.util.date-2 :as u.date])
  (:import java.sql.Time
           [java.time LocalDate LocalDateTime LocalTime OffsetDateTime OffsetTime ZonedDateTime]))

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                                Various Datasets                                                |
;;; +----------------------------------------------------------------------------------------------------------------+

;; You can get the values inside these dataset definitions like this:
;;
;;    (tx/get-dataset-definition test-data)

(tx/defdataset-edn test-data
  "The default \"Test Data\" dataset. Used in ~95% of tests. See `test-data.edn` for a overview of the tables and
  fields in this dataset.")

(tx/defdataset-edn sad-toucan-incidents
  "Times when the Toucan cried. Timestamps are UNIX timestamps in milliseconds.")

(tx/defdataset-edn tupac-sightings
  "Places, times, and circumstances where Tupac was sighted. Sighting timestamps are UNIX Timestamps in seconds.")

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

(defn- date-only
  "Convert date or datetime temporal value to `t` to an appropriate date type, discarding time information."
  [t]
  (when t
    (condp instance? t
      LocalDate      t
      LocalDateTime  (t/local-date t)
      LocalTime      (throw (Exception. "Cannot convert a time to a date"))
      OffsetTime     (throw (Exception. "Cannot convert a time to a date"))
      ;; since there is no `OffsetDate` class use `OffsetDateTime`, but truncated to day
      OffsetDateTime (u.date/truncate :day)
      ZonedDateTime  (u.date/truncate :day))))

(defn- time-only
  "Convert time or datetime temporal value to `t` to an appropriate time type, discarding date information."
  [t]
  (when t
    (condp instance? t
      LocalDate      (throw (Exception. "Cannot convert a date to a time"))
      LocalDateTime  (t/local-time t)
      LocalTime      t
      OffsetTime     t
      OffsetDateTime (t/offset-time t)
      ZonedDateTime  (t/offset-time t))))


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
         (fn [[date-field-def user-id-field-def venue-id-field-def]]
           [date-field-def
            (tx/map->FieldDefinition {:field-name "null_only_date", :base-type :type/Date})
            user-id-field-def
            venue-id-field-def])))
      :rows
      (fn [rows]
        (for [[date user-id venue-id] rows]
          [date nil user-id venue-id])))))

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
(tx/defdataset ^:private attempted-murders
  "A dataset for testing temporal values with and without timezones. Records of number of crow counts spoted and the
  date/time when they spotting occured in several different column types.

  No Database we support supports all of these different types, so the expectation is that we'll use the closest
  equivalent for each column."
  [["attempts"
    [{:field-name "date",           :base-type :type/Date}
     {:field-name "datetime",       :base-type :type/DateTime}
     {:field-name "datetime_ltz",   :base-type :type/DateTimeWithLocalTZ}
     {:field-name "datetime_tz",    :base-type :type/DateTimeWithZoneOffset}
     {:field-name "datetime_tz_id", :base-type :type/DateTimeWithZoneID}
     {:field-name "time",           :base-type :type/Time}
     {:field-name "time_ltz",       :base-type :type/TimeWithLocalTZ}
     {:field-name "time_tz",        :base-type :type/TimeWithZoneOffset}
     {:field-name "num_crows",      :base-type :type/Integer}]
    (for [[cnt t] [[6 #t "2019-11-01T00:23:18.331-07:00[America/Los_Angeles]"]
                   [8 #t "2019-11-02T00:14:14.246-07:00[America/Los_Angeles]"]
                   [6 #t "2019-11-03T23:35:17.906-08:00[America/Los_Angeles]"]
                   [7 #t "2019-11-04T01:04:09.593-08:00[America/Los_Angeles]"]
                   [8 #t "2019-11-05T14:23:46.411-08:00[America/Los_Angeles]"]
                   [4 #t "2019-11-06T18:51:16.270-08:00[America/Los_Angeles]"]
                   [6 #t "2019-11-07T02:45:34.443-08:00[America/Los_Angeles]"]
                   [4 #t "2019-11-08T19:51:39.753-08:00[America/Los_Angeles]"]
                   [3 #t "2019-11-09T09:59:10.483-08:00[America/Los_Angeles]"]
                   [1 #t "2019-11-10T08:41:35.860-08:00[America/Los_Angeles]"]
                   [5 #t "2019-11-11T08:09:08.892-08:00[America/Los_Angeles]"]
                   [3 #t "2019-11-12T07:36:16.088-08:00[America/Los_Angeles]"]
                   [2 #t "2019-11-13T04:28:40.489-08:00[America/Los_Angeles]"]
                   [9 #t "2019-11-14T09:52:17.242-08:00[America/Los_Angeles]"]
                   [7 #t "2019-11-15T16:07:25.292-08:00[America/Los_Angeles]"]
                   [7 #t "2019-11-16T13:32:16.936-08:00[America/Los_Angeles]"]
                   [1 #t "2019-11-17T14:11:38.076-08:00[America/Los_Angeles]"]
                   [3 #t "2019-11-18T20:47:27.902-08:00[America/Los_Angeles]"]
                   [5 #t "2019-11-19T00:35:23.146-08:00[America/Los_Angeles]"]
                   [1 #t "2019-11-20T20:09:55.752-08:00[America/Los_Angeles]"]]]
      [(t/local-date t)                 ; date
       (t/local-date-time t)            ; datetime
       (t/offset-date-time t)           ; datetime-ltz
       (t/offset-date-time t)           ; datetime-tz
       t                                ; datetime-tz-id
       (t/local-time t)                 ; time
       (t/offset-time t)                ; time-ltz
       (t/offset-time t)                ; time-tz
       cnt                              ; num-crows
       ])]])
