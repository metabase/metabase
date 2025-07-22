(ns metabase-enterprise.action-v2.coerce
  (:require
   [metabase.util.date-2 :as u.date])
  (:import
   (clojure.lang BigInt)
   (java.time LocalDateTime ZonedDateTime ZoneId)
   (java.time.format DateTimeFormatter)))

(set! *warn-on-reflection* true)

(defn- json-zdt->unix-millis ^long [s]
  (let [zdt->milli (fn [^ZonedDateTime zdt]
                     (-> zdt .toInstant .toEpochMilli))]
    (-> s u.date/parse zdt->milli)))

(defn- json-zdt->unix-seconds [s]
  (-> s json-zdt->unix-millis (quot 1000)))

(defn- json-zdt->unix-micros [s]
  (-> s json-zdt->unix-millis ^BigInt (* 1000N) .toBigInteger))

(defn- json-zdt->unix-nanos [s]
  (-> s json-zdt->unix-millis ^BigInt (* 1000000N) .toBigInteger))

(let [^DateTimeFormatter formatter (DateTimeFormatter/ofPattern "yyyyMMddHHmmss")
      format                       (fn [t]
                                     (.format ^DateTimeFormatter formatter t))]
  (defn- json-zdt->yyyymmddhhmmss [s]
    (-> s u.date/parse format))

  (defn- yyyymmddhhmmss->json-zdt
    [yyyymmddhhmmss]
    (-> (LocalDateTime/parse yyyymmddhhmmss formatter)
        (.atZone (ZoneId/of "UTC"))
        str)))

;; the date/time coercions are highly ambigious
;; in one direction one can make a decision (take the local date, or clock time)
;; but how do you reverse it?
;; Often the original SQL string might have been a full date, a zoned or unzoned ISO string,
;; Needs to be considered properly at some later time.
;; Idea: make the coercion dependent on previous database string, so if lossy - modify *just* the time, or the date component
;; * still somewhat ambiguous, e.g did the user *intend* to discard the previous date/time components?

(defn- json-zdt->date [s]
  (-> s ZonedDateTime/parse .toLocalDate str))

(defn- json-zdt->time [s]
  (-> s ZonedDateTime/parse .toLocalTime str))

(defn- millis->json-zdt
  [millis]
  (-> millis
      java.time.Instant/ofEpochMilli
      (java.time.ZonedDateTime/ofInstant (java.time.ZoneId/systemDefault))
      str))

(defn- unix-seconds->json-zdt
  [unix-seconds]
  (millis->json-zdt (* unix-seconds 1000)))

(defn- unix-millis->json-zdt
  [unix-millis]
  (millis->json-zdt unix-millis))

(defn- unix-micros->json-zdt
  [unix-micros]
  (millis->json-zdt (quot unix-micros 1000)))

(defn- unix-nanos->json-zdt
  [unix-nanos]
  (millis->json-zdt (quot unix-nanos 1000000)))

(defn- date->json-zdt
  [date]
  (-> date
      java.time.LocalDate/parse
      (.atStartOfDay (java.time.ZoneId/systemDefault))
      str))

(defn- time->json-zdt
  [time]
  (-> time
      java.time.LocalTime/parse
      (.atDate (java.time.LocalDate/now))
      (.atZone (java.time.ZoneId/systemDefault))
      str))

(def coercion-fns
  "Maps a coercion strategy to a map containing both input and output conversion functions.

  :in  - Function to convert from input JSON to database format
  :out - Function to convert from database format to JSON output

  Assumes the input/output values are valid for the coercion strategy and can fit within bounds."
  ;; TODO: missing (second (clojure.data/diff (into #{} (keys coercion-fns)) (descendants :Coercion/*)))
  ;;{:Coercion/Bytes->Temporal
  ;; :Coercion/UNIXTime->Temporal
  ;; :Coercion/String->Float
  ;; :Coercion/Number->Temporal
  ;; :Coercion/String->Number
  ;; :Coercion/YYYYMMDDHHMMSSBytes->Temporal
  ;; :Coercion/String->Temporal
  ;; :Coercion/ISO8601->Temporal}
  {:Coercion/UNIXSeconds->DateTime          {:in  #'json-zdt->unix-seconds
                                             :out #'unix-seconds->json-zdt}
   :Coercion/UNIXMilliSeconds->DateTime     {:in  #'json-zdt->unix-millis
                                             :out #'unix-millis->json-zdt}
   :Coercion/UNIXMicroSeconds->DateTime     {:in  #'json-zdt->unix-micros
                                             :out #'unix-micros->json-zdt}
   :Coercion/UNIXNanoSeconds->DateTime      {:in  #'json-zdt->unix-nanos
                                             :out #'unix-nanos->json-zdt}
   :Coercion/YYYYMMDDHHMMSSString->Temporal {:in  #'json-zdt->yyyymmddhhmmss
                                             :out #'yyyymmddhhmmss->json-zdt}
   :Coercion/ISO8601->DateTime              {:in  identity
                                             :out identity}
   :Coercion/ISO8601->Date                  {:in  #'json-zdt->date
                                             :out #'date->json-zdt}
   :Coercion/ISO8601->Time                  {:in  #'json-zdt->time
                                             :out #'time->json-zdt}})
