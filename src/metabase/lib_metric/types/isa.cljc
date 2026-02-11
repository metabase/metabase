(ns metabase.lib-metric.types.isa
  "Type predicate functions for lib-metric dimensions.
   Simpler implementation than metabase.lib.types.isa."
  (:refer-clojure :exclude [boolean?])
  (:require
   [metabase.lib-metric.types.constants :as constants]
   [metabase.types.core]
   [metabase.util.performance :refer [some]]))

;; Ensure type hierarchy is loaded
(comment metabase.types.core/keep-me)

(defn column-type
  "Returns the :effective-type of `column`, if set. Otherwise, returns the :base-type."
  [column]
  (or (:effective-type column) (:base-type column)))

(defn field-type?
  "Returns true if `column` matches the type definition for `category`.
   The category is a key in [[constants/type-hierarchies]].
   Returns false for nil column."
  [category column]
  (if (nil? column)
    false
    (let [type-definition (constants/type-hierarchies category)
          col             (cond-> column
                            (and (map? column)
                                 (not (:effective-type column)))
                            (assoc :effective-type (:base-type column)))]
      (clojure.core/boolean
       (some (fn [[type-key types]]
               (and (#{:effective-type :semantic-type} type-key)
                    (some #(clojure.core/isa? (type-key col) %) types)))
             type-definition)))))

(defn temporal?
  "Is `column` of a temporal type?"
  [column]
  (field-type? ::constants/temporal column))

(defn numeric?
  "Is `column` of a numeric type?"
  [column]
  (field-type? ::constants/number column))

(defn boolean?
  "Is `column` of a boolean type?"
  [column]
  (field-type? ::constants/boolean column))

(defn string?
  "Is `column` of a string type?"
  [column]
  (field-type? ::constants/string column))

(defn string-like?
  "Is `column` of a string-like type (e.g., IP address, URL)?"
  [column]
  (field-type? ::constants/string-like column))

(defn string-or-string-like?
  "Is `column` a string or string-like type?"
  [column]
  (or (string? column) (string-like? column)))

(defn coordinate?
  "Is `column` a coordinate?"
  [column]
  (clojure.core/boolean
   (clojure.core/isa? (:semantic-type column) :type/Coordinate)))

(defn latitude?
  "Is `column` a latitude?"
  [column]
  (clojure.core/boolean
   (clojure.core/isa? (:semantic-type column) :type/Latitude)))

(defn longitude?
  "Is `column` a longitude?"
  [column]
  (clojure.core/boolean
   (clojure.core/isa? (:semantic-type column) :type/Longitude)))

(defn location?
  "Is `column` a location/address?"
  [column]
  (clojure.core/boolean
   (clojure.core/isa? (:semantic-type column) :type/Address)))

(defn foreign-key?
  "Is `column` a foreign key?"
  [column]
  (clojure.core/boolean
   (clojure.core/isa? (:semantic-type column) :type/FK)))

(defn primary-key?
  "Is `column` a primary key?"
  [column]
  (clojure.core/boolean
   (clojure.core/isa? (:semantic-type column) :type/PK)))

(defn time?
  "Is `column` a time (without date)?"
  [column]
  (clojure.core/boolean
   (clojure.core/isa? (column-type column) :type/Time)))

(defn date-or-datetime?
  "Is `column` a date or datetime (has a date component)?"
  [column]
  (clojure.core/boolean
   (clojure.core/isa? (column-type column) :type/HasDate)))

(defn category?
  "Is `column` of a categorical type?"
  [column]
  (field-type? ::constants/category column))

(defn id?
  "Is `column` an ID (primary key or foreign key)?"
  [column]
  (or (primary-key? column) (foreign-key? column)))

(defn URL?
  "Is `column` a URL?"
  [column]
  (clojure.core/boolean
   (clojure.core/isa? (:semantic-type column) :type/URL)))

(defn entity-name?
  "Is `column` an entity name?"
  [column]
  (clojure.core/boolean
   (clojure.core/isa? (:semantic-type column) :type/Name)))

(defn title?
  "Is `column` a title?"
  [column]
  (clojure.core/boolean
   (clojure.core/isa? (:semantic-type column) :type/Title)))

(defn state?
  "Is `column` a state?"
  [column]
  (clojure.core/boolean
   (clojure.core/isa? (:semantic-type column) :type/State)))

(defn country?
  "Is `column` a country?"
  [column]
  (clojure.core/boolean
   (clojure.core/isa? (:semantic-type column) :type/Country)))

(defn city?
  "Is `column` a city?"
  [column]
  (clojure.core/boolean
   (clojure.core/isa? (:semantic-type column) :type/City)))
