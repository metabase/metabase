(ns metabase.query-processor.streaming.common
  "Shared util fns for various export (download) streaming formats."
  (:require [java-time :as t]
            [metabase.util.date-2 :as u.date]))

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

  java.time.temporal.Temporal
  (format-value [this]
    (u.date/format this))

  java.time.LocalDateTime
  (format-value [this]
    (u.date/format
     (if (= (t/local-time this) (t/local-time 0))
       (t/local-date this)
       this)))

  java.time.OffsetDateTime
  (format-value [this]
    (u.date/format
     (if (= (t/local-time this) (t/local-time 0))
       (t/local-date this)
       this)))

  java.time.ZonedDateTime
  (format-value [this]
    (format-value (t/offset-date-time this))))
