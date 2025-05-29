(ns metabase.util.formatting.constants)

(defn abbreviated?
  "Months and weekdays should be abbreviated for `compact` output."
  [{:keys [output-density]}]
  (= output-density "compact"))

(def default-date-style
  "The default date style, used in a few places in the JS code as well as by this formatting library."
  "MMMM D, YYYY")

(def default-time-style
  "The default time style, used in a few places in the JS code as well as by this formatting library."
  "h:mm A")

(def known-date-styles
  "A map of string patterns for dates, to functions from options to the data structures consumed by
  [[metabase.util.formatting.internal.date-builder]].

  Prefer passing the data structure directly, or use `:date_style`."
  {"M/D/YYYY"           [:month-d "/" :day-of-month-d "/" :year]
   "D/M/YYYY"           [:day-of-month-d "/" :month-d "/" :year]
   "YYYY/M/D"           [:year "/" :month-d "/" :day-of-month-d]
   "MMMM D, YYYY"       [:month-full " " :day-of-month-d ", " :year]
   "D MMMM, YYYY"       [:day-of-month-d " " :month-full ", " :year]
   "dddd, MMMM D, YYYY" [:day-of-week-full ", " :month-full " " :day-of-month-d ", " :year]})

(def known-time-styles
  "A table of string patterns for dates to the data structures consumed by
  [[metabase.util.formatting.internal.date-builder]].

  Don't rely on these - prefer passing the data structure directly, or use `:date_style`."
  {"h:mm A" [:hour-12-d  ":" :minute-dd " " :am-pm]
   "HH:mm"  [:hour-24-dd ":" :minute-dd]
   "HH"     [:hour-24-dd]})

(def known-datetime-styles
  "A table of string patterns for datetimes to the data structures consumed by
  [[metabase.util.formatting.internal.date-builder]].

  Don't rely on these - prefer passing the data structure directly, or use `:date_style`."
  {"M/D/YYYY, h:mm A" {:date-format (get known-date-styles "M/D/YYYY")
                       :time-format (get known-time-styles "h:mm A")}})
