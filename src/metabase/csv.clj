(ns metabase.csv
  (:require
   [clojure.data.csv :as csv]
   [clojure.java.io :as io]
   [clojure.string :as str]
   [flatland.ordered.map :as ordered-map]
   [honey.sql :as sql]
   [java-time :as t]
   [metabase.driver :as driver]
   [metabase.query-processor.writeback :as qp.writeback]
   [metabase.search.util :as search-util]
   [metabase.util :as u]
   [metabase.util.i18n :refer [trs]])
  (:import
   (java.io File)))

(set! *warn-on-reflection* true)

;;           text
;;            |
;;            |
;;       varchar_255
;;            |
;;            |
;;          float
;;            |
;;            |
;;           int
;;            |
;;            |
;;         boolean
(derive ::boolean     ::int)
(derive ::int         ::float)
(derive ::float       ::varchar_255)
(derive ::varchar_255 ::text)

(defn value->type
  "The most-specific possible type for a given value. Possibilities are:
    - ::boolean
    - ::int
    - ::float
    - ::varchar_255
    - ::text
    - nil, in which case other functions are expected to replace it with ::text as the catch-all type

  NB: There are currently the following gotchas:
    1. ints/floats are assumed to have commas as separators and periods as decimal points
    2. 0 and 1 are assumed to be booleans, not ints."
  [value]
  (cond
    (str/blank? value)                                      nil
    (re-matches #"(?i)true|t|yes|y|1|false|f|no|n|0" value) ::boolean
    (re-matches #"-?[\d,]+"                          value) ::int
    (re-matches #"-?[\d,]*\.\d+"                     value) ::float
    (re-matches #".{1,255}"                          value) ::varchar_255
    :else                                                   ::text))

(defn- row->types
  [row]
  (map (comp value->type search-util/normalize) row))

(defn coalesce
  "Returns the 'parent' type (the most general)."
  [type-a type-b]
  (cond
    (nil? type-a)        type-b
    (nil? type-b)        type-a
    (isa? type-a type-b) type-b
    (isa? type-b type-a) type-a
    :else (throw (Exception. (trs "Unexpected type combination in the same column: {0} and {1}" type-a type-b)))))

(defn- coalesce-types
  [types-so-far new-types]
  (->> (map vector types-so-far new-types)
       (map (partial apply coalesce))))

(defn- pad
  "Lengthen `values` until it is of length `n` by filling it with nils."
  [n values]
  (first (partition n n (repeat nil) values)))

(defn- rows->schema
  [header rows]
  (let [normalized-header (map (comp u/slugify str/trim) header)
        column-count      (count normalized-header)]
    (->> rows
         (map row->types)
         (map (partial pad column-count))
         (reduce coalesce-types (repeat column-count nil))
         (map #(or % ::text))
         (map vector normalized-header)
         (ordered-map/ordered-map))))

(defn detect-schema
  "Returns an ordered map of `normalized-column-name -> type` for the given CSV file. The CSV file *must* have headers as the
  first row. Supported types are:

    - ::int
    - ::float
    - ::boolean
    - ::varchar_255
    - ::text

  A column that is completely blank is assumed to be of type ::text."
  [csv-file]
  (with-open [reader (io/reader csv-file)]
    (let [[header & rows] (csv/read-csv reader)]
      (rows->schema header rows))))

(defn- file->table-name [^File file]
  (str (u/slugify (second (re-matches #"(.*)\.csv$" (.getName file)))) (t/format "_yyyyMMddHHmmss" (t/local-date-time))))

(defn- parse-bool
  [s]
  (cond
    (re-matches #"(?i)true|t|yes|y|1" s) true
    (re-matches #"(?i)false|f|no|n|0" s) false))

(def ^:private upload-type->parser
  {::varchar_255 identity
   ::text        identity
   ::int         #(Integer/parseInt (str/trim %))
   ::float       #(Double/parseDouble (str/trim %))
   ::boolean     #(parse-bool (str/trim %))})

(defn- parsed-rows
  "Returns a vector of parsed rows from a `csv-file`.
   Replaces empty strings with nil."
  [col->csv-type csv-file]
  (with-open [reader (io/reader csv-file)]
    (let [[_header & rows] (csv/read-csv reader)
          parsers (map (partial upload-type->parser) (vals col->csv-type))]
      (vec (for [row rows]
             (for [[v f] (map vector row parsers)]
               (if (str/blank? v)
                 nil
                 (f v))))))))

(defn- load-from-csv*
  "Loads a table from a CSV file. If the table already exists, it will throw an error. Returns nil."
  [driver db-id schema-name table-name ^File csv-file]
  (let [col->upload-type   (detect-schema csv-file)
        col->database-type (update-vals col->upload-type (partial driver/upload-type->database-type driver))
        column-names       (keys col->upload-type)]
    (driver/create-table driver db-id schema-name table-name col->database-type)
    (try
      (let [rows (parsed-rows col->upload-type csv-file)
            sql  (sql/format {:insert-into (keyword (str schema-name "." table-name))
                              :columns (map keyword column-names)
                              :values rows})]
        (qp.writeback/execute-write-sql! db-id sql))
      (catch Throwable e
        (driver/drop-table driver db-id schema-name table-name)
        (throw (ex-info (ex-message e) {}))))
    nil))

(defn load-from-csv
  "Loads a table from a CSV file. Creates a unique table name based on the name of the file.
   Returns the name of the newly created table."
  [driver database schema-name ^File file]
  (let [table-name (file->table-name file)]
    (load-from-csv* driver database schema-name table-name file)
    table-name))
