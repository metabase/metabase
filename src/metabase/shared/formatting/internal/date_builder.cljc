(ns metabase.shared.formatting.internal.date-builder
  "The formatting strings are not standardized.
  Rather than wrangling with strings, this library defines a data structure for describing the format of
  date/time strings.

  A format is represented as a (JS or CLJS) list of keyword or string date fragments (`:year` or `\":day-of-month\"`).
  Literal strings, eg. /, -, and the \"Q\" of \"Q4 - 2022\" are simply strings that don't start with : - except for the
  literal string \":\" as a special case.

  Examples:
  - `[:year \"-\" :month-dd]` gives `\"2022-12\"`
  - `[\"Q\" \":quarter\" \" - \" \":year\"]` gives `\"Q4 - 2022\"`
  - `[:month-full-name]` gives `\"April\"`
  - `[:month-name]` gives `\"Apr\"`
  - `[:month-dd]` gives `\"04\"`"
  (:require
   [clojure.string :as str])
  #?(:clj (:import
           java.time.format.DateTimeFormatter)))

(def format-strings
  "This is the complete set of keys the formats can contain, mapped to the platform-specific magic string expected
  by Moment.js or java.time.format.DateTimeFormatter. Many are the same, but not all."
  {:year              #?(:cljs "YYYY" :clj "yyyy")  ; 2022
   :quarter           "Q"                           ; 2 ("Q2" etc. is added by higher level formatting)
   :month-full        "MMMM"                        ; April
   :month-short       "MMM"                         ; Apr
   :month-dd          "MM"                          ; 04
   :month-d           "M"                           ; 4
   :day-of-month-d    #?(:cljs "D"    :clj "d")     ; 6
   :day-of-month-dd   #?(:cljs "DD"   :clj "dd")    ; 06
   :day-of-week-full  #?(:cljs "dddd" :clj "EEEE")  ; Friday
   :day-of-week-short #?(:cljs "ddd"  :clj "EEE")   ; Fri
   :hour-24-dd        "HH"                          ; 17, 05
   :hour-24-d         "H"                           ; 17, 5
   :hour-12-dd        "hh"                          ; 05
   :hour-12-d         "h"                           ; 5
   :am-pm             #?(:cljs "A"    :clj "a")     ; AM
   :minute-d          "m"                           ; 7, 39
   :minute-dd         "mm"                          ; 07, 39
   :second-dd         "ss"                          ; 08, 45
   :millisecond-ddd   "SSS"                         ; 001, 423
   :day-of-year       #?(:cljs "DDD"  :clj "D")     ; 235
   :week-of-year      #?(:cljs "wo"   :clj "w")})   ; 34th in CLJS, 34 in CLJ. No ordinal numbers in Java.

(defn- format-string-literal [lit]
  #?(:cljs (str "[" lit "]")
     :clj  (str "'" (str/replace lit "'" "''") "'")))

(defn ->formatter
  "Given a data structure describing the date format, as given in [[format-strings]], return a function that takes a
  date object and formats it."
  [format-list]
  (let [js->clj   #?(:cljs js->clj :clj identity)
        parts     (for [fmt (js->clj format-list)]
                    (cond
                      (keyword? fmt)             (get format-strings fmt)
                      (= fmt ":")                (format-string-literal ":")
                      (str/starts-with? fmt ":") (-> fmt (subs 1) keyword format-strings)
                      (string? fmt)              (format-string-literal fmt)
                      :else                      (throw (ex-info "Unknown element of date format"
                                                                 {:bad-element fmt
                                                                  :format      format-list}))))
        fmt-str   (apply str parts)]
    #?(:cljs #(.format % fmt-str)
       :clj  (let [formatter (DateTimeFormatter/ofPattern fmt-str)]
               #(.format formatter %)))))
