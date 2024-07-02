(ns metabase.shared.formatting.date
  "Formatting for dates, times, and ranges."
  (:require
   [metabase.shared.formatting.constants :as constants]
   [metabase.shared.formatting.internal.date-builder :as builder]
   [metabase.shared.formatting.internal.date-formatters :as formatters]
   [metabase.shared.formatting.internal.date-options :as options]
   [metabase.shared.util.time :as shared.ut]))

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
        t       (shared.ut/coerce-to-timestamp value options)]
    (if (not (shared.ut/valid? t))
      ;; Fall back to a basic string rendering if we couldn't parse it.
      (str value)
      (if-let [fmt (parameter-formatters (:unit options))]
        ;; A few units have special formats.
        (fmt t)
        ;; Otherwise, render as a day or day range.
        (let [[start end] (shared.ut/to-range t options)]
          (if (shared.ut/same-day? start end)
            (formatters/big-endian-day start)
            (str (formatters/big-endian-day start) "~" (formatters/big-endian-day end))))))))

;;; ------------------------------------------------ Format Range -------------------------------------------------
(defn- format-range-with-unit-inner [[start end] options]
  (cond
    ;; Uncondensed, or in different years: January 1, 2018 - January 23, 2019
    (or (not (constants/condense-ranges? options))
        (not (shared.ut/same-year? start end)))
    (let [fmt (formatters/month-day-year options)]
      (str (fmt start) range-separator (fmt end)))

    ;; Condensed, but different months: January 1 - February 2, 2018
    (not (shared.ut/same-month? start end))
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
        t       (shared.ut/coerce-to-timestamp value options)]
    (if (shared.ut/valid? t)
      (format-range-with-unit-inner (shared.ut/to-range t options) options)
      ;; Best-effort fallback if we failed to parse - .toString the input.
      (str value))))

;;; ---------------------------------------------- Format Single Date -----------------------------------------------
(defn ^:export format-datetime-with-unit
  "Returns a string with this datetime formatted as a single value, rounded to the given `:unit`."
  [value options]
  (let [{:keys [is-exclude no-range type unit]
         :as options}                          (options/prepare-options options)
        t                                      (shared.ut/coerce-to-timestamp value options)]
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
  (formatters/big-endian-day (shared.ut/coerce-to-timestamp d)))

(defn ^:export datetime->iso-string
  "Coerce datetime and format as iso string."
  [dt]
  (formatters/->iso (shared.ut/coerce-to-timestamp dt)))
