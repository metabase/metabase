(ns metabase.test.data.dataset-definitions
  "Definitions of various datasets for use in tests with `with-temp-db`."
  (:require [clojure.tools.reader.edn :as edn]
            [metabase.test.data.interface :as di]
            [metabase.util.date :as du])
  (:import java.sql.Time
           java.util.Calendar))

;; ## Datasets

;; The O.G. "Test Database" dataset
(di/def-database-definition-edn test-data)

;; Times when the Toucan cried
(di/def-database-definition-edn sad-toucan-incidents)

;; Places, times, and circumstances where Tupac was sighted
(di/def-database-definition-edn tupac-sightings)

(di/def-database-definition-edn geographical-tips)

;; A very tiny dataset with a list of places and a booleans
(di/def-database-definition-edn places-cam-likes)

;; A small dataset with users and a set of messages between them. Each message has *2* foreign keys to user --
;; sender and reciever -- allowing us to test situations where multiple joins for a *single* table should occur.
(di/def-database-definition-edn avian-singles)

(defn- date-only
  "This function emulates a date only field as it would come from the
  JDBC driver. The hour/minute/second/millisecond fields should be 0s"
  [date]
  (let [orig-cal (doto (Calendar/getInstance)
                   (.setTime date))]
    (-> (doto (Calendar/getInstance)
          (.clear)
          (.set Calendar/YEAR (.get orig-cal Calendar/YEAR))
          (.set Calendar/MONTH (.get orig-cal Calendar/MONTH))
          (.set Calendar/DAY_OF_MONTH (.get orig-cal Calendar/DAY_OF_MONTH)))
        .getTime)))

(defn- time-only
  "This function will return a java.sql.Time object. To create a Time
  object similar to what JDBC would return, the time needs to be
  relative to epoch. As an example a time of 4:30 would be a Time
  instance, but it's a subclass of Date, so it looks like
  1970-01-01T04:30:00.000"
  [date]
  (let [orig-cal (doto (Calendar/getInstance)
                   (.setTime date))]
    (-> (doto (Calendar/getInstance)
          (.clear)
          (.set Calendar/HOUR_OF_DAY (.get orig-cal Calendar/HOUR_OF_DAY))
          (.set Calendar/MINUTE (.get orig-cal Calendar/MINUTE))
          (.set Calendar/SECOND (.get orig-cal Calendar/SECOND)))
        .getTimeInMillis
        Time.)))

(di/def-database-definition test-data-with-time
  (di/update-table-def "users"
                       (fn [table-def]
                         [(first table-def)
                          {:field-name "last_login_date", :base-type :type/Date}
                          {:field-name "last_login_time", :base-type :type/Time}
                          (peek table-def)])
                       (fn [rows]
                         (mapv (fn [[username last-login password-text]]
                                 [username (date-only last-login) (time-only last-login) password-text])
                               rows))
                       (for [[table-name :as orig-def] (di/slurp-edn-table-def "test-data")
                             :when (= table-name "users")]
                         orig-def)))

(di/def-database-definition test-data-with-null-date-checkins
  (di/update-table-def "checkins"
                       #(vec (concat % [{:field-name "null_only_date" :base-type :type/Date}]))
                       (fn [rows]
                         (mapv #(conj % nil) rows))
                       (di/slurp-edn-table-def "test-data")))

(di/def-database-definition test-data-with-timezones
  (di/update-table-def "users"
                       (fn [table-def]
                         [(first table-def)
                          {:field-name "last_login", :base-type :type/DateTimeWithTZ}
                          (peek table-def)])
                       identity
                       (di/slurp-edn-table-def "test-data")))

(def test-data-map
  "Converts data from `test-data` to a map of maps like the following:

   {<table-name> [{<field-name> <field value> ...}]."
  (reduce (fn [acc {:keys [table-name field-definitions rows]}]
            (let [field-names (mapv :field-name field-definitions)]
              (assoc acc table-name
                     (for [row rows]
                       (zipmap field-names row)))))
          {} (:table-definitions test-data)))

(defn field-values
  "Returns the field values for the given `TABLE` and `COLUMN` found
  in the data-map `M`."
  [m table column]
  (mapv #(get % column) (get m table)))
