(ns metabase.lib.schema.literal.jvm
  "JVM-specific literal definitions."
  (:require
   [clojure.string :as str]
   [metabase.lib.schema.expression :as expression]
   [metabase.util.malli.registry :as mr]))

(set! *warn-on-reflection* true)

(defn instance-of
  "Convenience for defining a Malli schema for an instance of a particular Class."
  [& classes]
  [:fn {:error/message (str "instance of "
                            (str/join " or "
                                      (map #(.getName ^Class %) classes)))}
   (fn [x]
     (some (fn [klass]
             (instance? klass x))
           classes))])

(mr/def ::big-integer
  (instance-of java.math.BigInteger clojure.lang.BigInt))

(defmethod expression/type-of-method java.math.BigInteger
  [_n]
  :type/BigInteger)

(defmethod expression/type-of-method clojure.lang.BigInt
  [_n]
  :type/BigInteger)

(mr/def ::big-decimal
  (instance-of java.math.BigDecimal))

(defmethod expression/type-of-method java.math.BigDecimal
  [_n]
  :type/Decimal)

(mr/def ::float
  (instance-of Float))

(defmethod expression/type-of-method java.time.LocalDate
  [_t]
  :type/DateTime)

(defmethod expression/type-of-method java.time.LocalTime
  [_t]
  :type/Time)

(defmethod expression/type-of-method java.time.OffsetTime
  [_t]
  :type/TimeWithTZ)

(defmethod expression/type-of-method java.time.LocalDateTime
  [_t]
  :type/DateTime)

(defmethod expression/type-of-method java.time.OffsetDateTime
  [_t]
  :type/DateTimeWithZoneOffset)

(defmethod expression/type-of-method java.time.ZonedDateTime
  [_t]
  :type/DateTimeWithZoneID)
