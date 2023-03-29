(ns metabase.csv
  (:require
   [clojure.data.csv :as csv]
   [clojure.java.io :as io]
   [metabase.util :as u]
   [metabase.util.i18n :refer [trs]]))

(derive ::boolean     ::int)
(derive ::boolean     ::varchar_255)
(derive ::boolean     ::text)
(derive ::int         ::float)
(derive ::int         ::text)
(derive ::int         ::varchar_255)
(derive ::int         ::text)
(derive ::float       ::varchar_255)
(derive ::float       ::text)
(derive ::varchar_255 ::text)

(defn value->type
  "The most-specific possible type for a given value. Possibilities are:
    - ::bolean
    - ::int
    - ::float
    - ::varchar_255
    - ::text

  NB: There are currently the following gotchas:
    1. ints/floats are assumed to have commas as separators and periods as decimal points
    2. 0 and 1 are assumed to be booleans, not ints."
  [value]
  (cond
    (re-matches #"(?i)true|t|yes|y|1|false|f|no|n|0" value) ::boolean
    (re-matches #"[\d,]+"                            value) ::int
    (re-matches #"[\d,]*\.\d+"                       value) ::float
    (re-matches #".{1,255}"                          value) ::varchar_255
    :else                                                   ::text))

(defn- row->types
  [column-names row]
  (->> row
       (map vector column-names)
       (map (fn [[column-name value]] [column-name (value->type value)]))
       (into {})))

(defn coalesce
  "Returns the 'parent' type (the most general)."
  [type-a type-b]
  (cond
    (isa? type-a type-b) type-b
    (isa? type-b type-a) type-a
    :else (throw (Exception. (trs "Unexpected type combination in the same column: {0} and {1}" type-a type-b)))))

(defn- coalesce-types
  [types-so-far new-types]
  (->> types-so-far
       (map (fn [[column-name old-type]]
              [column-name (coalesce old-type (get new-types column-name))]))
       (into {})))

(defn- rows->schema
  [header rows]
  (let [normalized-header (map u/slugify header)]
    (->> rows
         (map (partial row->types normalized-header))
         (reduce coalesce-types))))

(defn detect-schema
  "Returns a map of `normalized-column-name -> type` for the given CSV file. The CSV file *must* have headers as the
  first row. Supported types are:
    - ::int
    - ::float
    - ::boolean
    - ::varchar_255
    - ::text"
  [csv-file]
  (with-open [reader (io/reader csv-file)]
    (let [[header & rows] (csv/read-csv reader)]
      (rows->schema header rows ))))
