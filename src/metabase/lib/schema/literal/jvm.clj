(ns metabase.lib.schema.literal.jvm
  "JVM-specific literal definitions."
  (:require
   [metabase.lib.schema.expression :as expression]
   [metabase.util.malli.registry :as mr]))

(set! *warn-on-reflection* true)

(defn- instance-of [^Class klass]
  [:fn {:error/message (str "instance of " (.getName klass))}
   #(instance? klass %)])

(mr/def ::big-integer
  [:or
   (instance-of java.math.BigInteger)
   (instance-of clojure.lang.BigInt)])

(defmethod expression/type-of* java.math.BigInteger
  [_n]
  :type/BigInteger)

(defmethod expression/type-of* clojure.lang.BigInt
  [_n]
  :type/BigInteger)

(mr/def ::big-decimal
  (instance-of java.math.BigDecimal))

(defmethod expression/type-of* java.math.BigDecimal
  [_n]
  :type/Decimal)

(mr/def ::float
  (instance-of Float))

(defmethod expression/type-of* java.time.LocalDate
  [_t]
  :type/DateTime)

(defmethod expression/type-of* java.time.LocalTime
  [_t]
  :type/Time)

(defmethod expression/type-of* java.time.OffsetTime
  [_t]
  :type/TimeWithTZ)

(defmethod expression/type-of* java.time.LocalDateTime
  [_t]
  :type/DateTime)

(defmethod expression/type-of* java.time.OffsetDateTime
  [_t]
  :type/DateTimeWithZoneOffset)

(defmethod expression/type-of* java.time.ZonedDateTime
  [_t]
  :type/DateTimeWithZoneID)
