(ns metabase.lib.schema.literal.jvm
  "JVM-specific literal definitions."
  (:require
   [metabase.lib.schema.common :as common]
   [metabase.lib.schema.expression :as expression]
   [metabase.util.malli.registry :as mr]))

(set! *warn-on-reflection* true)

(mr/def ::big-integer
  (common/instance-of-class java.math.BigInteger clojure.lang.BigInt))

(defmethod expression/type-of-method java.math.BigInteger
  [_n]
  :type/BigInteger)

(defmethod expression/type-of-method clojure.lang.BigInt
  [_n]
  :type/BigInteger)

(mr/def ::big-decimal
  (common/instance-of-class java.math.BigDecimal))

(defmethod expression/type-of-method java.math.BigDecimal
  [_n]
  :type/Decimal)

(mr/def ::float
  (common/instance-of-class Float))

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
