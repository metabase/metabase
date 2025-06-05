(ns metabase.util.formatting.date
  "Formatting for dates, times, and ranges."
  (:require
   [metabase.util.formatting.internal.date-formatters :as formatters]
   [metabase.util.malli :as mu]
   [metabase.util.time :as u.time]))

(mu/defn date->iso-string
  "Coerce date and format as big-endian-day string."
  [d
   options :- [:map
               ;; keyw is required to be specified so we know you're TRYING to get it but it can be nil in case the
               ;; metadata provider doesn't have a value for it.
               [:start-of-week [:maybe :keyword]]]]
  (formatters/big-endian-day (u.time/coerce-to-timestamp d options)))

(mu/defn datetime->iso-string
  "Coerce datetime and format as iso string."
  [dt
   options :- [:map
               [:start-of-week [:maybe :keyword]]]]
  (formatters/->iso (u.time/coerce-to-timestamp dt options)))
