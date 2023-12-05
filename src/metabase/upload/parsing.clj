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

(defn get-settings
  "Settings that determine how the CSV is parsed.

  Includes:
    - number-separators: Decimal delimiter defaults to `.` and group delimiter defaults to `,`. Stored/returned as a string."
  []
  {:number-separators (get-in (public-settings/custom-formatting) [:type/Number :number_separators] ".,")})

(defn parse-bool
  "Parses a boolean value (true/t/yes/y/1 and false/f/no/n/0). Case-insensitive."
  [s]
  (cond
    (re-matches #"(?i)true|t|yes|y|1" s) true
    (re-matches #"(?i)false|f|no|n|0" s) false
    :else                                (throw (IllegalArgumentException.
                                                 (tru "{0} is not a recognizable boolean" s)))))

(defn parse-date
  "Parses a date.

  Supported formats:
    - yyyy-MM-dd"
  [s]
  (t/local-date s))

(defn parse-datetime
  "Parses a string representing a local datetime into a LocalDateTime.

  Supported formats:
    - yyyy-MM-dd'T'HH:mm
    - yyyy-MM-dd'T'HH:mm:ss
    - yyyy-MM-dd'T'HH:mm:ss.SSS (and any other number of S's)
    - the above formats, with a space instead of a 'T'

  Parsing is case-insensitive."
  [s]
  (-> s (str/replace \space \T) t/local-date-time))

(defn parse-as-datetime
  "Parses a string `s` as a LocalDateTime. Supports all the formats for [[parse-date]] and [[parse-datetime]]."
  [s]
  (try
    (t/local-date-time (parse-date s) (t/local-time "00:00:00"))
    (catch Exception _
      (try
        (parse-datetime s)
        (catch Exception _
          (throw (IllegalArgumentException.
                  (tru "{0} is not a recognizable datetime" s))))))))

(defn parse-offset-datetime
  "Parses a string representing an offset datetime into an OffsetDateTime.

  The format consists of:
    1) The a date and time, with the formats:
      - yyyy-MM-dd'T'HH:mm
      - yyyy-MM-dd'T'HH:mm:ss
      - yyyy-MM-dd'T'HH:mm:ss.SSS (and any other number of S's)
      - the above formats, with a space instead of a 'T'
    2) An offset, with the formats:
      - Z (for UTC)
      - +HH or -HH
      - +HH:mm or -HH:mm
      - +HH:mm:ss or -HH:mm:ss

  Parsing is case-insensitive."
  [s]
  (try
    (-> s (str/replace \space \T) t/offset-date-time)
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
  {:arglists '([upload-type settings])}
  (fn [upload-type _]
    upload-type))

(defmethod upload-type->parser :metabase.upload/varchar-255
  [_ _]
  identity)

(defmethod upload-type->parser :metabase.upload/text
  [_ _]
  identity)

(defmethod upload-type->parser :metabase.upload/int
  [_ {:keys [number-separators]}]
  (partial parse-number number-separators))

(defmethod upload-type->parser :metabase.upload/float
  [_ {:keys [number-separators]}]
  (partial parse-number number-separators))

(defmethod upload-type->parser :metabase.upload/auto-incrementing-int-pk
  [_ {:keys [number-separators]}]
  (partial parse-number number-separators))

(defmethod upload-type->parser :metabase.upload/boolean
  [_ _]
  (comp
   parse-bool
   str/trim))

(defmethod upload-type->parser :metabase.upload/date
  [_ _]
  (comp
   parse-date
   str/trim))

(defmethod upload-type->parser :metabase.upload/datetime
  [_ _]
  (comp
   parse-as-datetime
   str/trim))

(defmethod upload-type->parser :metabase.upload/offset-datetime
  [_ _]
  (comp
   parse-offset-datetime
   str/trim))
