(ns metabase.csv
  (:require
   [clojure.data.csv :as csv]
   [clojure.java.io :as io]
   [clojure.string :as str]
   [flatland.ordered.map :as ordered-map]
   [metabase.search.util :as search-util]
   [metabase.util :as u]
   [metabase.util.i18n :refer [trs]]))

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
         (reduce coalesce-types)
         (map #(or % ::text))
         (map vector normalized-header)
         (ordered-map/ordered-map))))

(defn detect-schema
  "Returns a map of `normalized-column-name -> type` for the given CSV file. The CSV file *must* have headers as the
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
