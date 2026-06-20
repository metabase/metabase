(ns metabase.lib.types.array
  "Helpers for working with array column types."
  (:require
   [clojure.string :as str]
   [metabase.lib.types.isa :as lib.types.isa]))

(def ^:private element-type-from-database-type
  "Map of common Postgres array element type names (the part after `_`) to Metabase base types.
  Used as a fallback when `:array-element-type` is not pre-populated on column metadata (e.g. on the FE)."
  {"bigint"   :type/BigInteger
   "bool"     :type/Boolean
   "boolean"  :type/Boolean
   "float4"   :type/Float
   "float8"   :type/Float
   "int2"     :type/Integer
   "int4"     :type/Integer
   "int8"     :type/BigInteger
   "integer"  :type/Integer
   "numeric"  :type/Decimal
   "real"     :type/Float
   "smallint" :type/Integer
   "text"     :type/Text
   "uuid"     :type/UUID
   "varchar"  :type/Text})

(defn- infer-element-type-from-database-type
  "Parse element type from a Postgres-style array database-type like `_text` or `_int4`."
  [database-type]
  (when database-type
    (let [s (cond (keyword? database-type) (name database-type)
                  (string? database-type)  database-type
                  :else                    (str database-type))]
      (when (str/starts-with? s "_")
        (get element-type-from-database-type (subs s 1) :type/Text)))))

(defn ^:export array-element-effective-type
  "For array columns, returns the effective type of the array elements (e.g. `:type/Text` for `_text`).
  Returns `nil` for non-array columns.

  Prefers `:array-element-type` from column metadata (populated at sync time on the BE), falling back to
  parsing `database-type` (needed on the FE where only the raw database type string is available)."
  [column]
  (when (lib.types.isa/array? column)
    (or (:array-element-type column)
        (infer-element-type-from-database-type (:database-type column)))))

(defn ^:export column-for-filter-widget
  "The FE filter pickers (StringFilterPicker, NumberFilterPicker, etc.) select themselves based on the column's
  `effective-type`. Array columns have `effective-type` `:type/Array`, which matches no picker. This swaps in the
  element type so the correct picker renders. Only picker selection uses this transformed metadata — query construction
  still uses the original column."
  [column]
  (if-let [element-type (array-element-effective-type column)]
    (assoc column :effective-type element-type)
    column))
