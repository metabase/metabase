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

(defn drop-trailing-time-zone
  "Strips off a trailing +0500, -0430, or Z from a time string."
  [time-str]
  (or (second (re-matches #"(.*?)(?:Z|[+-][\d:]+)$" time-str))
      time-str))
