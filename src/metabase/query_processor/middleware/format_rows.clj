(ns metabase.query-processor.middleware.format-rows
  "Middleware that formats the results of a query.
   Currently, the only thing this does is convert datetime types to ISO-8601 strings in the appropriate timezone."
  (:require
   [java-time.api :as t]
   [metabase.query-processor.timezone :as qp.timezone]
   [metabase.util.date-2 :as u.date]
   [metabase.util.log :as log]
   [metabase.util.performance :as perf]
   [potemkin.types :as p.types])
  (:import
   (java.time Instant LocalDate LocalDateTime LocalTime OffsetDateTime OffsetTime ZonedDateTime ZoneId)))

(set! *warn-on-reflection* true)

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

(defn- strip-timezone [t]
  (cond
    (instance? OffsetDateTime t)
    (.toLocalDateTime ^OffsetDateTime t)

    (instance? ZonedDateTime t)
    (.toLocalDateTime ^ZonedDateTime t)

    :else
    t))

(defn- format-rows-xform [rf metadata]
  {:pre [(fn? rf)]}
  (log/debugf "Formatting rows with results timezone ID %s" (qp.timezone/results-timezone-id))
  (let [cols-converted-timezones (perf/mapv :converted_timezone (:cols metadata))
        timezone-id (t/zone-id (qp.timezone/results-timezone-id))
        format (fn [value converted-timezone]
                 (cond-> value
                   ;; For columns with converted_timezone, if the driver returns an
                   ;; OffsetDateTime/ZonedDateTime, the value has already been timezone-converted
                   ;; in SQL but the db may have re-cast it as timestamp with tz. We need to
                   ;; strip the offset and treat it as a LocalDateTime so format-value attaches
                   ;; the target zone instead of shifting from UTC. (#68712)
                   converted-timezone strip-timezone
                   ;; a column will have `converted_timezone` metadata if it is the result of `convert-timezone`
                   ;; expression in that case, we'll format the results with the target timezone.  Otherwise
                   ;; format it with results-timezone
                   true (format-value (t/zone-id (or converted-timezone timezone-id)))))]
    (fn
      ([]
       (rf))

      ([result]
       (rf result))

      ([result row]
       (rf result (perf/mapv format row cols-converted-timezones))))))

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
