(ns metabase.query-processor.streaming.common
  "Shared util fns for various export (download) streaming formats."
  (:require [java-time :as t]
            [metabase.query-processor.store :as qp.store]
            [metabase.query-processor.timezone :as qp.timezone]
            [metabase.util.date-2 :as u.date])
  (:import [java.time LocalDate LocalDateTime LocalTime OffsetDateTime OffsetTime ZonedDateTime]))

(defn in-result-time-zone
  "Set the time zone of a temporal value `t` to result timezone without changing the actual moment in time. e.g.

    ;; if result timezone is `US/Pacific`
    (apply-timezone #t \"2021-03-30T20:06:00Z\") -> #t \"2021-03-30T13:06:00-07:00\""
  [t]
  (u.date/with-time-zone-same-instant
   t
   (qp.store/cached ::results-timezone (t/zone-id (qp.timezone/results-timezone-id)))))

(defprotocol FormatValue
  "Protocol for specifying how objects of various classes in QP result rows should be formatted in various download
  results formats (e.g. CSV, as opposed to the 'normal' API response format, which doesn't use this logic)."
  (format-value [this]
    "Format this value in a QP result row appropriately for a results download, such as CSV."))

(extend-protocol FormatValue
  nil
  (format-value [_] nil)

  Object
  (format-value [this] this)

  LocalDate
  (format-value [t]
    (u.date/format t))

  LocalDateTime
  (format-value [t]
    (if (= (t/local-time t) (t/local-time 0))
      (format-value (t/local-date t))
      (u.date/format t)))

  LocalTime
  (format-value [t]
    (u.date/format t))

  OffsetTime
  (format-value [t]
    (u.date/format (in-result-time-zone t)))

  OffsetDateTime
  (format-value [t]
    (u.date/format (in-result-time-zone t)))

  ZonedDateTime
  (format-value [t]
    (format-value (t/offset-date-time t))))
