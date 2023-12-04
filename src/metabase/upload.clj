(ns metabase.upload
  (:require
   [clj-bom.core :as bom]
   [clojure.data.csv :as csv]
   [clojure.java.io :as io]
   [clojure.string :as str]
   [flatland.ordered.map :as ordered-map]
   [flatland.ordered.set :as ordered-set]
   [java-time.api :as t]
   [metabase.driver :as driver]
   [metabase.mbql.util :as mbql.u]
   [metabase.models :refer [Database]]
   [metabase.public-settings :as public-settings]
   [metabase.upload.parsing :as upload-parsing]
   [metabase.util :as u]
   [metabase.util.i18n :refer [tru]]
   [toucan2.core :as t2])
  (:import
   (java.io File)))

(set! *warn-on-reflection* true)

;;;; <pre><code>
;;;;
;;;; +------------------+
;;;; | Schema detection |
;;;; +------------------+

;;              text
;;               |
;;               |
;;          varchar-255┐
;;              / \    │
;;             /   \   └──────────┬
;;            /     \             │
;;         float   datetime  offset-datetime
;;           │       │
;;           │       │
;;          int     date
;;         /   \
;;        /     \
;;    boolean auto-incrementing-int-pk
;;
;; </code></pre>

(def ^:private type->parent
  ;; listed in depth-first order
  {::text                     nil
   ::varchar-255              ::text
   ::float                    ::varchar-255
   ::int                      ::float
   ::auto-incrementing-int-pk ::int
   ::boolean                  ::int
   ::datetime                 ::varchar-255
   ::date                     ::datetime
   ::offset-datetime          ::varchar-255})

(def ^:private types
  (keys type->parent))

(def ^:private type->ancestors
  (into {} (for [type types]
             [type (loop [ret (ordered-set/ordered-set)
                          type type]
                     (if-some [parent (type->parent type)]
                       (recur (conj ret parent) parent)
                       ret))])))

;;;;;;;;;;;;;;;;;;;;;;;;;;
;; [[value->type]] helpers

(defn- with-parens
  "Returns a regex that matches the argument, with or without surrounding parentheses."
  [number-regex]
  (re-pattern (str "(" number-regex ")|(\\(" number-regex "\\))")))

(defn- with-currency
  "Returns a regex that matches a positive or negative number, including currency symbols"
  [number-regex]
  ;; currency signs can be all over: $2, -$2, $-2, 2€
  (re-pattern (str upload-parsing/currency-regex "?\\s*-?"
                   upload-parsing/currency-regex "?"
                   number-regex
                   "\\s*" upload-parsing/currency-regex "?")))

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

(defmacro does-not-throw?
  "Returns true if the given body does not throw an exception."
  [body]
  `(try
     ~body
     true
     (catch Throwable e#
       false)))

(defn- date-string? [s]
  (does-not-throw? (t/local-date s)))

(defn- datetime-string? [s]
  (does-not-throw? (upload-parsing/parse-datetime s)))

(defn- offset-datetime-string? [s]
  (does-not-throw? (upload-parsing/parse-offset-datetime s)))

(defn- boolean-string? [s]
  (boolean (re-matches #"(?i)true|t|yes|y|1|false|f|no|n|0" s)))

;; end [[value->type]] helpers
;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;

(defn- value->type
  "The most-specific possible type for a given value. Possibilities are:

    - `::boolean`
    - `::int`
    - `::float`
    - `::varchar-255`
    - `::date`
    - `::datetime`
    - `::offset-datetime`
    - `::text` (the catch-all type)

  NB: There are currently the following gotchas:
    1. ints/floats are assumed to use the separators and decimal points corresponding to the locale defined in the
       application settings
    2. 0 and 1 are assumed to be booleans, not ints."
  [value {:keys [number-separators] :as _settings}]
  (let [trimmed (str/trim value)]
    (cond
      (str/blank? value)                                        nil
      (boolean-string? trimmed)                                 ::boolean
      (offset-datetime-string? trimmed)                         ::offset-datetime
      (datetime-string? trimmed)                                ::datetime
      (date-string? trimmed)                                    ::date
      (re-matches (int-regex number-separators) trimmed)        ::int
      (re-matches (float-regex number-separators) trimmed)      ::float
      (<= (count trimmed) 255)                                  ::varchar-255
      :else                                                     ::text)))

(defn- row->types
  [row settings]
  (map #(value->type % settings) row))

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

(defn- map-with-nils
  "like map with two args except it continues to apply f until ALL of the colls are
  exhausted. if colls are of uneven length, nils are supplied."
  [f c1 c2]
  (lazy-seq
   (let [s1 (seq c1) s2 (seq c2)]
     (when (or s1 s2)
       (cons (f (first s1) (first s2))
             (map-with-nils f (rest s1) (rest s2)))))))

(defn- coalesce-types
  "compares types-a and types-b pairwise, finding the lowest-common-ancestor for each pair.
  types-a and types-b can be different lengths."
  [types-a types-b]
  (map-with-nils lowest-common-ancestor types-a types-b))

(defn- normalize-column-name
  [raw-name]
  (if (str/blank? raw-name)
    "unnamed_column"
    (u/slugify (str/trim raw-name))))

(def ^:private auto-pk-column-name
  "The name of the auto-incrementing PK column."
  "_mb_row_id")

(defn- remove-indices
  "Removes the elements at the given indices from the collection. Indices is a set."
  [indices coll]
  (keep-indexed (fn [idx item]
                  (when-not (contains? indices idx)
                    item))
                coll))

(defn- indices-where
  "Returns a lazy seq of the indices where the predicate is true."
  [pred coll]
  (keep-indexed (fn [idx item]
                  (when (pred item)
                    idx))
                coll))

(defn- parse-rows*
  "Returns a lazy seq of parsed rows, given a sequence of upload types for each column.
  Replaces empty strings with nil."
  [col-upload-types rows]
  (let [settings (upload-parsing/get-settings)
        parsers  (map #(upload-parsing/upload-type->parser % settings) col-upload-types)]
    (for [row rows]
      (for [[value parser] (map-with-nils vector row parsers)]
        (when (not (str/blank? value))
          (parser value))))))

(defn- rows->schema
  "Rows should be a lazy-seq. This function hides the logic for ignoring any columns in the CSV that have the same
  normalized name as the auto-pk-column-name."
  [header rows]
  (let [normalized-header (->> header
                               (map normalize-column-name))
        ;; remove columns from the rows with the same normalized name as the auto-pk-column-name
        auto-pk-col-indices (set (indices-where #(= auto-pk-column-name %) normalized-header))
        ;; this function removes the auto-pk columns from each row for parsing and type detection
        remove-auto-pk-cols (fn [row]
                              (remove-indices auto-pk-col-indices row))
        rows              (cond->> rows
                            (seq auto-pk-col-indices)
                            (map remove-auto-pk-cols))
        unique-header     (->> normalized-header
                               remove-auto-pk-cols
                               mbql.u/uniquify-names
                               (map keyword))
        column-count      (count normalized-header)
        settings          (upload-parsing/get-settings)
        col-name+type-pairs (->> rows
                                 (map #(row->types % settings))
                                 (reduce coalesce-types (repeat column-count nil))
                                 (map #(or % ::text))
                                 (map vector unique-header))]
    {:extant-columns    (ordered-map/ordered-map col-name+type-pairs)
     :generated-columns (ordered-map/ordered-map (keyword auto-pk-column-name) ::auto-incrementing-int-pk)
     :parse-rows        (fn [rows']
                          (let [rows' (cond->> rows'
                                       (seq auto-pk-col-indices)
                                       (map remove-auto-pk-cols))
                                col-types (map second col-name+type-pairs)]
                            (parse-rows* col-types rows')))}))


;;;; +------------------+
;;;; |  Parsing values  |
;;;; +------------------+

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

(defn- upload-type->col-specs
  [driver col->upload-type]
  (update-vals col->upload-type (partial driver/upload-type->database-type driver)))

(defn detect-schema
  "Consumes a CSV file that *must* have headers as the first row.

  Returns a map with three keys:
    - `:extant-columns`: an ordered map of columns found in the CSV file, excluding columns that have the same normalized name as the generated columns.
    - `:generated-columns`: an ordered map of columns we are generating ourselves. Currently, this is just the auto-incrementing PK.
    - `:parse-rows`: a function that takes a single lazy-seq of rows, and returns a lazy-seq of rows. It parses the
          string values in each row and removes columns that have the same normalized name as the generated columns.

  The value of `extant-columns` and `generated-columns` is an ordered map of normalized-column-name -> type for the
  given CSV file. Supported types include `::int`, `::datetime`, etc. A column that is completely blank is assumed to
  be of type ::text."
  [csv-file]
  (with-open [reader (bom/bom-reader csv-file)]
    (let [[header & rows] (csv/read-csv reader)]
      (rows->schema header (sample-rows rows)))))

(defn current-database
  "The database being used for uploads (as per the `uploads-database-id` setting)."
  []
  (t2/select-one Database :id (public-settings/uploads-database-id)))

(defn load-from-csv!
  "Loads a table from a CSV file. If the table already exists, it will throw an error.
   Returns the file size, number of rows, and number of columns."
  [driver db-id table-name ^File csv-file]
  (let [{:keys [extant-columns generated-columns parse-rows]} (detect-schema csv-file)
        cols->upload-type       (merge generated-columns extant-columns)
        col-to-create->col-spec (upload-type->col-specs driver cols->upload-type)
        csv-col-names           (keys extant-columns)]
    (driver/create-table! driver db-id table-name col-to-create->col-spec)
    (try
      (with-open [reader (io/reader csv-file)]
        (let [rows (->> (csv/read-csv reader)
                        (drop 1) ; drop header
                        parse-rows)]
          (driver/insert-into! driver db-id table-name csv-col-names rows)
          {:num-rows          (count rows)
           :num-columns       (count extant-columns)
           :generated-columns (count generated-columns)
           :size-mb           (/ (.length csv-file)
                                 1048576.0)}))
      (catch Throwable e
        (driver/drop-table! driver db-id table-name)
        (throw (ex-info (ex-message e) {:status-code 400}))))))
