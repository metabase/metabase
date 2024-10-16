(ns metabase.util.formatting.time
  "Formatters for time values without date information."
  (:require
   [metabase.util.formatting.date :as date]
   [metabase.util.formatting.internal.date-options :as options]
   [metabase.util.time :as u.time])
  #?(:clj
     (:import
      [java.time.format DateTimeFormatter FormatStyle])))

;;; ------------------------------------------------- Format Time ---------------------------------------------------
(defn ^:export format-time
  "Formats a give time (an hour number, a local time string, or a platform-specific local time object) in the
  idiomatic style for this locale.

  For example, `\"7:45 PM\"` in English, `\"19h45\"` in French."
  [value]
  (let [t (u.time/coerce-to-time value)]
    ;; Uses localized time formatting.
    (when (u.time/valid? t)
      #?(:cljs (.format t "LT")
         :clj  (.format (DateTimeFormatter/ofLocalizedTime FormatStyle/SHORT) t)))))

(defn ^:export format-time-with-unit
  "Formats the given time (as a string or platform-specific local time or datetime object) based on the `:unit` and
  other options, as is done for date formatting."
  [value options]
  (let [options (-> options options/prepare-options (assoc :date-enabled false))]
    (date/format-datetime-with-unit value options)))
