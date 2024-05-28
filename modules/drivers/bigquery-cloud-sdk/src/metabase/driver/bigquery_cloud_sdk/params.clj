(ns metabase.driver.bigquery-cloud-sdk.params
  (:require
   [java-time.api :as t]
   [metabase.util.date-2 :as u.date]
   [metabase.util.log :as log])
  (:import
   (com.google.cloud.bigquery QueryJobConfiguration$Builder QueryParameterValue StandardSQLTypeName)))

(set! *warn-on-reflection* true)

(defn- param ^QueryParameterValue [type-name v]
  (.build (doto (QueryParameterValue/newBuilder)
            (.setType (StandardSQLTypeName/valueOf type-name))
            (.setValue (some-> v str)))))

(defmulti ^:private ->QueryParameterValue
  {:arglists '(^QueryParameterValue [v])}
  class)

(defmethod ->QueryParameterValue :default
  [v]
  (param "STRING" v))

;; See https://cloud.google.com/spanner/docs/data-types for type mappings

;; `nil` still has to be given a type (this determines the type it comes back as in cases like `["SELECT ?" nil]`) --
;; AFAIK this only affects native queries because `NULL` is usually spliced into the compiled SQL directly in MBQL
;; queries. Unfortunately we don't know the actual type we should set here so `STRING` is going to have to do for now.
;; This shouldn't really matter anyways since `WHERE field = NULL` generally doesn't work (we have to do `WHERE FIELD
;; IS NULL` instead)
(defmethod ->QueryParameterValue nil
  [_]
  (param "STRING" nil))

(defmethod ->QueryParameterValue String               [v] (param "STRING" v))
(defmethod ->QueryParameterValue Boolean              [v] (param "BOOL" v))
(defmethod ->QueryParameterValue Integer              [v] (param "INT64" v))
(defmethod ->QueryParameterValue Long                 [v] (param "INT64" v))
(defmethod ->QueryParameterValue Short                [v] (param "INT64" v))
(defmethod ->QueryParameterValue Byte                 [v] (param "INT64" v))
(defmethod ->QueryParameterValue clojure.lang.BigInt  [v] (param "INT64" v))
(defmethod ->QueryParameterValue Float                [v] (param "FLOAT64" v))
(defmethod ->QueryParameterValue Double               [v] (param "FLOAT64" v))

;; use the min and max values for the NUMERIC types to figure out if we need to set decimal params as NUMERIC
;; or BIGNUMERIC
(def ^:private ^:const ^BigDecimal max-bq-numeric-val (bigdec "9.9999999999999999999999999999999999999E+28"))
(def ^:private ^:const ^BigDecimal min-bq-numeric-val (.negate max-bq-numeric-val))

(defmethod ->QueryParameterValue java.math.BigDecimal [^BigDecimal v]
  (if (or (and (pos? (.signum v))
               (pos? (.compareTo v min-bq-numeric-val)))
          (and (neg? (.signum v))
               (neg? (.compareTo v max-bq-numeric-val))))
    (param "BIGNUMERIC" v)
    (param "NUMERIC" v)))

(defmethod ->QueryParameterValue java.time.LocalDate      [t] (param "DATE" (u.date/format t)))
(defmethod ->QueryParameterValue java.time.LocalDateTime  [t] (param "DATETIME" (u.date/format t)))
(defmethod ->QueryParameterValue java.time.LocalTime      [t] (param "TIME" (u.date/format t)))
(defmethod ->QueryParameterValue java.time.OffsetTime     [t] (param "TIME" (->> (t/zone-offset 0)
                                                                                 (t/with-offset-same-instant t)
                                                                                 t/local-time
                                                                                 u.date/format)))
(defmethod ->QueryParameterValue java.time.OffsetDateTime [t] (param "TIMESTAMP" (u.date/format t)))
(defmethod ->QueryParameterValue java.time.ZonedDateTime  [t] (param "TIMESTAMP" (->> (t/zone-id "UTC")
                                                                                      (t/with-zone-same-instant t)
                                                                                      t/offset-date-time
                                                                                      u.date/format)))

(defn- query-parameter ^QueryParameterValue [value]
  (let [param (->QueryParameterValue value)]
    (log/tracef "Set parameter ^%s %s -> %s" (some-> value class .getCanonicalName) (pr-str value) (pr-str param))
    param))

(defn set-parameters!
  "Set the `parameters` (i.e., values for `?` positional placeholders in the SQL) for a `query` request. Equivalent to
  JDBC `.setObject()` and the like."
  ^QueryJobConfiguration$Builder [^QueryJobConfiguration$Builder query parameters]
  (doseq [p parameters]
    (.addPositionalParameter query (query-parameter p)))
  query)
