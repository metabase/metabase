(ns metabase.shared.formatting.internal.date-formatters
  "The gory details of transforming date and time styles, with units and other options, into formatting functions.

  This namespace deals with the options only, not with specific dates, and returns reusable formatter functions."
  (:require
   [clojure.string :as str]
   [metabase.shared.formatting.constants :as constants]
   [metabase.shared.formatting.internal.date-builder :as builder]
   [metabase.util.log :as log]))

(defn- apply-date-separator [format-list date-separator]
  (if date-separator
    (for [fmt format-list]
      (if (string? fmt)
        (str/replace fmt #"/" date-separator)
        fmt))
    format-list))

(defn- apply-date-abbreviation [format-list]
  (for [k format-list]
    (case k
      :month-full         :month-short
      ":month-full"       :month-short
      :day-of-week-full   :day-of-week-short
      ":day-of-week-full" :day-of-week-short
      k)))

(def ^:private default-date-formats-for-unit
  "Maps each unit to the default way of formatting that unit.
  This uses full month and weekday names; abbreviated output replaces these with the short forms later."
  ;; TODO Do we have (in i18n or utils) helpers for getting localized ordinals?
  {:year            [:year]                    ; 2022
   :quarter         ["Q" :quarter " - " :year] ; Q4 - 2022
   :minute-of-hour  [:minute-d]                ; 6, 24
   :day-of-week     [:day-of-week-full]        ; Monday; Mon
   :day-of-month    [:day-of-month-d]          ; 7, 23
   :day-of-year     [:day-of-year]             ; 1, 24, 365
   :week-of-year    [:week-of-year]            ; CLJS: 1st, 42nd; CLJ: 1, 42 (no ordinals)
   :month-of-year   [:month-full]              ; October; Oct
   :quarter-of-year ["Q" :quarter]})           ; Q4

(def ^:private date-style-to-format-overrides
  "Map of `{date_style {unit format}}`.
  If given eg. the style `\"M/D/YYYY\"` but a unit of months, we don't want to use that directly for the format,
  since it contains days.
  This map transforms the `date_style + unit` pair to the format data structure."
  (let [m-y     [:month-d "/" :year]
        mmm-y   [:month-full ", " :year]]
    {"M/D/YYYY"           {:month   m-y}
     "D/M/YYYY"           {:month   m-y}
     "YYYY/M/D"           {:month   [:year "/" :month-d]
                           :quarter [:year " - Q" :quarter]}
     "MMMM D, YYYY"       {:month   mmm-y}
     "D MMMM, YYYY"       {:month   mmm-y}
     "dddd, MMMM D, YYYY" {:week    [:month-full " " :day-of-month-d ", " :year]
                           :month   mmm-y}}))

(def ^:private iso-format
  [:year "-" :month-dd "-" :day-of-month-dd "T" :hour-24-dd ":" :minute-dd ":" :second-dd])

(def ->iso
  "Datetime iso formatter."
  (builder/->formatter iso-format))

(defn- resolve-date-style
  "The `:date-style` is transformed to a `:date-format` as follows:
  0. If `:date-format` is set, just use that.
  1. Check [[date-style-to-format-overrides]] for a style + unit override.
  2. Check [[default-date-formats-for-unit]] for a unit-specific format.
  3. Check [[constants/known-date-styles]] for a basic format.
  4. Fall back to a standard ISO date string, emitting a warning."
  [{:keys [date-format date-style unit]}]
  (or date-format
      (get-in date-style-to-format-overrides [date-style unit])
      (get default-date-formats-for-unit unit)
      (get constants/known-date-styles date-style)
      (do
        (log/warn "Unrecognized date style" {:date-style date-style
                                             :unit       unit})
        iso-format)))

(defn- normalize-date-format [{:keys [date-format] :as options}]
  (merge options (get constants/known-datetime-styles date-format)))

(defn- prepend-weekday [date-format]
  (concat [:day-of-week-short ", "] date-format))

(defn- date-format-for-options
  "Derives a date format data structure from an options map.

  There are three possible sources of the final date format:
  1. A directly provided `:date-format`, which is either a string or a
     [[metabase.shared.formatting.internal.date-builder]] format structure.
  2. `:date_style` as a provided string, a legacy Moment.js format string.
  3. [[constants/default-date-style]]

  A string `:date-format` is converted to a `date-builder` structure.
  If `:date-format` is provided in either form, `:date-style` is ignored.
  See [[resolve-date-style]] for the details of how the `:date-style` is transformed to a format structure.
  "
  [{:keys [date-separator weekday-enabled] :as options}]
  (let [date-format (-> options normalize-date-format resolve-date-style)]
    (cond-> date-format
      date-separator                   (apply-date-separator date-separator)
      weekday-enabled                  prepend-weekday
      (constants/abbreviated? options) apply-date-abbreviation)))

;;; ------------------------------------------ Standardized Formats ------------------------------------------------
(def ^:private short-month-day
  (builder/->formatter [:month-short " " :day-of-month-d]))
(def ^:private full-month-day
  (builder/->formatter [:month-full  " " :day-of-month-d]))

(def ^:private short-month-day-year
  (builder/->formatter [:month-short " " :day-of-month-d ", " :year]))
(def ^:private full-month-day-year
  (builder/->formatter [:month-full  " " :day-of-month-d ", " :year]))

(defn- short-months? [{:keys [type] :as options}]
  (and (constants/abbreviated? options) (not= type "tooltip")))

(defn month-day-year
  "Helper that gets the right month-day-year format based on the options: either full `\"April 6, 2022\"` or shortened
  `\"Apr 6, 2022\"`."
  [options]
  (if (short-months? options)
    short-month-day-year
    full-month-day-year))

(defn month-day
  "Helper that gets the right month-day format based on the options: either full `\"April 6\"` or shortened
  `\"Apr 6\"`."
  [options]
  (if (short-months? options)
    short-month-day
    full-month-day))

(def ^:private big-endian-day-format
  [:year "-" :month-dd "-" :day-of-month-dd])

(def big-endian-day
  "A cached, commonly used formatter for dates in `\"2022-04-22\"` form."
  (builder/->formatter big-endian-day-format))

(def hour-only
  "A cached, commonly used formatter for times in 12-hour `\"7 PM\"` form."
  (builder/->formatter [:hour-12-d " " :am-pm]))

(def weekday
  "A cached, commonly used formatter for full weekday names."
  (builder/->formatter [:day-of-week-full]))

;;; --------------------------------------------- Time formatters ----------------------------------------------------
(defn- english-time-seconds [inner]
  (vec (concat [:hour-12-d ":" :minute-dd ":" :second-dd]
               inner
               [" " :am-pm])))

(def ^:private iso-time-seconds
  [:hour-24-dd ":" :minute-dd ":" :second-dd])

(def ^:private time-style-to-format
  {"h:mm A" {nil            (english-time-seconds [])
             "seconds"      (english-time-seconds [])
             "milliseconds" (english-time-seconds ["." :millisecond-ddd])}
   "HH:mm"  {nil            iso-time-seconds
             "seconds"      iso-time-seconds
             "milliseconds" (into iso-time-seconds ["." :millisecond-ddd])}})

(def ^:private fallback-iso-time
  [:hour-24-dd ":" :minute-dd ":" :second-dd])

(defn- time-format-for-options
  "The time format is resolved as follows:
  1. If a `:time-format` is provided as a string, look it up in [[constants/known-time-styles]], throwing if not found.
  2. If a `:time-format` is provided directly as a [[builder]] structure, use that.
  3. Check [[time-style-to-format]] for a supported `:time-style + :time-enabled` resolution pair.
  4. Look up `:time-style` in [[constants/known-time-styles]].
  5. Throw an exception, since the time style is unknown."
  [{:keys [time-enabled time-format time-style] :as options}]
  (or (and (string? time-format)
           (or (get constants/known-time-styles time-format)
               (throw (ex-info "Unknown time format" options))))
      time-format
      (get-in time-style-to-format [time-style time-enabled])
      (get constants/known-time-styles time-style)
      (do
        (log/warn "Unrecognized time style" {:time-style   time-style
                                             :time-enabled time-enabled})
        fallback-iso-time)))

;;; ------------------------------------- Custom formatters from options ---------------------------------------------
;; These are cached, since the formatter is always identical for the same options.

(defn- options->formatter*
  [{:keys [date-enabled time-enabled] :as options}]
  ;; TODO The original emits a console warning if the date-style is not in the overrides map. Reproduce that?
  (let [date-format (when date-enabled (date-format-for-options options))
        time-format (when time-enabled (time-format-for-options options))
        format-list (if (and date-format time-format)
                      (concat date-format [", "] time-format)
                      ;; At most one format is given; use that one.
                      ;; If neither is set, emit a warning and use ISO standard format.
                      (or date-format
                          time-format
                          (do
                            (log/warn "Unrecognized date/time format" options)
                            iso-format)))]
    (builder/->formatter format-list)))

(def ^:private options->formatter-cache (atom {}))

(defn options->formatter
  "Given the options map, this reduces it to a formatter function.
  Expects `date-style` and `time-style`, if provided, to be in the known set.
  If they're unknown, this logs a warning and defaults to a full ISO 8601 string format.
  If `date-style` or `time-style` are set to nil, that part will not be included.

  The options and corresponding formatters are cached indefinitely, since there are generally only a few dozen
  different sets of options, and from hundreds to many thousands of dates will be formatted in a typical session."
  [options]
  {:pre [(map? options)]} ;; options must be a Clojure map from date-options/prepare-options
  (if-let [fmt (get @options->formatter-cache options)]
    fmt
    (-> (swap! options->formatter-cache
               (fn [cache]
                 (if (contains? cache options)
                   cache
                   (assoc cache options (options->formatter* options)))))
        (get options))))
