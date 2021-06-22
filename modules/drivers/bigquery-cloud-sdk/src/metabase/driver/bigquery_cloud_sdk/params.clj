(ns metabase.driver.bigquery-cloud-sdk.params
  (:require [clojure.tools.logging :as log]
            [java-time :as t]
            [metabase.util.date-2 :as u.date])
  (:import [com.google.cloud.bigquery QueryJobConfiguration$Builder QueryParameterValue StandardSQLTypeName]))

#_(defn- param-type-old ^QueryParameterType [^String type-name]
    (doto (QueryParameterType.)
      (.setType type-name)))

#_(defn- param-value-old ^com.google.api.services.bigquery.model.QueryParameterValue [v]
    (doto (com.google.api.services.bigquery.model.QueryParameterValue.)
      (.setValue (str v))))

#_(defn- param-old [type-name v]
    (doto (QueryParameter.)
      (.setParameterType (param-type-old type-name))
      (.setParameterValue (param-value-old v))))

(defn- param ^QueryParameterValue [type-name v]
  (.build (doto (QueryParameterValue/newBuilder)
            (.setType (StandardSQLTypeName/valueOf type-name))
            (.setValue (if (some? v) (str v))))))

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
(defmethod ->QueryParameterValue java.math.BigDecimal [v] (param "FLOAT64" v))

(defmethod ->QueryParameterValue java.time.LocalDate      [t] (param "DATE" (u.date/format t)))
(defmethod ->QueryParameterValue java.time.LocalDateTime  [t] (param "DATETIME" (u.date/format t)))
(defmethod ->QueryParameterValue java.time.LocalTime      [t] (param "TIME" (u.date/format t)))
(defmethod ->QueryParameterValue java.time.OffsetTime     [t] (param "TIME" (u.date/format
                                                                             (t/local-time
                                                                              (t/with-offset-same-instant
                                                                                t
                                                                                (t/zone-offset 0)))))) ;;TODO thread
(defmethod ->QueryParameterValue java.time.OffsetDateTime [t] (param "TIMESTAMP" (u.date/format t)))
(defmethod ->QueryParameterValue java.time.ZonedDateTime  [t] (param "TIMESTAMP" (u.date/format
                                                                                  (t/offset-date-time
                                                                                   (t/with-zone-same-instant
                                                                                     t
                                                                                     (t/zone-id "UTC")))))) ;;TODO thread

#_(defn- query-parameter-old ^QueryParameter [value]
    (let [param (->QueryParameter value)]
      (log/tracef "Set parameter ^%s %s -> %s" (some-> value class .getCanonicalName) (pr-str value) (pr-str param))
      param))

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

#_(defn set-parameters-old!
    "Set the `parameters` (i.e., values for `?` positional placeholders in the SQL) for a `query` request. Equivalent to
  JDBC `.setObject()` and the like."
    ^QueryRequest [^QueryRequest query parameters]
    (if (seq parameters)
      (doto query
        (.setParameterMode "POSITIONAL")
        (.setQueryParameters (apply list (map query-parameter parameters))))
      query))
