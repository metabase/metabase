(ns metabase.query-processor.middleware.format-rows
  "Middleware that formats the results of a query.
   Currently, the only thing this does is convert datetime types to ISO-8601 strings in the appropriate timezone."
  (:require [clojure.tools.logging :as log]
            [java-time :as t]
            [metabase.query-processor.timezone :as qp.timezone]
            [metabase.util.date-2 :as u.date]
            [metabase.util.i18n :refer [tru]]
            [potemkin.types :as p.types])
  (:import [java.time Instant LocalDate LocalDateTime LocalTime OffsetDateTime OffsetTime ZonedDateTime ZoneId]))

(p.types/defprotocol+ FormatValue
  "Protocol for determining how QP results of various classes are serialized. Drivers can add implementations to support
  custom driver types as needed."
  (format-value [v ^ZoneId timezone-id]
    "Serialize a value in the QP results. You can add impementations for driver-specific types as needed."))

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

(defn- format-rows-xform [rf]
  {:pre [(fn? rf)]}
  (log/debug (tru "Formatting rows with results timezone ID {0}" (qp.timezone/results-timezone-id)))
  (let [timezone-id (t/zone-id (qp.timezone/results-timezone-id))]
    (fn
      ([]
       (rf))

      ([result]
       (rf result))

      ([result row]
       (rf result (mapv #(format-value % timezone-id) row))))))

(defn format-rows
  "Format individual query result values as needed.  Ex: format temporal values as ISO-8601 strings w/ timezone offset."
  [qp]
  (fn [{{:keys [format-rows?] :or {format-rows? true}} :middleware, :as query} rff context]
    (qp query
        (if format-rows?
          (fn [metadata]
            (format-rows-xform (rff metadata)))
          rff)
        context)))
