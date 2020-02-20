(ns metabase.query-processor.middleware.format-rows
  "Middleware that formats the results of a query.
   Currently, the only thing this does is convert datetime types to ISO-8601 strings in the appropriate timezone."
  (:require [clojure.tools.logging :as log]
            [java-time :as t]
            [metabase.query-processor.timezone :as qp.timezone]
            [metabase.util.i18n :refer [tru]]
            [potemkin.types :as p.types])
  (:import [java.time Instant LocalDate LocalDateTime LocalTime OffsetDateTime OffsetTime ZonedDateTime ZoneId]))

;; TODO - consider moving to `metabase.util.date-2/format-with-timezone`
(p.types/defprotocol+ FormatValue
  "Protocol for determining how QP results of various classes are serialized. Drivers can add implementations to support
  custom driver types as needed."
  (format-value [v, ^ZoneId timezone-id]
    "Serialize a value in the QP results. You can add impementations for driver-specific types as needed."))

(extend-protocol FormatValue
  nil
  (format-value [_ _]
    nil)

  Object
  (format-value [v _]
    v)

  ;; TIMEZONE FIXME — not sure this makes sense at all...
  LocalTime
  (format-value [t timezone-id]
    (t/format :iso-offset-time (t/offset-time t timezone-id)))

  ;; TODO - this is a little screwy, for `OffsetDateTime` and `ZonedDateTime` we convert them into the `timezone-id`
  ;; (by adjusting offset as needed); because `OffsetTime` doesn't have a date (and adjusting offset can't be done
  ;; with Zone ID alone), return it *without* adjusting it into `timezone-id`
  OffsetTime
  (format-value [t _]
    (t/format :iso-offset-time t))

  LocalDate
  (format-value [t timezone-id]
    (t/format :iso-offset-date-time (t/offset-date-time t (t/local-time 0) timezone-id)))

  LocalDateTime
  (format-value [t timezone-id]
    (t/format :iso-offset-date-time (t/offset-date-time t timezone-id)))

  Instant
  (format-value [t timezone-id]
    (t/format :iso-offset-date-time (t/offset-date-time t timezone-id)))

  OffsetDateTime
  (format-value [t, ^ZoneId timezone-id]
    (t/format :iso-offset-date-time
              (let [rules  (.getRules timezone-id)
                    offset (.getOffset rules (t/instant t))]
                (t/with-offset-same-instant t offset))))

  ZonedDateTime
  (format-value [t timezone-id]
    (t/format :iso-offset-date-time
              (t/offset-date-time (t/with-zone-same-instant t timezone-id)))))

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
