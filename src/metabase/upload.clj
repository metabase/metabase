(ns metabase.upload
  (:require
   [clj-bom.core :as bom]
   [clojure.data.csv :as csv]
   [clojure.java.io :as io]
   [clojure.set :as set]
   [clojure.string :as str]
   [flatland.ordered.map :as ordered-map]
   [flatland.ordered.set :as ordered-set]
   [java-time :as t]
   [metabase.driver :as driver]
   [metabase.mbql.util :as mbql.u]
   [metabase.public-settings :as public-settings]
   [metabase.search.util :as search-util]
   [metabase.util :as u]
   [metabase.util.i18n :refer [tru]])
  (:import
   (java.io File)
   (java.text NumberFormat)
   (java.util Locale)))

(set! *warn-on-reflection* true)

;;;; +------------------+
;;;; | Schema detection |
;;;; +------------------+

;;              text
;;               |
;;               |
;;          varchar_255
;;              / \
;;             /   \
;;            /     \
;;         float   datetime
;;           |       |
;;           |       |
;;          int    date
;;         /   \
;;        /     \
;;      pk     boolean

(def ^:private type->parent
  ;; listed in depth-first order
  {::varchar_255 ::text
   ::float       ::varchar_255
   ::int         ::float
   ::pk          ::int
   ::boolean     ::int
   ::datetime    ::varchar_255
   ::date        ::datetime})

(def ^:private types
  (set/union (set (keys type->parent))
             (set (vals type->parent))))

(def ^:private type->ancestors
  (into {} (for [type types]
             [type (loop [ret (ordered-set/ordered-set)
                          type type]
                     (if-let [parent (type->parent type)]
                       (recur (conj ret parent) parent)
                       ret))])))

(defn- date-string? [s]
  (try (t/local-date s)
       true
       (catch Exception _
         false)))

(defn- datetime-string? [s]
  (try (t/local-date-time s)
       true
       (catch Exception _
         false)))

(def ^:private currency-regex "Supported currency signs" #"[$€£¥₹₪₩₿¢\s]")

(defn- with-parens
  "Returns a regex that matches the argument, with or without surrounding parentheses."
  [number-regex]
  (re-pattern (str "(" number-regex ")|(\\(" number-regex "\\))")))

(defn- with-currency
  "Returns a regex that matches a positive or negative number, including currency symbols"
  [number-regex]
  ;; currency signs can be all over: $2, -$2, $-2, 2€
  (re-pattern (str currency-regex "?\\s*-?"
                   currency-regex "?"
                   number-regex
                   "\\s*" currency-regex "?")))

(defn- get-number-separators []
  (get-in (public-settings/custom-formatting) [:type/Number :number_separators] ".,"))

(defn- int-regex [number-separators]
  (with-parens
    (with-currency
      (case number-separators
        ("." ".,") #"\d[\d,]*"
        ",." #"\d[\d.]*"
        ", " #"\d[\d \u00A0]*"
        ".’" #"\d[\d’]*"))))

(defn- float-regex [number-separators]
  (with-parens
    (with-currency
      (case number-separators
        ("." ".,") #"\d[\d,]*\.\d+"
        ",." #"\d[\d.]*\,[\d]+"
        ", " #"\d[\d \u00A0]*\,[\d.]+"
        ".’" #"\d[\d’]*\.[\d.]+"))))

(defn value->type
  "The most-specific possible type for a given value. Possibilities are:
    - ::boolean
    - ::int
    - ::float
    - ::varchar_255
    - ::text
    - ::date
    - ::datetime
    - nil, in which case other functions are expected to replace it with ::text as the catch-all type

  NB: There are currently the following gotchas:
    1. ints/floats are assumed to use the separators and decimal points corresponding to the locale defined in the
       application settings
    2. 0 and 1 are assumed to be booleans, not ints."
  [value]
  (let [number-separators (get-number-separators)]
    (cond
      (str/blank? value)                                      nil
      (re-matches #"(?i)true|t|yes|y|1|false|f|no|n|0" value) ::boolean
      (datetime-string? value)                                ::datetime
      (date-string? value)                                    ::date
      (re-matches (int-regex number-separators) value)        ::int
      (re-matches (float-regex number-separators) value)      ::float
      (re-matches #".{1,255}" value)                          ::varchar_255
      :else                                                   ::text)))

(defn- row->types
  [row]
  (map (comp value->type search-util/normalize) row))

(defn- lowest-common-member [[x & xs :as all-xs] ys]
  (cond
    (empty? all-xs)  (throw (IllegalArgumentException. (tru "Could not find a common type for {0} and {1}" all-xs ys)))
    (contains? ys x) x
    :else            (recur xs ys)))

(defn- lowest-common-ancestor [type-a type-b]
  (cond
    (nil? type-a) type-b
    (nil? type-b) type-a
    (= type-a type-b) type-a
    (contains? (type->ancestors type-a) type-b) type-b
    (contains? (type->ancestors type-b) type-a) type-a
    :else (lowest-common-member (type->ancestors type-a) (type->ancestors type-b))))

(defn- coalesce-types
  [types-so-far new-types]
  (->> (map vector types-so-far new-types)
       (mapv (partial apply lowest-common-ancestor))))

(defn- pad
  "Lengthen `values` until it is of length `n` by filling it with nils."
  [n values]
  (first (partition n n (repeat nil) values)))

(defn- normalize-column-name
  [raw-name]
  (if (str/blank? raw-name)
    "unnamed_column"
    (u/slugify (str/trim raw-name))))

(defn- is-pk?
  [[col-name type]]
  (and (#{"id" "pk"} (u/lower-case-en (name col-name)))
       (isa? type ::int)))

(defn- add-pk-column
  "Adds driver-specific auto-increment and non-nil/PK constraints to the first ID/PK column it finds; otherwise prepends
  a new ID column to the columns list."
  [driver name-type-pairs]
  (let [found-it   (atom false)
        pked-pairs (doall (map (fn [[name _type :as p]]
                                 (if (and (not @found-it)
                                          (is-pk? p))
                                   (do (reset! found-it true)
                                       [(keyword name) {:type ::pk :opts (driver/pk-options driver)}])
                                   p))
                               name-type-pairs))]
    (if @found-it ;; we already have a PK, just return them
      pked-pairs
      ;;otherwise, prepend a new ID column
      (cons [:id {:type ::pk :opts (driver/pk-options driver) :exclude-in-insert? true}]
            name-type-pairs))))

(defn- upload-type->column-spec
  "Converts our internal types (e.g., ::int) to the type expected by the database as a HoneySQL
  keyword (e.g., :biginteger). However, the returned type is *always* a vector since there may be additional HoneySQL
  options included. Sample return values:

    - [:text]
    - [[:varchar 255]]
    - [:int :autoincrement [:not nil]]"
  [driver type-or-type-map]
  (if (map? type-or-type-map)
    (let [{the-type :type opts :opts} type-or-type-map]
      (vec (cons (driver/upload-type->database-type driver the-type) opts)))
    [(driver/upload-type->database-type driver type-or-type-map)]))

(defn- rows->schema
  [driver header rows]
  (let [normalized-header (->> header
                               (map normalize-column-name)
                               (mbql.u/uniquify-names)
                               (map keyword))
        column-count      (count normalized-header)]
    (->> rows
         (map row->types)
         (map (partial pad column-count))
         (reduce coalesce-types (repeat column-count nil))
         (map #(or % ::text))
         (map vector normalized-header)
         (add-pk-column driver)
         (ordered-map/ordered-map))))

;;;; +------------------+
;;;; |  Parsing values  |
;;;; +------------------+

(defn- parse-bool
  [s]
  (cond
    (re-matches #"(?i)true|t|yes|y|1" s) true
    (re-matches #"(?i)false|f|no|n|0" s) false
    :else                                (throw (IllegalArgumentException.
                                                 (tru "{0} is not a recognizable boolean" s)))))

(defn- parse-date
  [s]
  (t/local-date s))

(defn- parse-datetime
  [s]
  (cond
    (date-string? s)     (t/local-date-time (t/local-date s) (t/local-time "00:00:00"))
    (datetime-string? s) (t/local-date-time s)
    :else                (throw (IllegalArgumentException.
                                 (tru "{0} is not a recognizable datetime" s)))))

(defn- remove-currency-signs
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

(defn- parse-number
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

(defn- upload-type->parser [upload-type]
  (case (or (:type upload-type) upload-type)
    ::varchar_255 identity
    ::text        identity
    ::int         (partial parse-number (get-number-separators))
    ::float       (partial parse-number (get-number-separators))
    ::pk          (partial parse-number (get-number-separators))
    ::boolean     #(parse-bool (str/trim %))
    ::date        #(parse-date (str/trim %))
    ::datetime    #(parse-datetime (str/trim %))))

(defn- parsed-rows
  "Returns a lazy seq of parsed rows from the `reader`.
   Replaces empty strings with nil."
  [col->upload-type reader]
  (let [[header & rows] (csv/read-csv reader)
        column-count    (count header)
        parsers         (map upload-type->parser (vals col->upload-type))]
    (for [row rows]
      (for [[value parser] (map vector (pad column-count row) parsers)]
        (when (not (str/blank? value))
          (parser value))))))

;;;; +------------------+
;;;; | Public Functions |
;;;; +------------------+

(defn unique-table-name
  "Append the current datetime to the given name to create a unique table name. The resulting name will be short enough for the given driver (truncating the supplised `table-name` if necessary)."
  [driver table-name]
  (let [time-format                 "_yyyyMMddHHmmss"
        acceptable-length           (min (count table-name)
                                         (- (driver/table-name-length-limit driver) (count time-format)))
        truncated-name-without-time (subs (u/slugify table-name) 0 acceptable-length)]
    (str truncated-name-without-time
         (t/format time-format (t/local-date-time)))))

(def ^:private max-sample-rows "Maximum number of values to use for detecting a column's type" 1000)

(defn- sample-rows
  "Returns an improper subset of the rows no longer than [[max-sample-rows]]. Takes an evenly-distributed sample (not
  just the first n)."
  [rows]
  (take max-sample-rows
        (take-nth (max 1
                       (long (/ (count rows)
                                max-sample-rows)))
                  rows)))

(defn detect-schema
  "Returns an ordered map of `normalized-column-name -> type` for the given CSV file. The CSV file *must* have headers as the
  first row. Supported types are:

    - ::int
    - ::float
    - ::boolean
    - ::varchar_255
    - ::text
    - ::date
    - ::datetime
    - ::pk

  A column that is completely blank is assumed to be of type ::text."
  [driver csv-file]
  (with-open [reader (bom/bom-reader csv-file)]
    (let [[header & rows] (csv/read-csv reader)]
      (rows->schema driver header (sample-rows rows)))))

(defn load-from-csv!
  "Loads a table from a CSV file. If the table already exists, it will throw an error.
   Returns the file size, number of rows, and number of columns."
  [driver db-id table-name ^File csv-file]
  (let [col->upload-type               (detect-schema driver csv-file)
        col->column-spec               (update-vals col->upload-type (partial upload-type->column-spec driver))
        columns-to-insert->upload-type (->> col->upload-type
                                            (filter (fn [[_col-name upload-type]]
                                                      (not (:exclude-in-insert? upload-type))))
                                            (ordered-map/ordered-map))
        column-names                   (keys columns-to-insert->upload-type)]
    (driver/create-table! driver db-id table-name col->column-spec)
    (try
      (with-open [reader (io/reader csv-file)]
        (let [rows (parsed-rows columns-to-insert->upload-type reader)]
          (driver/insert-into! driver db-id table-name column-names rows)
          {:num-rows    (count rows)
           :num-columns (count column-names)
           :size-mb     (/ (.length csv-file) 1048576.0)}))
      (catch Throwable e
        (driver/drop-table! driver db-id table-name)
        (throw (ex-info (ex-message e) {:status-code 400}))))))
