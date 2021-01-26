(ns metabase.query-processor.middleware.format-rows
  "Middleware that formats the results of a query.
   Currently, the only thing this does is convert datetime types to ISO-8601 strings in the appropriate timezone."
  (:require [buddy.core.codecs :as codecs]
            [clojure.string :as str]
            [clojure.tools.logging :as log]
            [java-time :as t]
            [metabase.query-processor.timezone :as qp.timezone]
            [metabase.util.date-2 :as u.date]
            [metabase.util.i18n :refer [tru]]
            [potemkin.types :as p.types])
  (:import [java.time Instant LocalDate LocalDateTime LocalTime OffsetDateTime OffsetTime ZonedDateTime ZoneId]
           org.apache.commons.codec.binary.Hex))

(p.types/defprotocol+ FormatValue
  "Protocol for determining how QP results of various classes are serialized. Drivers can add implementations to support
  custom driver types as needed."
  (format-value [v ^ZoneId timezone-id]
    "Serialize a value in the QP results. You can add impementations for driver-specific types as needed."))

(defmulti format-field-value (fn [value field] (:special_type field)))

(defmethod format-field-value :default [value _] value)

(defn convert-binary-ip [bytes]
  (cond (not (seq bytes))
        bytes

        (= 4 (count bytes))
        (str/join "." (map #(Byte/toUnsignedLong %) bytes))

        :else
        (let [hex-chunks (mapv #(apply str %) (partition-all 4 (codecs/bytes->hex bytes)))]
          (str/replace (str (str/join ":" (pop hex-chunks)) "::" (peek hex-chunks))
                       #":0000" ":0"))))

(defmethod format-field-value :type/BinaryIPAddress
  [value _field]
  ;; mysql can convert in the db layer so its possible a string has already come out
  (if (instance? (Class/forName "[B") value)
    (convert-binary-ip value)
    value))

(extend-protocol FormatValue
  nil
  (format-value [_ _]
    nil)

  Object
  (format-value [v _]
    v)

  LocalTime
  (format-value [t timezone-id]
    (t/format :iso-offset-time (u.date/with-time-zone-same-instant t timezone-id)))

  OffsetTime
  (format-value [t timezone-id]
    (t/format :iso-offset-time (u.date/with-time-zone-same-instant t timezone-id)))

  LocalDate
  (format-value [t timezone-id]
    (t/format :iso-offset-date-time (u.date/with-time-zone-same-instant t timezone-id)))

  LocalDateTime
  (format-value [t timezone-id]
    (t/format :iso-offset-date-time (u.date/with-time-zone-same-instant t timezone-id)))

  ;; convert to a ZonedDateTime
  Instant
  (format-value [t timezone-id]
    (format-value (t/zoned-date-time t (t/zone-id "UTC")) timezone-id))

  OffsetDateTime
  (format-value [t, ^ZoneId timezone-id]
    (t/format :iso-offset-date-time (u.date/with-time-zone-same-instant t timezone-id)))

  ZonedDateTime
  (format-value [t timezone-id]
    (t/format :iso-offset-date-time (u.date/with-time-zone-same-instant t timezone-id))))

(defn format-value* [v field timezone-id]
  (-> v
      (format-field-value field)
      (format-value timezone-id)))

(defn- format-rows-xform [metadata rf]
  {:pre [(fn? rf)]}
  (log/debug (tru "Formatting rows with results timezone ID {0}" (qp.timezone/results-timezone-id)))
  (let [timezone-id (t/zone-id (qp.timezone/results-timezone-id))]
    (fn
      ([]
       (rf))

      ([result]
       (rf result))

      ([result row]
       (rf result (mapv (fn [v col] (format-value* v col timezone-id)) row (:cols metadata)))))))

(defn format-rows
  "Format individual query result values as needed.  Ex: format temporal values as ISO-8601 strings w/ timezone offset."
  [qp]
  (fn [{{:keys [format-rows?] :or {format-rows? true}} :middleware, :as query} rff context]
    (qp query
        (if format-rows?
          (fn [metadata]
            (format-rows-xform metadata (rff metadata)))
          rff)
        context)))
