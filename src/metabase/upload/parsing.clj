(ns metabase.upload.parsing
  (:require
   [clojure.string :as str]
   [java-time.api :as t]
   [metabase.public-settings :as public-settings]
   [metabase.util.i18n :refer [tru]])
  (:import
   (java.text NumberFormat ParsePosition)
   (java.time LocalDate)
   (java.time.format DateTimeFormatter DateTimeFormatterBuilder ResolverStyle)
   (java.util Locale)))

(set! *warn-on-reflection* true)

(def currency-regex "Supported currency signs" #"[$€£¥₹₪₩₿¢\s]")

(defn get-settings
  "Settings that determine how the CSV is parsed.

  Includes:
    - number-separators: Decimal delimiter defaults to `.` and group delimiter defaults to `,`. Stored/returned as a string."
  []
  {:number-separators (get-in (public-settings/custom-formatting) [:type/Number :number_separators] ".,")})

(defn- parse-bool
  "Parses a boolean value (true/t/yes/y/1 and false/f/no/n/0). Case-insensitive."
  [s]
  (cond
    (re-matches #"(?i)true|t|yes|y|1" s) true
    (re-matches #"(?i)false|f|no|n|0" s) false
    :else                                (throw (IllegalArgumentException.
                                                 (tru "''{0}'' is not a recognizable boolean" s)))))

(def local-date-patterns
  "patterns used to generate the local date formatter. Excludes ISO_LOCAL_DATE (uuuu-MM-dd) because there's
  already a built-in DateTimeFormatter for that: [[DateTimeFormatter/ISO_LOCAL_DATE]]"
  ;; uuuu is like yyyy but is required for strict parsing and also supports negative years for BC dates
  ;; see https://stackoverflow.com/questions/41103603/issue-with-datetimeparseexception-when-using-strict-resolver-style
  ;; uuuu is faster than using yyyy and setting a default era
  ["MMM d uuuu"         ; Jan 30 2000
   "MMM d, uuuu"        ; Jan 30, 2000
   "d MMM uuuu"         ; 30 Jan 2000
   "d MMM, uuuu"        ; 30 Jan, 2000
   "MMMM d uuuu"        ; January 30 2000
   "MMMM d, uuuu"       ; January 30, 2000
   "d MMMM uuuu"        ; 30 January 2000
   "d MMMM, uuuu"       ; 30 January, 2000
   "EEEE, MMMM d uuuu"  ; Sunday, January 30 2000
   "EEEE, MMMM d, uuuu" ; Sunday, January 30, 2000
   ])

(def local-date-formatter
  "DateTimeFormatter that runs through a set of patterns to parse a variety of local date formats."
  (let [builder (-> (DateTimeFormatterBuilder.)
                    (.parseCaseInsensitive))]
    (doseq [pattern local-date-patterns]
      (.appendOptional builder (DateTimeFormatter/ofPattern pattern)))
    (-> builder
        (.appendOptional DateTimeFormatter/ISO_LOCAL_DATE)
        (.toFormatter)
        (.withResolverStyle ResolverStyle/STRICT))))

(defn parse-local-date
  "Parses a local date string.

  Supported formats:
    - yyyy-MM-dd
    - MMM d yyyy
    - MMM d, yyyy
    - d MMM yyyy
    - d MMM, yyyy
    - MMMM d yyyy
    - MMMM d, yyyy
    - d MMMM yyyy
    - d MMMM, yyyy"
  [s]
  (try
    (LocalDate/parse s local-date-formatter)
    (catch Exception _
      (throw (IllegalArgumentException.
              (tru "''{0}'' is not a recognizable date" s))))))

(defn parse-local-datetime
  "Parses a string representing a local datetime into a LocalDateTime.

  Supported formats:
    - yyyy-MM-dd'T'HH:mm
    - yyyy-MM-dd'T'HH:mm:ss
    - yyyy-MM-dd'T'HH:mm:ss.SSS (and any other number of S's)
    - the above formats, with a space instead of a 'T'

  Parsing is case-insensitive."
  [s]
  (-> s (str/replace \space \T) t/local-date-time))

(defn- parse-as-datetime
  "Parses a string `s` as a LocalDateTime. Supports all the formats for [[parse-local-date]] and [[parse-datetime]]."
  [s]
  (try
    (t/local-date-time (parse-local-date s) (t/local-time "00:00:00"))
    (catch Exception _
      (try
        (parse-local-datetime s)
        (catch Exception _
          (throw (IllegalArgumentException.
                  (tru "''{0}'' is not a recognizable datetime" s))))))))

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
    (catch Exception _
      (throw (IllegalArgumentException. (tru "''{0}'' is not a recognizable zoned datetime" s))))))

(defn- remove-currency-signs
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
          parse-pos         (ParsePosition. 0)
          parsed-number     (case number-separators
                              ("." ".,") (. us parse deparenthesized-s parse-pos)
                              ",."       (. de parse deparenthesized-s parse-pos)
                              ", "       (. fr parse (str/replace deparenthesized-s \space \u00A0) parse-pos) ; \u00A0 is a non-breaking space
                              ".’"       (. ch parse deparenthesized-s parse-pos))]
      (let [parsed-idx (.getIndex parse-pos)]
        (when-not (= parsed-idx (count deparenthesized-s))
          (throw (ex-info "Unexpected trailing characters - this is probably not a number"
                          {:full-string    s
                           :parsed-number  parsed-number
                           :parsed-string  (.substring deparenthesized-s 0 parsed-idx)
                           :ignored-string (.substring deparenthesized-s parsed-idx)}))))
      (if has-parens?
        ;; By casting to double we ensure that the sign is preserved for 0.0
        (- (double parsed-number))
        parsed-number))))

(defn- parse-number
  "Parse an integer or float"
  [number-separators s]
  (try
    (->> s
         (str/trim)
         (remove-currency-signs)
         (parse-plain-number number-separators))
    (catch Exception e
      (throw (IllegalArgumentException. (tru "''{0}'' is not a recognizable number" s) e)))))

(defn- parse-as-biginteger
  "Parses a string representing a number as a java.math.BigInteger, rounding down if necessary."
  [number-separators s]
  (let [n (parse-number number-separators s)]
    (when-not (zero? (mod n 1))
      (throw (IllegalArgumentException. (tru "''{0}'' is not an integer" s))))
    (biginteger n)))

(defmulti upload-type->parser
  "Returns a function for the given `metabase.upload` column type that will parse a string value (from a CSV) into a value
  suitable for insertion."
  {:arglists '([upload-type settings])}
  (fn [upload-type _]
    upload-type))

(defmethod upload-type->parser :metabase.upload.types/varchar-255
  [_ _]
  identity)

(defmethod upload-type->parser :metabase.upload.types/text
  [_ _]
  identity)

(defmethod upload-type->parser :metabase.upload.types/int
  [_ {:keys [number-separators]}]
  (partial parse-as-biginteger number-separators))

(defmethod upload-type->parser :metabase.upload.types/float
  [_ {:keys [number-separators]}]
  (partial parse-number number-separators))

(defmethod upload-type->parser :metabase.upload.types/auto-incrementing-int-pk
  [_ {:keys [number-separators]}]
  (partial parse-as-biginteger number-separators))

(defmethod upload-type->parser :metabase.upload.types/boolean
  [_ _]
  (comp
   parse-bool
   str/trim))

(defmethod upload-type->parser :metabase.upload.types/date
  [_ _]
  (comp
   parse-local-date
   str/trim))

(defmethod upload-type->parser :metabase.upload.types/datetime
  [_ _]
  (comp
   parse-as-datetime
   str/trim))

(defmethod upload-type->parser :metabase.upload.types/offset-datetime
  [_ _]
  (comp
   parse-offset-datetime
   str/trim))
