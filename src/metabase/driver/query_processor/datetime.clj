(ns metabase.driver.query-processor.datetime
  (:require [clojure.core.match :refer [match]]
            [metabase.util :as u])
  (:import clojure.lang.Keyword
           java.sql.Timestamp))

;;; # ------------------------------------------------------------ GENERAL ------------------------------------------------------------

(def ^:private ^:const units
  [:minute :hour :day :week :month :quarter :year])

(defn- unit? [v]
  (contains? (set units) (keyword v)))

(defn- unit<
  "Is X a smaller unit than Y? i.e., is this a valid pair of units for date extraction?

    (unit< :minute :hour) -> true
    (unit< :month :week)  -> false"
  [x y]
  (let [x (keyword x), y (keyword y)]
    (when (not= x y)
      (loop [[unit & more] units]
        (cond
          (= unit x) true
          (= unit y) false
          (seq more) (recur more))))))


;;; # ------------------------------------------------------------ VALUES ------------------------------------------------------------
;; ["datetime" relative-amount unit] | ["datetime" relative-amount smaller-unit "of" larger-unit]

(defn- relative-amount?
  "Is this something that can go in the `relative-amount` part of a datetime value?"
  [n]
  (or (integer? n)
      (= n "current")))

(defrecord DateTimeLiteral [^Timestamp value])

(defrecord DateTimeValue [^Integer relative-amount
                          ^Keyword cast-unit
                          ^Keyword extract-unit])

(defn parse-value [value]
  (match value
    ["datetime" (literal :guard u/date-string?)]
    (->DateTimeLiteral (u/parse-iso-8601 literal))

    ["datetime" (n :guard relative-amount?) (unit :guard unit?)]
    (map->DateTimeValue {:relative-amount (if (= n "current") 0 n)
                         :cast-unit       (keyword unit)})

    ["datetime" (n :guard relative-amount?) (smaller-unit :guard unit?) "of" (larger-unit :guard unit?)]
    (do
      (when-not (unit< smaller-unit larger-unit)
        (throw (Exception. (format "Invalid datetime: %s must be a smaller unit than %s." (name smaller-unit) (name larger-unit)))))
      (map->DateTimeValue {:relative-amount (if (= n "current") 0 n)
                           :extract-unit    (keyword smaller-unit)
                           :cast-unit       (keyword larger-unit)}))

    _ (throw (Exception. (format "Invalid datetime: %s" value)))))

(defn value?
  "Is V a valid datetime value?"
  [v]
  (boolean (match v
             ["datetime" & _] (parse-value v)
             _                false)))

;;; # ------------------------------------------------------------ FIELDS ------------------------------------------------------------

(def ^:private field-id? (u/runtime-resolved-fn 'metabase.driver.query-processor.expand 'field-id?))
(def ^:private ph        (u/runtime-resolved-fn 'metabase.driver.query-processor.expand 'ph))

(defrecord DateTimeField [field
                          ^Keyword cast-unit
                          ^Keyword extract-unit])

(defn parse-field [field]
  (match field
    ["datetime_field" (field-id :guard field-id?) "as" (unit :guard unit?)]
    (map->DateTimeField {:field     (ph field-id)
                         :cast-unit (keyword unit)})

    ["datetime_field" (field-id :guard field-id?) "as" (smaller-unit :guard unit?) "of" (larger-unit :guard unit?)]
    (map->DateTimeField {:field        (ph field-id)
                         :cast-unit    (keyword larger-unit)
                         :extract-unit (keyword smaller-unit)})

    _ (throw (Exception. (format "Invalid datetime field: %s" field)))))

(defn field? [field]
  (boolean (match field
             ["datetime_field" & _] (parse-field field)
             _                      false)))
