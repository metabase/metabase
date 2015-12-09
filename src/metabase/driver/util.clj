(ns metabase.driver.util
  "Utility functions for implementing Metabase drivers."
  (:require [clojure.tools.logging :as log]
            [metabase.driver :as driver]
            [metabase.util :as u]))

(defn class->base-type
  "Return the `Field.base_type` that corresponds to a given class returned by the DB."
  [klass]
  (or ({Boolean                      :BooleanField
        Double                       :FloatField
        Float                        :FloatField
        Integer                      :IntegerField
        Long                         :IntegerField
        String                       :TextField
        java.math.BigDecimal         :DecimalField
        java.math.BigInteger         :BigIntegerField
        java.sql.Date                :DateField
        java.sql.Timestamp           :DateTimeField
        java.util.Date               :DateField
        java.util.UUID               :TextField
        org.postgresql.util.PGobject :UnknownField} klass)
      (cond
        (isa? klass clojure.lang.IPersistentMap) :DictionaryField)
      (do (log/warn (format "Don't know how to map class '%s' to a Field base_type, falling back to :UnknownField." klass))
          :UnknownField)))

(defn values->base-type
  "Given a sequence of values, return `Field.base_type` in the most ghetto way possible.
   This just gets counts the types of *every* non-nil value and returns the `base_type` for class whose count was highest."
  [values-seq]
  {:pre [(sequential? values-seq)]}
  (or (->> values-seq
           (filter identity)
           ;; it's probably fine just to consider the first 1,000 *non-nil* values when trying to type a column instead
           ;; of iterating over the whole collection. (VALUES-SEQ should be up to 10,000 values, but we don't know how many are
           ;; nil)
           (take 1000)
           (group-by type)
           ;; create tuples like [Integer count].
           (map (fn [[klass values]]
                  [klass (count values)]))
           (sort-by second)
           last              ; last result will be tuple with highest count
           first             ; keep just the type
           class->base-type) ; convert to Field base_type
      :UnknownField))

(defn field->base-type
  "Determine the base type of FIELD in the most ghetto way possible, by fetching a lazy sequence of values
   and mapping the most commonly occuring class to its corresponding base type."
  [driver field]
  {:pre  [(map? field)]
   :post [(keyword? %)]}
  (values->base-type (driver/field-values-lazy-seq driver field)))

(defprotocol IDriverTableToColumnNames
  "Methods a driver must implement to use `ghetto-active-column-names->type`."
  (table->column-names ^java.util.Set [this, ^metabase.models.table.TableInstance table]
    "Return a set of string names for columns (or equivalent) in TABLE."))

(defn ghetto-active-column-names->type
  "Ghetto implementation of `IDriver/active-column-names->type` that maps the most commonly occuring
   non-nil class returned by `field-values-lazy-seq` for each field to their corresponding base types.

   Drivers that want to use this implementation must implement `IDriverTableToColumnNames`."
  [driver table]
  (into {} (for [column-name (table->column-names driver table)]
             (do (assert (u/string-or-keyword? column-name)
                   (str "column-name must be a string or keyword: " column-name))
                 {(name column-name)
                  (field->base-type driver {:name                      (name column-name)
                                            :table                     (delay table)
                                            :qualified-name-components (delay [(:name table) (name column-name)])})}))))


(u/require-dox-in-this-namespace)
