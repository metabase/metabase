(ns metabase.driver.query-processor.expand
  "Various query processor functions need to know information about `Fields` and `Values` -- `base_type`, `special_type`, etc,
   and need to parse the Query dict.
   Right now there's a lot of duplicated logic to perform this functionality. Ideally, we'd gather all this information in a single place,
   and various QP components wouldn't need to implement that logic themselves.

   That's the ultimate endgoal of this namespace: parse a Query dict and return an *expanded* form with relevant information added,
   values already parsed (e.g. date strings will be converted to `java.sql.Date` / Unix timestamps as appropriate), in a more
   Clojure-friendly format (e.g. using keywords like `:not-null` instead of strings like `\"NOT_NULL\"`, and using maps instead of
   position-dependent vectors for things like like the `BETWEEN` filter clause. We'll also be able to add useful utility methods to various
   bits of the Query Language, since they're typed. On top of that, we'll see a big performance improvment when various QP modules aren't
   making duplicate DB calls.

   Ex.
   A normal `filter` clause might look something like this:

     [\"=\" 34 \"1760-01-01\"]

   When we expand it, we get:

     {:compound-type :simple
      :subclauses [{:filter-type :=
                    :field {:field-id 34
                            :field-name \"TIMESTAMP\"
                            :base-type :BigIntegerField
                            :special-type :timestamp_seconds}
                    :value {:value -6626937600,
                            :original-value \"1760-01-01\",
                            :base-type :BigIntegerField,
                            :special-type :timestamp_seconds,
                            :field-id 34}}]}

   ## Expansion Phases

   1.  Parsing:          Various functions parse the query form and replace Field IDs and values with placeholders
   2.  Field Lookup:     A *batched* DB call is made to fetch Fields with IDs found during Parsing
   3.  Field Resolution: Query is walked depth-first and placeholders are replaced with expanded `Field`/`Value` objects"
  (:require [clojure.core.match :refer [match]]
            (clojure [set :as set]
                     [string :as s]
                     [walk :as walk])
            [medley.core :as m]
            [swiss.arrows :refer [-<>]]
            [metabase.db :refer [sel]]
            (metabase.models [database :refer [Database]]
                             [field :as field]
                             [table :refer [Table]])
            [metabase.util :as u])
  (:import (clojure.lang Keyword)))

(declare parse-aggregation
         parse-breakout
         parse-fields
         parse-filter
         parse-order-by)


;; ## -------------------- Protocols --------------------

(defprotocol IResolve
  "Methods called during `Field` and `Table` resolution. Placeholder types should implement this protocol."
  (resolve-field [this field-id->fields]
    "This method is called when walking the Query after fetching `Fields`.
     Placeholder objects should lookup the relevant Field in FIELD-ID->FIELDS and
     return their expanded form. Other objects should just return themselves.")
  (resolve-table [this table-id->tables]
    "Called when walking the Query after `Fields` have been resolved and `Tables` have been fetched.
     Objects like `Fields` can add relevant information like the name of their `Table`."))

;; Default impls are just identity
(extend Object
  IResolve {:resolve-field (fn [this _] this)
            :resolve-table (fn [this _] this)})

(extend nil
  IResolve {:resolve-field (constantly nil)
            :resolve-table (constantly nil)})


;; ## -------------------- Expansion - Impl --------------------

(defn- non-empty-clause? [clause]
  (and clause
       (or (not (sequential? clause))
           (and (seq clause)
                (every? identity clause)))))

(defn- parse [query-dict]
  (update-in query-dict [:query] #(-<> (assoc %
                                              :aggregation (parse-aggregation (:aggregation %))
                                              :breakout    (parse-breakout    (:breakout %))
                                              :fields      (parse-fields      (:fields %))
                                              :filter      (parse-filter      (:filter %))
                                              :order_by    (parse-order-by    (:order_by %)))
                                       (set/rename-keys <> {:order_by     :order-by
                                                            :source_table :source-table})
                                       (m/filter-vals non-empty-clause? <>))))

(def ^:private ^:dynamic *field-ids*
  "Bound to an atom containing a set when a parsing function is ran"
  nil)

(defn rename-mb-field-keys
  "Rename the keys in a Metabase `Field` to match the format of those in Query Expander `Fields`."
  [field]
  (set/rename-keys field {:id           :field-id
                          :name         :field-name
                          :special_type :special-type
                          :base_type    :base-type
                          :table_id     :table-id}))

(defn- resolve-fields
  "Resolve the `Fields` in an EXPANDED-QUERY-DICT."
  [expanded-query-dict field-ids]
  (if-not (seq field-ids) expanded-query-dict ; No need to do a DB call or walk expanded-query-dict if we didn't see any Field IDs
          (let [fields (->> (sel :many :id->fields [field/Field :name :base_type :special_type :table_id] :id [in field-ids])
                            (m/map-vals rename-mb-field-keys))]
            ;; This is performed depth-first so we don't end up walking the newly-created Field/Value objects
            ;; they may have nil values; this was we don't have to write an implementation of resolve-field for nil
            (walk/postwalk #(resolve-field % fields) expanded-query-dict))))

(defn- resolve-database
  "Resolve the `Database` in question for an EXPANDED-QUERY-DICT."
  [{database-id :database, :as expanded-query-dict}]
  (assoc expanded-query-dict :database (sel :one :fields [Database :name :id :engine :details] :id database-id)))

(defn resolve-tables
  "Resolve the `Tables` in an EXPANDED-QUERY-DICT."
  ([{{source-table-id :source-table} :query, :as expanded-query-dict}]
   (resolve-tables expanded-query-dict (sel :one :fields [Table :name :id] :id source-table-id)))
  ([expanded-query-dict table]
   {:pre [(map? table)]}
   (->> (assoc-in expanded-query-dict [:query :source-table] table)
        (walk/postwalk #(resolve-table % {(:id table) table})))))


;; ## -------------------- Public Interface --------------------

(defn expand
  "Expand a QUERY-DICT."
  [query-dict]
  (binding [*field-ids* (atom #{})]
    (some-> query-dict
            parse
            (resolve-fields @*field-ids*)
            resolve-database
            resolve-tables)))


;; ## -------------------- Field + Value --------------------

;; Field is the expansion of a Field ID in the standard QL
(defrecord Field [^Integer field-id
                  ^String  field-name
                  ^Keyword base-type
                  ^Keyword special-type
                  ^Integer table-id
                  ^String  table-name]
  IResolve
  (resolve-table [this table-id->table]
    (cond-> this
      table-id (assoc :table-name (:name (table-id->table table-id))))))

;; Value is the expansion of a value within a QL clause
;; Information about the associated Field is included for convenience
(defrecord Value [value              ; e.g. parsed Date / timestamp
                  original-value     ; e.g. original YYYY-MM-DD string
                  ^Keyword base-type
                  ^Keyword special-type
                  ^Integer field-id
                  ^String  field-name])


;; ## -------------------- Placeholders --------------------

;; Replace Field IDs with these during first pass
(defrecord FieldPlaceholder [field-id]
  IResolve
  (resolve-field [this field-id->fields]
    (-> (:field-id this)
        field-id->fields
        map->Field)))

(defn- parse-value
  "Convert the `value` of a `Value` to a date or timestamp if needed.
   The original `YYYY-MM-DD` string date is retained under the key `:original-value`."
  [{:keys [value base-type special-type] :as qp-value}]
  (assoc qp-value
         :original-value value
         ;; Since Value *doesn't* revert to YYYY-MM-DD when collapsing make sure we're not parsing it twice
         :value (or (when (and (string? value)
                               (or (contains? #{:DateField :DateTimeField} base-type)
                                   (contains? #{:timestamp_seconds :timestamp_milliseconds} special-type)))
                      (u/parse-date-yyyy-mm-dd value))
                    value)))

;; Replace values with these during first pass over Query.
;; Include associated Field ID so appropriate the info can be found during Field resolution
(defrecord ValuePlaceholder [field-id value]
  IResolve
  (resolve-field [this field-id->fields]
    (-> (:field-id this)
        field-id->fields
        (assoc :value (:value this))
        parse-value
        map->Value)))

(defn- ph
  "Create a new placeholder object for a Field ID or value.
   If `*field-ids*` is bound, "
  ([field-id]
   (when *field-ids*
     (swap! *field-ids* conj field-id))
   (->FieldPlaceholder field-id))
  ([field-id value]
   (->ValuePlaceholder field-id value)))


;; # ======================================== CLAUSE DEFINITIONS ========================================

(defmacro defparser
  "Convenience for writing a parser function, i.e. one that pattern-matches against a lone argument."
  [fn-name & match-forms]
  `(defn ~(vary-meta fn-name assoc :private true) [form#]
     (when (non-empty-clause? form#)
       (match form#
         ~@match-forms))))

;; ## -------------------- Aggregation --------------------

(defrecord Aggregation [^Keyword aggregation-type
                        ^Field field])

(defparser parse-aggregation
  ["rows"]              (->Aggregation :rows nil)
  ["count"]             (->Aggregation :count nil)
  ["avg" field-id]      (->Aggregation :avg (ph field-id))
  ["count" field-id]    (->Aggregation :count (ph field-id))
  ["distinct" field-id] (->Aggregation :distinct (ph field-id))
  ["stddev" field-id]   (->Aggregation :stddev (ph field-id))
  ["sum" field-id]      (->Aggregation :sum (ph field-id))
  ["cum_sum" field-id]  (->Aggregation :cumulative-sum (ph field-id)))


;; ## -------------------- Breakout --------------------

;; Breakout + Fields clauses are just regular vectors of Fields

(defparser parse-breakout
  field-ids (mapv ph field-ids))


;; ## -------------------- Fields --------------------

(defparser parse-fields
  field-ids (mapv ph field-ids))

;; ## -------------------- Filter --------------------

;; ### Top-Level Type

(defrecord Filter [^Keyword compound-type ; :and :or :simple
                   subclauses])


;; ### Subclause Types

(defrecord Filter:Inside [^Keyword filter-type ; :inside :not-null :is-null :between := :!= :< :> :<= :>=
                          lat
                          lon])

(defrecord Filter:Between [^Keyword filter-type
                           ^Field   field
                           ^Value   min-val
                           ^Value   max-val])

(defrecord Filter:Field+Value [^Keyword filter-type
                               ^Field   field
                               ^Value   value])

(defrecord Filter:Field [^Keyword filter-type
                         ^Field field])


;; ### Parsers

(defparser parse-filter-subclause
  ["INSIDE" lat-field lon-field lat-max lon-min lat-min lon-max]
  (map->Filter:Inside {:filter-type :inside
                       :lat         {:field (ph lat-field)
                                     :min   (ph lat-field lat-min)
                                     :max   (ph lat-field lat-max)}
                       :lon         {:field (ph lon-field)
                                     :min   (ph lon-field lon-min)
                                     :max   (ph lon-field lon-max)}})

  ["BETWEEN" field-id min max]
  (map->Filter:Between {:filter-type :between
                        :field       (ph field-id)
                        :min-val     (ph field-id min)
                        :max-val     (ph field-id max)})

  [filter-type field-id val]
  (map->Filter:Field+Value {:filter-type (keyword filter-type)
                            :field       (ph field-id)
                            :value       (ph field-id val)})

  [filter-type field-id]
  (map->Filter:Field {:filter-type (case filter-type
                                     "NOT_NULL" :not-null
                                     "IS_NULL"  :is-null)
                      :field       (ph field-id)}))

(defparser parse-filter
  ["AND" & subclauses] (map->Filter {:compound-type :and
                                     :subclauses    (mapv parse-filter-subclause subclauses)})
  ["OR" & subclauses]  (map->Filter {:compound-type :or
                                     :subclauses    (mapv parse-filter-subclause subclauses)})
  subclause            (map->Filter {:compound-type :simple
                                     :subclauses    [(parse-filter-subclause subclause)]}))


;; ## -------------------- Order-By --------------------

(defrecord OrderByAggregateField [^Keyword source  ; e.g. :aggregation
                                  ^Integer index]) ; e.g. 0

(defrecord OrderBySubclause [^Field   field       ; or aggregate Field?
                             ^Keyword direction]) ; either :ascending or :descending

(defn- parse-order-by-direction [direction]
  (case direction
    "ascending"  :ascending
    "descending" :descending))

(defparser parse-order-by-subclause
  [["aggregation" index] direction]      (->OrderBySubclause (->OrderByAggregateField :aggregation index)
                                                             (parse-order-by-direction direction))
  [(field-id :guard integer?) direction] (->OrderBySubclause (ph field-id)
                                                             (parse-order-by-direction direction)))
(defparser parse-order-by
  subclauses (mapv parse-order-by-subclause subclauses))
