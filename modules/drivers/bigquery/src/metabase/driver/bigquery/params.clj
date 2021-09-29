(ns metabase.driver.bigquery.params
  (:require [clojure.tools.logging :as log]
            [java-time :as t]
            [metabase.util.date-2 :as u.date])
  (:import [com.google.api.services.bigquery.model QueryParameter QueryParameterType QueryParameterValue QueryRequest]))

(defn- param-type ^QueryParameterType [^String type-name]
  (doto (QueryParameterType.)
    (.setType type-name)))

(defn- param-value ^QueryParameterValue [v]
  (doto (QueryParameterValue.)
    (.setValue (str v))))

(defn- param [type-name v]
  (doto (QueryParameter.)
    (.setParameterType (param-type type-name))
    (.setParameterValue (param-value v))))

(defmulti ^:private ->QueryParameter
  {:arglists '(^QueryParameter [v])}
  class)

(defmethod ->QueryParameter :default
  [v]
  (param "STRING" v))

;; See https://cloud.google.com/spanner/docs/data-types for type mappings

;; `nil` still has to be given a type (this determines the type it comes back as in cases like `["SELECT ?" nil]`) --
;; AFAIK this only affects native queries because `NULL` is usually spliced into the compiled SQL directly in MBQL
;; queries. Unfortunately we don't know the actual type we should set here so `STRING` is going to have to do for now.
;; This shouldn't really matter anyways since `WHERE field = NULL` generally doesn't work (we have to do `WHERE FIELD
;; IS NULL` instead)
(defmethod ->QueryParameter nil
  [_]
  (doto (QueryParameter.)
    (.setParameterType (param-type "STRING"))
    (.setParameterValue (doto (QueryParameterValue.)
                          (.setValue nil)))))

(defmethod ->QueryParameter String               [v] (param "STRING" v))
(defmethod ->QueryParameter Boolean              [v] (param "BOOL" v))
(defmethod ->QueryParameter Integer              [v] (param "INT64" v))
(defmethod ->QueryParameter Long                 [v] (param "INT64" v))
(defmethod ->QueryParameter Short                [v] (param "INT64" v))
(defmethod ->QueryParameter Byte                 [v] (param "INT64" v))
(defmethod ->QueryParameter clojure.lang.BigInt  [v] (param "INT64" v))
(defmethod ->QueryParameter Float                [v] (param "FLOAT64" v))
(defmethod ->QueryParameter Double               [v] (param "FLOAT64" v))
(defmethod ->QueryParameter java.math.BigDecimal [v] (param "FLOAT64" v))

(defmethod ->QueryParameter java.time.LocalDate      [t] (param "DATE" (u.date/format t)))
(defmethod ->QueryParameter java.time.LocalDateTime  [t] (param "DATETIME" (u.date/format t)))
(defmethod ->QueryParameter java.time.LocalTime      [t] (param "TIME" (u.date/format t)))
(defmethod ->QueryParameter java.time.OffsetTime     [t] (param "TIME" (u.date/format
                                                                        (t/local-time
                                                                         (t/with-offset-same-instant t (t/zone-offset 0))))))
(defmethod ->QueryParameter java.time.OffsetDateTime [t] (param "TIMESTAMP" (u.date/format t)))
(defmethod ->QueryParameter java.time.ZonedDateTime  [t] (param "TIMESTAMP" (u.date/format
                                                                             (t/offset-date-time
                                                                              (t/with-zone-same-instant t (t/zone-id "UTC"))))))

(defn- query-parameter ^QueryParameter [value]
  (let [param (->QueryParameter value)]
    (log/tracef "Set parameter ^%s %s -> %s" (some-> value class .getCanonicalName) (pr-str value) (pr-str param))
    param))

(defn set-parameters!
  "Set the `parameters` (i.e., values for `?` positional placeholders in the SQL) for a `query` request. Equivalent to
  JDBC `.setObject()` and the like."
  ^QueryRequest [^QueryRequest query parameters]
  (if (seq parameters)
    (doto query
      (.setParameterMode "POSITIONAL")
      (.setQueryParameters (apply list (map query-parameter parameters))))
    query))
