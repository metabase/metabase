(ns metabase-enterprise.data-editing.coerce
  (:import
   (clojure.lang BigInt)
   (java.time ZonedDateTime)
   (java.time.format DateTimeFormatter)))

(set! *warn-on-reflection* true)

(defn- json-zdt->unix-millis ^long [s]
  (-> s ZonedDateTime/parse .toInstant .toEpochMilli))

(defn- json-zdt->unix-seconds [s]
  (-> s json-zdt->unix-millis (quot 1000)))

(defn- json-zdt->unix-micros [s]
  (-> s json-zdt->unix-millis ^BigInt (* 1000N) .toBigInteger))

(defn- json-zdt->unix-nanos [s]
  (-> s json-zdt->unix-millis ^BigInt (* 1000000N) .toBigInteger))

(let [formatter (DateTimeFormatter/ofPattern "yyyyMMddHHmmSS")]
  (defn- json-zdt->yyyymmddhhmmss [s]
    (-> s ZonedDateTime/parse (.format formatter))))

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

(def input-coercion-fn
  "Maps a coercion strategy to a function from input JSON object to the action representation (to be supplied to JDBC).

  Assumes the input JSON object is valid for the coercion strategy, and can fit within the bounds of the target column."
  {:Coercion/UNIXSeconds->DateTime          #'json-zdt->unix-seconds
   :Coercion/UNIXMilliSeconds->DateTime     #'json-zdt->unix-millis
   :Coercion/UNIXMicroSeconds->DateTime     #'json-zdt->unix-micros
   :Coercion/UNIXNanoSeconds->DateTime      #'json-zdt->unix-nanos
   :Coercion/YYYYMMDDHHMMSSString->Temporal #'json-zdt->yyyymmddhhmmss
   :Coercion/ISO8601->DateTime              identity
   :Coercion/ISO8601->Date                  #'json-zdt->date
   :Coercion/ISO8601->Time                  #'json-zdt->time})
