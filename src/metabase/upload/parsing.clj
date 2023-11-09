(ns metabase.upload.parsing
  (:require
   [clojure.string :as str]
   [java-time.api :as t]
   [metabase.public-settings :as public-settings]
   [metabase.util.i18n :refer [tru]])
  (:import
   (java.text NumberFormat)
   (java.util Locale)))

(set! *warn-on-reflection* true)

(def currency-regex "Supported currency signs" #"[$€£¥₹₪₩₿¢\s]")

(defn get-number-separators
  "Setting-dependent number separators. Defaults to `.` and `,`. Stored/returned as a string."
  []
  (get-in (public-settings/custom-formatting) [:type/Number :number_separators] ".,"))

(defn parse-bool
  "Parses a boolean value (true/t/yes/y/1 and false/f/no/n/0). Case-insensitive."
  [s]
  (cond
    (re-matches #"(?i)true|t|yes|y|1" s) true
    (re-matches #"(?i)false|f|no|n|0" s) false
    :else                                (throw (IllegalArgumentException.
                                                 (tru "{0} is not a recognizable boolean" s)))))

(defn parse-date
  "Parses a date."
  [s]
  (t/local-date s))

(defn parse-datetime
  "Parses a datetime (without timezone)."
  [s]
  (try
    (t/local-date-time (t/local-date s) (t/local-time "00:00:00"))
    (catch Exception _
      (try
        (t/local-date-time s)
        (catch Exception _
          (throw (IllegalArgumentException.
                  (tru "{0} is not a recognizable datetime" s))))))))

(defn parse-offset-datetime
  "Parses a datetime (with offset)."
  [s]
  (try
    (t/offset-date-time s)
    (catch Exception e
      (throw (IllegalArgumentException. (tru "{0} is not a recognizable zoned datetime" s) e)))))

(defn remove-currency-signs
  "Remove any recognized currency signs from the string (c.f. [[currency-regex]])."
  [s]
  (str/replace s currency-regex ""))

(let [us (NumberFormat/getInstance (Locale. "en" "US"))
      de (NumberFormat/getInstance (Locale. "de" "DE"))
      fr (NumberFormat/getInstance (Locale. "fr" "FR"))
      ch (NumberFormat/getInstance (Locale. "de" "CH"))]
  (defn- parse-plain-number [number-separators s]
    (let [has-parens?       (re-matches #"\(.*\)" s)
          deparenthesized-s (str/replace s #"[()]" "")
          parsed-number     (case number-separators
                              ("." ".,") (. us parse deparenthesized-s)
                              ",."       (. de parse deparenthesized-s)
                              ", "       (. fr parse (str/replace deparenthesized-s \space \u00A0)) ; \u00A0 is a non-breaking space
                              ".’"       (. ch parse deparenthesized-s))]
      (if has-parens?
        (- parsed-number)
        parsed-number))))

(defn parse-number
  "Parse an integer or float"
  [number-separators s]
  (try
    (->> s
         (str/trim)
         (remove-currency-signs)
         (parse-plain-number number-separators))
    (catch Throwable e
      (throw (ex-info
              (tru "{0} is not a recognizable number" s)
              {}
              e)))))

(defmulti upload-type->parser
  "Returns a function for the given `metabase.upload` type that will parse a string value (from a CSV) into a value
  suitable for insertion."
  {:arglists '([upload-type])}
  identity)

(defmethod upload-type->parser :metabase.upload/varchar-255
  [_]
  identity)

(defmethod upload-type->parser :metabase.upload/text
  [_]
  identity)

(defmethod upload-type->parser :metabase.upload/int
  [_]
  (partial parse-number (get-number-separators)))

(defmethod upload-type->parser :metabase.upload/float
  [_]
  (partial parse-number (get-number-separators)))

(defmethod upload-type->parser :metabase.upload/int-pk
  [_]
  (partial parse-number (get-number-separators)))

(defmethod upload-type->parser :metabase.upload/auto-incrementing-int-pk
  [_]
  (partial parse-number (get-number-separators)))

(defmethod upload-type->parser :metabase.upload/string-pk
  [_]
  identity)

(defmethod upload-type->parser :metabase.upload/boolean
  [_]
  (comp
   parse-bool
   str/trim))

(defmethod upload-type->parser :metabase.upload/date
  [_]
  (comp
   parse-date
   str/trim))

(defmethod upload-type->parser :metabase.upload/datetime
  [_]
  (comp
   parse-datetime
   str/trim))

(defmethod upload-type->parser :metabase.upload/offset-datetime
  [_]
  (comp
   parse-offset-datetime
   str/trim))
