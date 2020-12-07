(ns metabase.query-processor.middleware.format-rows
  "Middleware that formats the results of a query.
   Currently, the only thing this does is convert datetime types to ISO-8601 strings in the appropriate timezone."
  (:require [clojure.tools.logging :as log]
            [java-time :as t]
            [metabase.query-processor.timezone :as qp.timezone]
            [metabase.util.i18n :refer [tru]]
            [potemkin.types :as p.types])
  (:import [java.time Instant LocalDate LocalDateTime LocalTime OffsetDateTime OffsetTime ZonedDateTime ZoneId]))

;; TODO -- consider moving this it `metabase.util.date2`
(p.types/defprotocol+ WithTimeZoneSameInstant
  "Protocol for converting a temporal value to an equivalent one in a given timezone."
  (with-time-zone-same-instant [t ^ZoneId timezone-id]
    "Convert a temporal value to an equivalent one in a given timezone. For local temporal values, this simply
    converts it to the corresponding offset/zoned type; for offset/zoned types, this applies an appropriate timezone
    shift."))

(extend-protocol WithTimeZoneSameInstant
  ;; convert to a OffsetTime with no offset (UTC); the OffsetTime method impl will apply the zone shift.
  LocalTime
  (with-time-zone-same-instant [t zone-id]
    (with-time-zone-same-instant (t/offset-time t (t/zone-offset 0)) zone-id))

  ;; We don't know what zone offset to shift this to, since the offset for a zone-id can vary depending on the date
  ;; part of a temporal value (e.g. DST vs non-DST). So just adjust to the non-DST "standard" offset for the zone in
  ;; question.
  OffsetTime
  (with-time-zone-same-instant [t ^ZoneId zone-id]
    (let [offset (.. zone-id getRules (getStandardOffset (t/instant 0)))]
      (t/with-offset-same-instant t offset)))

  LocalDate
  (with-time-zone-same-instant [t zone-id]
    (t/offset-date-time t (t/local-time 0) zone-id))

  LocalDate
  (with-time-zone-same-instant [t zone-id]
    (t/offset-date-time t (t/local-time 0) zone-id))

  LocalDateTime
  (with-time-zone-same-instant [t zone-id]
    (t/offset-date-time t zone-id))

  Instant
  (with-time-zone-same-instant [t zone-id]
    (t/offset-date-time t zone-id))

  OffsetDateTime
  (with-time-zone-same-instant [t ^ZoneId zone-id]
    ;; calculate the zone offset applicable for the date in question
    (if (or (= t OffsetDateTime/MAX)
            (= t OffsetDateTime/MIN))
      t
      (let [rules  (.getRules zone-id)
            offset (.getOffset rules (t/instant t))]
        (t/with-offset-same-instant t offset))))

  ZonedDateTime
  (with-time-zone-same-instant [t zone-id]
    (t/offset-date-time (t/with-zone-same-instant t zone-id))))

;; TODO - consider moving to `metabase.util.date-2/format-with-timezone`
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
    (t/format :iso-offset-time (with-time-zone-same-instant t timezone-id)))

  OffsetTime
  (format-value [t timezone-id]
    (t/format :iso-offset-time (with-time-zone-same-instant t timezone-id)))

  LocalDate
  (format-value [t timezone-id]
    (t/format :iso-offset-date-time (with-time-zone-same-instant t timezone-id)))

  LocalDateTime
  (format-value [t timezone-id]
    (t/format :iso-offset-date-time (with-time-zone-same-instant t timezone-id)))

  Instant
  (format-value [t timezone-id]
    (t/format :iso-offset-date-time (with-time-zone-same-instant t timezone-id)))

  OffsetDateTime
  (format-value [t, ^ZoneId timezone-id]
    (t/format :iso-offset-date-time (with-time-zone-same-instant t timezone-id)))

  ZonedDateTime
  (format-value [t timezone-id]
    (t/format :iso-offset-date-time (with-time-zone-same-instant t timezone-id))))

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
