(ns metabase.util.formatting.date
  "Formatting for dates, times, and ranges."
  (:require
   [metabase.util.formatting.internal.date-formatters :as formatters]
   [metabase.util.time :as u.time]))

(defn date->iso-string
  "Coerce date and format as big-endian-day string."
  [d]
  (formatters/big-endian-day (u.time/coerce-to-timestamp d)))

(defn datetime->iso-string
  "Coerce datetime and format as iso string."
  [dt]
  (formatters/->iso (u.time/coerce-to-timestamp dt)))
