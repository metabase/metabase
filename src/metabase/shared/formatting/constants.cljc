(ns metabase.shared.formatting.constants
  #?(:cljs (:require
            [metabase.shared.formatting.internal.date-builder :as builder])))

(defn abbreviated?
  "Months and weekdays should be abbreviated for `compact` output."
  [{:keys [output-density]}]
  (= output-density "compact"))

(defn condense-ranges?
  "For `compact` and `condensed` output, ranges should be shortened if they're in the same month or year.
  Eg. `January 8 - 15, 2022`, or `January 28 - February 4, 2022`."
  [{:keys [output-density]}]
  (#{"compact" "condensed"} output-density))

(def ^:export default-date-style
  "The default date style, used in a few places in the JS code as well as by this formatting library."
  "MMMM D, YYYY")

(def ^:export default-time-style
  "The default time style, used in a few places in the JS code as well as by this formatting library."
  "h:mm A")

(def ^:export known-date-styles
  "A map of string patterns for dates, to functions from options to the data structures consumed by
  [[metabase.shared.formatting.internal.date-builder]].

  Prefer passing the data structure directly, or use `:date_style`."
  {"M/D/YYYY"           [:month-d "/" :day-of-month-d "/" :year]
   "D/M/YYYY"           [:day-of-month-d "/" :month-d "/" :year]
   "YYYY/M/D"           [:year "/" :month-d "/" :day-of-month-d]
   "MMMM D, YYYY"       [:month-full " " :day-of-month-d ", " :year]
   "D MMMM, YYYY"       [:day-of-month-d " " :month-full ", " :year]
   "dddd, MMMM D, YYYY" [:day-of-week-full ", " :month-full " " :day-of-month-d ", " :year]})

(def ^:export known-time-styles
  "A table of string patterns for dates to the data structures consumed by
  [[metabase.shared.formatting.internal.date-builder]].

  Don't rely on these - prefer passing the data structure directly, or use `:date_style`."
  {"h:mm A" [:hour-12-d  ":" :minute-dd " " :am-pm]
   "HH:mm"  [:hour-24-dd ":" :minute-dd]
   "HH"     [:hour-24-dd]})

(def ^:export known-datetime-styles
  "A table of string patterns for datetimes to the data structures consumed by
  [[metabase.shared.formatting.internal.date-builder]].

  Don't rely on these - prefer passing the data structure directly, or use `:date_style`."
  {"M/D/YYYY, h:mm A" {:date-format (get known-date-styles "M/D/YYYY")
                       :time-format (get known-time-styles "h:mm A")}})

#?(:cljs
   (do
     (defn- basic-map [m]
       (-> m (update-vals (constantly 1)) clj->js))

     (def ^:export known-date-styles-js
       "Vanilla JS object version of [[known-date-styles]] that can be used with keyof in TS."
       (basic-map known-date-styles))

     (def ^:export known-datetime-styles-js
       "Vanilla JS object version of [[known-datetime-formats]] that can be used with keyof in TS."
       (basic-map known-datetime-styles))

     (def ^:export known-time-styles-js
       "Vanilla JS object version of [[known-time-formats]] that can be used with keyof in TS."
       (basic-map known-time-styles))

     (def ^:export format-strings-js
       "Vanilla JS object version of [[builder/format-strings]] that can be used with keyof in TS."
       (basic-map builder/format-strings))))
