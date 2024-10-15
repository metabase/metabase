(ns metabase.util.formatting.date
  "Formatting for dates, times, and ranges."
  (:require
   [metabase.util.formatting.constants :as constants]
   [metabase.util.formatting.internal.date-builder :as builder]
   [metabase.util.formatting.internal.date-formatters :as formatters]
   [metabase.util.formatting.internal.date-options :as options]
   [metabase.util.time :as u.time]))

(def range-separator
  "The range separator is a Unicode en-dash, not an ASCII hyphen."
  " \u2013 ")

;;; -------------------------------------------- Parameter Formatting ---------------------------------------------
(def ^:private parameter-formatters
  {:month   (builder/->formatter [:year "-" :month-dd])
   :quarter (builder/->formatter ["Q" :quarter "-" :year])
   :day     formatters/big-endian-day})

(defn ^:export format-for-parameter
  "Returns a formatting date string for a datetime used as a parameter to a Card."
  [value options]
  (let [options (options/prepare-options options)
        t       (u.time/coerce-to-timestamp value options)]
    (if (not (u.time/valid? t))
      ;; Fall back to a basic string rendering if we couldn't parse it.
      (str value)
      (if-let [fmt (parameter-formatters (:unit options))]
        ;; A few units have special formats.
        (fmt t)
        ;; Otherwise, render as a day or day range.
        (let [[start end] (u.time/to-range t options)]
          (if (u.time/same-day? start end)
            (formatters/big-endian-day start)
            (str (formatters/big-endian-day start) "~" (formatters/big-endian-day end))))))))

;;; ------------------------------------------------ Format Range -------------------------------------------------
(defn- format-range-with-unit-inner [[start end] options]
  (cond
    ;; Uncondensed, or in different years: January 1, 2018 - January 23, 2019
    (or (not (constants/condense-ranges? options))
        (not (u.time/same-year? start end)))
    (let [fmt (formatters/month-day-year options)]
      (str (fmt start) range-separator (fmt end)))

    ;; Condensed, but different months: January 1 - February 2, 2018
    (not (u.time/same-month? start end))
    (str ((formatters/month-day options) start)
         range-separator
         ((formatters/month-day-year options) end))

    ;; Condensed, and same month: January 1 - 14, 2018
    :else (str ((formatters/month-day options) start)
               range-separator
               ((builder/->formatter [:day-of-month-d ", " :year]) end))))

(defn ^:export format-range-with-unit
  "Returns a string with this datetime formatted as a range, rounded to the given `:unit`."
  [value options]
  (let [options (options/prepare-options options)
        t       (u.time/coerce-to-timestamp value options)]
    (if (u.time/valid? t)
      (format-range-with-unit-inner (u.time/to-range t options) options)
      ;; Best-effort fallback if we failed to parse - .toString the input.
      (str value))))

;;; ---------------------------------------------- Format Single Date -----------------------------------------------
(defn ^:export format-datetime-with-unit
  "Returns a string with this datetime formatted as a single value, rounded to the given `:unit`."
  [value options]
  (let [{:keys [is-exclude no-range type unit]
         :as options}                          (options/prepare-options options)
        t                                      (u.time/coerce-to-timestamp value options)]
    (cond
      is-exclude (case unit
                   :hour-of-day (formatters/hour-only t)
                   :day-of-week (formatters/weekday t)
                   (throw (ex-info "is-exclude option is only compatible with hour-of-day and day-of-week units"
                                   {:options options})))

      ;; Weeks in tooltips and cells get formatted specially.
      (and (= unit :week) (#{"tooltip" "cell"} type) (not no-range))
      (format-range-with-unit value options)

      :else ((formatters/options->formatter options) t))))

(defn ^:export date->iso-string
  "Coerce date and format as big-endian-day string."
  [d]
  (formatters/big-endian-day (u.time/coerce-to-timestamp d)))

(defn ^:export datetime->iso-string
  "Coerce datetime and format as iso string."
  [dt]
  (formatters/->iso (u.time/coerce-to-timestamp dt)))
