(ns metabase.query-processor.middleware.format-rows
  "Middleware that formats the results of a query.
   Currently, the only thing this does is convert datetime types to ISO-8601 strings in the appropriate timezone."
  (:require
   [java-time.api :as t]
   [metabase.query-processor.timezone :as qp.timezone]
   [metabase.util.date-2 :as u.date]
   [metabase.util.log :as log]
   [potemkin.types :as p.types])
  (:import
   (java.time Instant LocalDate LocalDateTime LocalTime OffsetDateTime OffsetTime ZonedDateTime ZoneId)))

(p.types/defprotocol+ ^:private FormatValue
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

(defn- format-rows-xform [rf metadata]
  {:pre [(fn? rf)]}
  (log/debugf "Formatting rows with results timezone ID %s" (qp.timezone/results-timezone-id))
  (let [timezone-id  (t/zone-id (qp.timezone/results-timezone-id))
        ;; a column will have `converted_timezone` metadata if it is the result of `convert-timezone` expression
        ;; in that case, we'll format the results with the target timezone.
        ;; Otherwise format it with results-timezone
        cols-zone-id (map #(t/zone-id (get % :converted_timezone timezone-id)) (:cols metadata))]
    (fn
      ([]
       (rf))

      ([result]
       (rf result))

      ([result row]
       (rf result (mapv format-value row cols-zone-id))))))

(defn format-rows
  "Format individual query result values as needed.  Ex: format temporal values as ISO-8601 strings w/ timezone offset."
  [{{:keys [format-rows?] :or {format-rows? true}} :middleware, :as _query} rff]
  (fn format-rows-rff* [metadata]
    ;; always assoc `:format-rows?` into the metadata so that
    ;; the `qp.si/streaming-results-writer` implmementations can apply/not-apply formatting based on the key's value
    (let [metadata (assoc metadata :format-rows? format-rows?)]
      (if format-rows?
        (format-rows-xform (rff metadata) metadata)
        (rff metadata)))))
