(ns metabase.shared.util.internal.time-common
  "Shared core of time utils used by the internal CLJ and CLJS implementations.
  See [[metabase.shared.util.time]] for the public interface.")

(defn- by-unit [_ {:keys [unit]}] (keyword unit))

(defmulti to-range
  "Given a datetime and a unit (eg. \"hour\"), returns an *inclusive* datetime range as a pair of datetimes.
  For a unit of an hour, and a datetime for 13:49:28, that means [13:00:00 13:59:59.999], ie. 1 ms before the end."
  by-unit)

(defmulti string->timestamp
  "Given a string representation of a datetime and the `options` map, parses the string as a representation of the
  `:unit` option (eg. \"hour\").
  Returns a platform-specific datetime."
  by-unit)

(defmulti number->timestamp
  "Given a numeric representation of a datetime and the `options` map, interprets the number based on the `:unit` option
  (eg. \"day-of-week\").

  Note that for two relative units - `day-of-month` and `day-of-year` - an arbitrary date is generated, not necessarily
  one in the current month or year. When grouping user data by day-of-month, it doesn't matter whether the current month
  has 31 days or not.

  Returns a platform-specific datetime."
  by-unit)

(def ^:private year-part
  "\\d{4}")

(def ^:private month-part
  "\\d{2}")

(def ^:private day-part
  "\\d{2}")

(def ^:private date-part
  (str year-part \- month-part \- day-part))

(def ^:private hour-part
  "\\d{2}")

(def ^:private minutes-part
  "\\d{2}")

(defn- optional [& parts]
  (str "(?:" (apply str parts) ")?"))

(def ^:private seconds-milliseconds-part
  (str ":\\d{2}" (optional "\\.\\d{1,6}")))

(def ^:private time-part
  (str hour-part \: minutes-part (optional seconds-milliseconds-part)))

(def ^:private date-time-part
  (str date-part "[T ]" time-part))

(def ^:private offset-part
  (str "(?:Z|(?:[+-]" time-part "))"))

(def zone-offset-part-regex
  "Regex for a zone-offset string."
  (re-pattern offset-part))

(def ^:const local-date-regex
  "Regex for a local-date string."
  (re-pattern (str \^ date-part \$)))

(def ^:const local-time-regex
  "Regex for a local-time string."
  (re-pattern (str \^ time-part \$)))

(def ^:const offset-time-regex
  "Regex for an offset-time string."
  (re-pattern (str \^ time-part offset-part \$)))

(def ^:const local-datetime-regex
  "Regex for a local-datetime string."
  (re-pattern (str \^ date-time-part \$)))

(def ^:const offset-datetime-regex
  "Regex for an offset-datetime string."
  (re-pattern (str \^ date-time-part offset-part \$)))

(def ^:const year-month-regex
  "Regex for a year-month literal string."
  (re-pattern (str \^ year-part \- month-part \$)))

(def ^:const year-regex
  "Regex for a year literal string."
  (re-pattern (str \^ year-part \$)))

(defn matches-time?
  "Matches a local time string."
  [input]
  (re-matches local-time-regex input))

(defn matches-date?
  "Matches a local date string."
  [input]
  (re-matches local-date-regex input))

(defn matches-date-time?
  "Matches a local AND offset date time string."
  [input]
  (re-matches (re-pattern (str date-time-part (optional offset-part))) input))

(defn drop-trailing-time-zone
  "Strips off a trailing +0500, -0430, or Z from a time string."
  [time-str]
  (or (second (re-matches (re-pattern (str "(.*?)" (optional offset-part) \$)) time-str))
      time-str))
