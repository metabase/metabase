(ns metabase.csv
  (:require
   [clojure.data.csv :as csv]
   [clojure.java.io :as io]
   [clojure.set :as set]
   [clojure.string :as str]
   [medley.core :as m]
   [metabase.search.util :as search-util]
   [metabase.util :as u]
   [metabase.util.i18n :refer [trs]]))

;;
;;
;;      ______text________
;;     /       |          \
;;    /        |           \
;; float   varchar_255     int
;;   \         /   \        /
;;    \       /     \      /
;;   float_255       \    /
;;            \       \  /
;;             \-----int_255
;;                     |
;;                     |
;;                  boolean
(derive ::boolean     ::int_255)
(derive ::int_255     ::int)
(derive ::int_255     ::float_255)
(derive ::int         ::float)
(derive ::float_255   ::varchar_255)
(derive ::float       ::text)
(derive ::varchar_255 ::text)

(def intermediate-type->final-type "We use some 'intermediate types' to keep track of information while scanning over the file. This is a map from those
  intermediate types to the final type they should result in if unaltered."
  {::int_255   ::int
   ::float_255 ::float
   nil         ::text})

(defn value->type
  "The most-specific possible type for a given value. Possibilities are:
    - ::bolean
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
    (re-matches #"-?[\d,]{1,255}"                    value) ::int_255
    (re-matches #"-?[\d,]+"                          value) ::int
    (and (re-matches #"-?[\d,]*\.\d+"                value)
         (<= (count value) 255))                            ::float_255
    (re-matches #"-?[\d,]*\.\d+"                     value) ::float
    (re-matches #".{1,255}"                          value) ::varchar_255
    :else                                                   ::text))

(defn- row->types
  [column-names row]
  (->> row
       (map vector column-names)
       (map (fn [[column-name value]] [column-name (and value (value->type (search-util/normalize value)))]))
       (into {})))

(defn coalesce
  "Returns the 'parent' type (the most general)."
  [type-a type-b]
  (cond
    (nil? type-a)        type-b
    (nil? type-b)        type-a
    (isa? type-a type-b) type-b
    (isa? type-b type-a) type-a
    :else
    (let [common-ancestors (set/intersection (ancestors type-a) (ancestors type-b))]
      (if (seq common-ancestors)
        (first common-ancestors)
        (throw (Exception. (trs "Unexpected type combination in the same column: {0} and {1}" type-a type-b)))))))

(defn- coalesce-types
  [types-so-far new-types]
  (->> types-so-far
       (map (fn [[column-name old-type]]
              [column-name (coalesce old-type (get new-types column-name))]))
       (into {})))

(defn- normalize-type
  "We use some intermediate types (int_255, float_255, nil) while looking at the rows, but when the whole file has been
  scanned they need to be converted into a proper type."
  [the-type]
  (get intermediate-type->final-type the-type the-type))

(defn- rows->schema
  [header rows]
  (let [normalized-header (map (comp u/slugify str/trim) header)]
    (->> rows
         (map (partial row->types normalized-header))
         (reduce coalesce-types)
         (m/map-vals normalize-type))))

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
      (rows->schema header rows ))))
