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
   3.  Field Resolution: Query is walked depth-first and placeholders are replaced with expanded `Field`/`Value` objects

   ## Collapsing

   Unfortunately, not every part of the QP understands expanded queries. Call `collapse` on an expanded Query form to get the equivalent standard
   QL forms for backwards-compatibility."
  (:require [clojure.core.match :refer [match]]
            (clojure [set :as set]
                     [string :as s]
                     [walk :as walk])
            [medley.core :as m]
            [metabase.db :refer [sel]]
            [metabase.models.field :as field]
            [metabase.util :as u])
  (:import (clojure.lang Keyword)))

(declare parse-aggregation
         parse-breakout
         parse-filter
         with-resolved-fields)

;; ## -------------------- Protocols --------------------

(defprotocol IResolveField
  "Methods called during `Field` resolution. Placeholder types should implement this protocol."
  (resolve-field [this field-id->fields]
    "This method is called when walking the Query after fetching `Fields`.
     Placeholder objects should lookup the relevant Field in FIELD-ID->FIELDS and
     return their expanded form. Other objects should just return themselves."))

(defprotocol ICollapse
  "Methods called during reverse-expansion.
   `collapse` traverses and expanded form breadth-first and calls `collapse-one`
   on each form. Implementers of `ICollapse` *should-not* call `collapse-one`
   on their subforms."
  (collapse-one [this]
    "Don't call this directly; use `collapse`.
     Return a reverse-expanded version of this object."))

;; Default impls are just identity
(extend Object
  IResolveField {:resolve-field (fn [this _] this)}
  ICollapse     {:collapse-one  identity})

(extend nil
  IResolveField {:resolve-field (constantly nil)})


;; ## -------------------- Public Interface --------------------

(defn- parse [query-dict]
  (update-in query-dict [:query] #(assoc %
                                         :aggregation (parse-aggregation (:aggregation %))
                                         :breakout    (parse-breakout (:breakout %))
                                         :filter      (parse-filter   (:filter %)))))

(defn expand
  "Expand a query-dict."
  [query-dict]
  (with-resolved-fields parse query-dict))

(defn expand-filter
  "Expand a `filter` clause."
  [filter-clause]
  (with-resolved-fields parse-filter filter-clause))

;; Do a breadth-first walk so we don't walk things that will be tossed anyway. Since
;; some of these objects can be nil, this saves us from having to write an implentation
;; of collapse-one for nil as well.
(defn collapse
  "Collapse an expanded QUERY-FORM returning its standard QL equivalent."
  [query-form]
  (->> query-form
       (walk/prewalk collapse-one)   ; do a second pass because some forms might not get fully collapsed the first time around,
       (walk/prewalk collapse-one))) ; e.g. :simple filters return collapse to their (not-yet-collapsed) subclause


;; ## -------------------- Field + Value --------------------

;; Field is the expansion of a Field ID in the standard QL
(defrecord Field [field-id
                  field-name
                  base-type
                  special-type]
  ICollapse
  (collapse-one [_]
    field-id))

;; Value is the expansion of a value within a QL clause
;; Information about the associated Field is included for convenience
(defrecord Value [value              ; e.g. parsed Date / timestamp
                  original-value     ; e.g. original YYYY-MM-DD string
                  base-type
                  special-type]
  ICollapse
  (collapse-one [_]
    ;; Some preprocessing steps modify the parsed value
    ;; So return that value instead of converting date/timestamp back to YYYY-MM-DD
    ;; QPs shouldn't need logic for parsing YYYY-MM-DD strings anymore
    value))


;; ## -------------------- Placeholders --------------------

;; Replace Field IDs with these during first pass
(defrecord FieldPlaceholder [field-id]
  IResolveField
  (resolve-field [this field-id->fields]
    (-> (:field-id this)
        field-id->fields
        map->Field))

  ICollapse
  (collapse-one [_]
    field-id))

(defn- parse-value
  "Convert the `value` of a `Value` to a date or timestamp if needed.
   The original `YYYY-MM-DD` string date is retained under the key `:original-value`."
  [{:keys [value base-type special-type] :as qp-value}]
  (assoc qp-value
         :original-value value
         :value (or (when (string? value) ; Since Value *doesn't* revert to YYYY-MM-DD when collapsing make sure we're not parsing it twice
                      (cond
                        (contains? #{:DateField :DateTimeField} base-type) (u/parse-date-yyyy-mm-dd value)
                        (= special-type :timestamp_seconds)                (u/date-yyyy-mm-dd->unix-timestamp value)
                        (= special-type :timestamp_milliseconds)           (* (u/date-yyyy-mm-dd->unix-timestamp value) 1000)))
                    value)))

;; Replace values with these during first pass over Query.
;; Include associated Field ID so appropriate the info can be found during Field resolution
(defrecord ValuePlaceholder [field-id value]
  ICollapse
  (collapse-one [_]
    value)

  IResolveField
  (resolve-field [this field-id->fields]
    (-> (:field-id this)
        field-id->fields
        (assoc :value (:value this))
        parse-value
        map->Value)))

(def ^:private ^:dynamic *field-ids*
  "Bound to an atom containing a set when a parsing function is ran"
  nil)

(defn- ph
  "Create a new placeholder object for a Field ID or value.
   If `*field-ids*` is bound, "
  ([field-id]
   (when *field-ids*
     (swap! *field-ids* conj field-id))
   (->FieldPlaceholder field-id))
  ([field-id value]
   (->ValuePlaceholder field-id value)))


;; ## -------------------- Field Resolution --------------------

(defn- with-resolved-fields
  "Call (PARSER-FN FORM), collecting the `Field` IDs encountered; then fetch the relevant Fields
   and walk the parsed form, calling `resolve-field` on each element."
  [parser-fn form]
  (when form
    (binding [*field-ids* (atom #{})]
      (when-let [parsed-form (parser-fn form)]
        (if-not (seq @*field-ids*) parsed-form ; No need to do a DB call or walk parsed-form if we didn't see any Field IDs
                (let [fields (->> (sel :many :id->fields [field/Field :name :base_type :special_type] :id [in @*field-ids*])
                                  (m/map-vals #(set/rename-keys % {:id           :field-id
                                                                   :name         :field-name
                                                                   :special_type :special-type
                                                                   :base_type    :base-type})))]
                  ;; This is performed depth-first so we don't end up walking the newly-created Field/Value objects
                  ;; they may have nil values; this was we don't have to write an implementation of resolve-field for nil
                  (walk/postwalk #(resolve-field % fields) parsed-form)))))))


;; # ======================================== CLAUSE DEFINITIONS ========================================

(defmacro defparser
  "Convenience for writing a parser function, i.e. one that pattern-matches against a lone argument."
  [fn-name & match-forms]
  `(defn ~(vary-meta fn-name assoc :private true) [form#]
     (when (and form#
                (or (not (sequential? form#))
                    (seq form#)))
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

(defrecord Breakout [fields])

(defparser parse-breakout
  [& field-ids] (mapv ph field-ids))

;; ## -------------------- Filter --------------------

;; ### Top-Level Type

(defrecord Filter [^Keyword compound-type ; :and :or :simple
                   subclauses]
  ICollapse
  (collapse-one [_]
    (case compound-type
      :simple  (first subclauses)
      :and    `["AND" ~@subclauses]
      :or     `["OR"  ~@subclauses])))


;; ### Subclause Types

(defrecord Filter:Inside [^Keyword filter-type ; :inside :not-null :is-null :between := :!= :< :> :<= :>=
                          lat
                          lon]
  ICollapse
  (collapse-one [_]
    ["INSIDE" (:field lat) (:field lon) (:max lat) (:min lon) (:min lat) (:max lon)]))

(defrecord Filter:Between [^Keyword filter-type
                           ^Field   field
                           ^Value   min-val
                           ^Value   max-val]
  ICollapse
  (collapse-one [_]
    ["BETWEEN" field min-val max-val]))

(defn- collapse-filter-type [^Keyword filter-type]
  (-> filter-type
      name
      (s/replace #"-" "_")
      s/upper-case))

(defrecord Filter:Field+Value [^Keyword filter-type
                               ^Field   field
                               ^Value   value]
  ICollapse
  (collapse-one [_]
    [(collapse-filter-type filter-type) field value]))

(defrecord Filter:Field [^Keyword filter-type
                         ^Field field]
  ICollapse
  (collapse-one [_]
    [(collapse-filter-type filter-type) field]))


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
