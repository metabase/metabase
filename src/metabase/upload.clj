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

(def auto-pk-column-name
  "The name of the auto-incrementing PK column."
  :_mb_row_id)

(defn- ->ordered-maps-with-pk-column
  "Sets appropriate type information on the first PK column it finds, otherwise adds a new one.

  Returns a *map* with two keys: `:extant-columns` and `:generated-columns`."
  [name-type-pairs]
  {:extant-columns    (ordered-map/ordered-map name-type-pairs)
   :generated-columns (ordered-map/ordered-map auto-pk-column-name ::auto-incrementing-int-pk)})

(defn- rows->schema
  "rows should be a lazy-seq"
  [header rows]
  (let [normalized-header (->> header
                               (map normalize-column-name)
                               (mbql.u/uniquify-names)
                               (map keyword))
        column-count      (count normalized-header)
        settings          (upload-parsing/get-settings)]
    (->> rows
         (map #(row->types % settings))
         (reduce coalesce-types (repeat column-count nil))
         (map #(or % ::text))
         (map vector normalized-header)
         (->ordered-maps-with-pk-column))))


;;;; +------------------+
;;;; |  Parsing values  |
;;;; +------------------+

(defn- parse-rows
  "Returns a lazy seq of parsed rows from the `reader`. Replaces empty strings with nil."
  [col->upload-type rows]
  (let [settings (upload-parsing/get-settings)
        parsers  (map #(upload-parsing/upload-type->parser % settings) (vals col->upload-type))]
    (for [row rows]
      (for [[value parser] (map-with-nils vector row parsers)]
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

(defn- upload-type->col-specs
  [driver col->upload-type]
  (update-vals col->upload-type (partial driver/upload-type->database-type driver)))

(defn detect-schema
  "Returns a map with two keys: `:extant-columns` (columns found in the CSV file) and `:generated-columns` (columns we
  are adding ourselves). The value of each is an ordered map of `normalized-column-name -> type` for the given CSV
  file. The CSV file *must* have headers as the first row. Supported types include `::int`, `::datetime`, etc.

  A column that is completely blank is assumed to be of type ::text."
  [csv-file]
  (with-open [reader (bom/bom-reader csv-file)]
    (let [[header & rows] (csv/read-csv reader)]
      (rows->schema header (sample-rows rows)))))

(defn current-database
  "The database being used for uploads (as per the `uploads-database-id` setting)."
  []
  (t2/select-one Database :id (public-settings/uploads-database-id)))

(defn- drop-nth [coll n]
  (concat (take n coll) (drop (inc n) coll)))

(defn load-from-csv!
  "Loads a table from a CSV file. If the table already exists, it will throw an error.
   Returns the file size, number of rows, and number of columns."
  [driver db-id table-name ^File csv-file]
  (let [{col-to-insert->upload-type :extant-columns
         gen-col->upload-type       :generated-columns} (detect-schema csv-file)
        cols->upload-type       (merge col-to-insert->upload-type gen-col->upload-type)
        col-to-create->col-spec (upload-type->col-specs driver cols->upload-type)
        csv-col-names           (keys col-to-insert->upload-type)
        [auto-pk-match-index _]
        (first (keep-indexed (fn [idx col-name]
                               (when (= (normalize-column-name (name col-name)) (name auto-pk-column-name))
                                 [idx col-name]))
                             csv-col-names))]
    (driver/create-table! driver db-id table-name col-to-create->col-spec)
    (try
      (with-open [reader (io/reader csv-file)]
        (let [rows (->> (csv/read-csv reader)
                        (drop 1) ; drop header
                        (parse-rows col-to-insert->upload-type))
              rows (cond->> rows
                     auto-pk-match-index
                     (map #(drop-nth % auto-pk-match-index)))
              csv-col-names (cond-> csv-col-names
                              auto-pk-match-index
                              (drop-nth auto-pk-match-index))]
          (driver/insert-into! driver db-id table-name csv-col-names rows)
          {:num-rows          (count rows)
           :num-columns       (count csv-col-names)
           :generated-columns (- (count col-to-create->col-spec)
                                 (count col-to-insert->upload-type))
           :size-mb           (/ (.length csv-file)
                                 1048576.0)}))
      (catch Throwable e
        (driver/drop-table! driver db-id table-name)
        (throw (ex-info (ex-message e) {:status-code 400}))))))
