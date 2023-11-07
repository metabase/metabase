(ns metabase.upload
  (:require
   [clj-bom.core :as bom]
   [clojure.data.csv :as csv]
   [clojure.java.io :as io]
   [clojure.set :as set]
   [clojure.string :as str]
   [flatland.ordered.map :as ordered-map]
   [flatland.ordered.set :as ordered-set]
   [java-time.api :as t]
   [metabase.driver :as driver]
   [metabase.mbql.util :as mbql.u]
   [metabase.models :refer [Database]]
   [metabase.public-settings :as public-settings]
   [metabase.search.util :as search.util]
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
;;             /   \   └──────────┬─────────────┐
;;            /     \             │             │
;;         float   datetime  offset-datetime  string-pk
;;           │       │
;;           │       │
;;          int     date
;;         /   \
;;        /     \
;;  int-pk     boolean
;;     │
;;     │
;;   auto-
;; incrementing-
;;  int-pk
;;
;; </code></pre>

(def ^:private type->parent
  ;; listed in depth-first order
  {::varchar-255              ::text
   ::float                    ::varchar-255
   ::int                      ::float
   ::int-pk                   ::int
   ::auto-incrementing-int-pk ::int-pk
   ::boolean                  ::int
   ::datetime                 ::varchar-255
   ::date                     ::datetime
   ::offset-datetime          ::varchar-255
   ::string-pk                ::varchar-255})

(def ^:private base-type->pk-type
  {::varchar-255 ::string-pk
   ::int         ::int-pk})

(def ^:private types
  (set/union (set (keys type->parent))
             (set (vals type->parent))))

(def ^:private pk-base-types
  (set (keys base-type->pk-type)))

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

(defn- offset-datetime-string? [s]
  (try (t/offset-date-time s)
       true
       (catch Exception _
         false)))

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

(defn value->type
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
  [value]
  (let [number-separators (upload-parsing/get-number-separators)
        trimmed-val       (str/trim value)]
    (cond
      (str/blank? value)                                            nil
      (re-matches #"(?i)true|t|yes|y|1|false|f|no|n|0" trimmed-val) ::boolean
      (offset-datetime-string? trimmed-val)                         ::offset-datetime
      (datetime-string? trimmed-val)                                ::datetime
      (date-string? trimmed-val)                                    ::date
      (re-matches (int-regex number-separators) trimmed-val)        ::int
      (re-matches (float-regex number-separators) trimmed-val)      ::float
      (re-matches #".{1,255}" value)                                ::varchar-255
      :else                                                         ::text)))

(defn- row->types
  [row]
  (map (comp value->type search.util/normalize) row))

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
  (and (#{"id" "pk" "uuid" "guid"} (u/lower-case-en (name col-name)))
       (pk-base-types type)))

(defn- ->ordered-maps-with-pk-column
  "Sets appropriate type information on the first PK column it finds, otherwise adds a new one.

  Returns a *map* with two keys: `:extant-columns` and `:generated-columns`."
  [name-type-pairs]
  (if-let [[pk-name pk-base-type] (first (filter is-pk? name-type-pairs))]
    {:extant-columns    (assoc (ordered-map/ordered-map name-type-pairs) pk-name (base-type->pk-type pk-base-type))
     :generated-columns (ordered-map/ordered-map)}
    {:extant-columns    (ordered-map/ordered-map name-type-pairs)
     :generated-columns (ordered-map/ordered-map :id ::auto-incrementing-int-pk)}))

(defn- rows->schema
  [header rows]
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
         (->ordered-maps-with-pk-column))))

;;;; +------------------+
;;;; |  Parsing values  |
;;;; +------------------+



(defn- parsed-rows
  "Returns a lazy seq of parsed rows from the `reader`.
   Replaces empty strings with nil."
  [col->upload-type reader]
  (let [[header & rows] (csv/read-csv reader)
        column-count    (count header)
        parsers         (map upload-parsing/upload-type->parser (vals col->upload-type))]
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

(defn load-from-csv!
  "Loads a table from a CSV file. If the table already exists, it will throw an error.
   Returns the file size, number of rows, and number of columns."
  [driver db-id table-name ^File csv-file]
  (let [{col-to-insert->upload-type :extant-columns
         gen-col->upload-type       :generated-columns} (detect-schema csv-file)
        col-to-create->col-spec                         (upload-type->col-specs driver
                                                                                (merge gen-col->upload-type col-to-insert->upload-type))
        csv-col-names                                   (keys col-to-insert->upload-type)]
    (driver/create-table! driver db-id table-name col-to-create->col-spec)
    (try
      (with-open [reader (io/reader csv-file)]
        (let [rows (parsed-rows col-to-insert->upload-type reader)]
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
