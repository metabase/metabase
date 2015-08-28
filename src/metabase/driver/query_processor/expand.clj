(ns metabase.driver.query-processor.expand
  "Converts a Query Dict as recieved by the API into an *expanded* one that contains extra information that will be needed to
   construct the appropriate native Query, and perform various post-processing steps such as Field ordering."
  (:require [clojure.core.match :refer [match]]
            (clojure [set :as set]
                     [string :as s]
                     [walk :as walk])
            [medley.core :as m]
            [korma.core :as k]
            [swiss.arrows :refer [-<>]]
            [metabase.db :refer [sel]]
            [metabase.driver.interface :as i]
            (metabase.models [database :refer [Database]]
                             [field :as field]
                             [foreign-key :refer [ForeignKey]]
                             [table :refer [Table]])
            [metabase.util :as u])
  (:import (clojure.lang Keyword)))

(declare parse-aggregation
         parse-breakout
         parse-fields
         parse-filter
         parse-order-by
         ph)


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

(def ^:private ^:dynamic *field-ids*
  "Bound to an atom containing a set of `Field` IDs referenced in the query being expanded."
  nil)

(def ^:private ^:dynamic *original-query-dict*
  "The entire original Query dict being expanded."
  nil)

(def ^:private ^:dynamic *fk-field-ids*
  "Bound to an atom containing a set of Foreign Key `Field` IDs (on the `source-table`) that we should use for joining to additional `Tables`."
  nil)

(def ^:private ^:dynamic *table-ids*
  "Bound to an atom containing a set of `Table` IDs referenced by `Fields` in the query being expanded."
  nil)

(defn- assert-driver-supports [^Keyword feature]
  {:pre [(:driver *original-query-dict*)]}
  (i/assert-driver-supports (:driver *original-query-dict*) feature))

(defn- non-empty-clause? [clause]
  (and clause
       (or (not (sequential? clause))
           (and (seq clause)
                (not (every? nil? clause))))))

(defn- parse [query-dict]
  ;; TODO - we should parse the Page clause so we can validate it
  ;; And convert to a limit / offset clauses
  (update query-dict :query #(-<> (assoc %
                                         :aggregation (parse-aggregation (:aggregation %))
                                         :breakout    (parse-breakout    (:breakout %))
                                         :fields      (parse-fields      (:fields %))
                                         :filter      (parse-filter      (:filter %))
                                         :order_by    (parse-order-by    (:order_by %)))
                                  (set/rename-keys <> {:order_by     :order-by
                                                       :source_table :source-table})
                                  (m/filter-vals non-empty-clause? <>))))

(defn rename-mb-field-keys
  "Rename the keys in a Metabase `Field` to match the format of those in Query Expander `Fields`."
  [field]
  (set/rename-keys field {:id              :field-id
                          :name            :field-name
                          :display_name    :field-display-name
                          :special_type    :special-type
                          :base_type       :base-type
                          :preview_display :preview-display
                          :table_id        :table-id
                          :parent_id       :parent-id}))

(defn- resolve-fields
  "Resolve the `Fields` in an EXPANDED-QUERY-DICT."
  [expanded-query-dict field-ids]
  (if-not (seq field-ids)
    ;; Base case: if there's no field-ids to expand we're done
    expanded-query-dict

    ;; Re-bind *field-ids* in case we need to do recursive Field resolution
    (binding [*field-ids* (atom #{})]
      (let [fields (->> (sel :many :id->fields [field/Field :name :display_name :base_type :special_type :preview_display :table_id :parent_id :description], :id [in field-ids])
                        (m/map-vals rename-mb-field-keys)
                        (m/map-vals #(assoc % :parent (when (:parent-id %)
                                                        (ph (:parent-id %))))))]
        (swap! *table-ids* set/union (set (map :table-id (vals fields))))

        ;; Recurse in case any new [nested] Field placeholders were emitted and we need to do recursive Field resolution
        ;; We can't use recur here because binding wraps body in try/catch
        (resolve-fields (walk/postwalk #(resolve-field % fields) expanded-query-dict) @*field-ids*)))))

(defn- resolve-database
  "Resolve the `Database` in question for an EXPANDED-QUERY-DICT."
  [{database-id :database, :as expanded-query-dict}]
  (assoc expanded-query-dict :database (sel :one :fields [Database :name :id :engine :details] :id database-id)))

(defrecord JoinTableField [^Integer field-id
                           ^String  field-name])

(defrecord JoinTable [^JoinTableField source-field
                      ^JoinTableField pk-field
                      ^Integer        table-id
                      ^String         table-name])

(defn- join-tables-fetch-field-info
  "Fetch info for PK/FK `Fields` for the JOIN-TABLES referenced in a Query."
  [source-table-id join-tables]
  (let [ ;; Build a map of source table FK field IDs -> field names
        fk-field-id->field-name      (sel :many :id->field [field/Field :name], :id [in @*fk-field-ids*], :table_id source-table-id, :special_type "fk")

        ;; Build a map of join table PK field IDs -> source table FK field IDs
        pk-field-id->fk-field-id     (sel :many :field->field [ForeignKey :destination_id :origin_id],
                                          :origin_id [in (set (keys fk-field-id->field-name))])

        ;; Build a map of join table ID -> PK field info
        join-table-id->pk-field      (let [pk-fields (sel :many :fields [field/Field :id :table_id :name], :id [in (set (keys pk-field-id->fk-field-id))])]
                                       (zipmap (map :table_id pk-fields) pk-fields))]

    ;; Now build the :join-tables clause
    (vec (for [{table-id :id, table-name :name} join-tables]
           (let [{pk-field-id :id, pk-field-name :name} (join-table-id->pk-field table-id)]
             (map->JoinTable {:table-id     table-id
                              :table-name   table-name
                              :pk-field     (map->JoinTableField {:field-id   pk-field-id
                                                                  :field-name pk-field-name})
                              :source-field (let [fk-field-id (pk-field-id->fk-field-id pk-field-id)]
                                              (map->JoinTableField {:field-id   fk-field-id
                                                                    :field-name (fk-field-id->field-name fk-field-id)}))}))))))

(defn- resolve-tables
  "Resolve the `Tables` in an EXPANDED-QUERY-DICT."
  [{{source-table-id :source-table} :query, database-id :database, :as expanded-query-dict} table-ids]
  {:pre [(integer? source-table-id)]}
  (let [table-ids       (conj table-ids source-table-id)
        table-id->table (sel :many :id->fields [Table :name :id] :id [in table-ids])
        join-tables     (vals (dissoc table-id->table source-table-id))]
    (->> (assoc-in expanded-query-dict [:query :source-table] (or (table-id->table source-table-id)
                                                                  (throw (Exception. (format "Query expansion failed: could not find source table %d." source-table-id)))))
         (#(if-not join-tables %
                   (assoc-in % [:query :join-tables] (join-tables-fetch-field-info source-table-id join-tables))))
         (walk/postwalk #(resolve-table % table-id->table)))))


;; ## -------------------- Public Interface --------------------

(defn expand
  "Expand a QUERY-DICT."
  [query-dict]
  (binding [*original-query-dict* query-dict
            *field-ids*           (atom #{})
            *fk-field-ids*        (atom #{})
            *table-ids*           (atom #{})]
    (some-> query-dict
            parse
            (resolve-fields @*field-ids*)
            resolve-database
            (resolve-tables @*table-ids*))))


;; ## -------------------- Field + Value --------------------

(defprotocol IField
  "Methods specific to the Query Expander `Field` record type."
  (qualified-name-components [this]
    "Return a vector of name components of the form `[table-name parent-names... field-name]`"))

;; Field is the expansion of a Field ID in the standard QL
(defrecord Field [^Integer field-id
                  ^String  field-name
                  ^String  field-display-name
                  ^Keyword base-type
                  ^Keyword special-type
                  ^Integer table-id
                  ^String  table-name
                  ^Integer position
                  ^String  description
                  ^Integer parent-id
                  parent] ; Field once its resolved; FieldPlaceholder before that
  IResolve
  (resolve-field [this field-id->fields]
    (cond
      parent          (if (= (type parent) Field)
                        this
                        (resolve-field parent field-id->fields))
      parent-id       (assoc this :parent (or (field-id->fields parent-id)
                                              (ph parent-id)))
      :else           this))

  (resolve-table [this table-id->table]
    (assoc this :table-name (:name (or (table-id->table table-id)
                                       (throw (Exception. (format "Query expansion failed: could not find table %d." table-id)))))))

  IField
  (qualified-name-components [this]
    (conj (if parent
            (qualified-name-components parent)
            [table-name])
          field-name)))

(defn- unexpanded-Field?
  "Is this a valid value for a `Field` ID in an unexpanded query? (i.e. an integer or `fk->` form)."
  ;; ["aggregation" 0] "back-reference" form not included here since its specific to the order_by clause
  [field]
  (match field
    (field-id :guard integer?)                                             true
    ["fk->" (fk-field-id :guard integer?) (dest-field-id :guard integer?)] true
    _                                                                      false))

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
(defrecord FieldPlaceholder [^Integer field-id]
  IResolve
  (resolve-field [this field-id->fields]
    (or
     ;; try to resolve the Field with the ones available in field-id->fields
     (some->> (field-id->fields field-id)
              (merge this)
              map->Field)
     ;; If that fails just return ourselves as-is
     this)))

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
                      (u/parse-iso8601 value))
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
   (match field-id
     (id :guard integer?)
     (do (swap! *field-ids* conj id)
         (->FieldPlaceholder id))

     ["fk->" (fk-field-id :guard integer?) (dest-field-id :guard integer?)]
     (do (assert-driver-supports :foreign-keys)
         (swap! *field-ids* conj dest-field-id)
         (swap! *fk-field-ids* conj fk-field-id)
         (->FieldPlaceholder dest-field-id))

      _ (throw (Exception. (str "Invalid field: " field-id)))))
  ([field-id value]
   (->ValuePlaceholder (:field-id (ph field-id)) value)))


;; # ======================================== CLAUSE DEFINITIONS ========================================

(defmacro defparser
  "Convenience for writing a parser function, i.e. one that pattern-matches against a lone argument."
  [fn-name & match-forms]
  `(defn ~(vary-meta fn-name assoc :private true) [form#]
     (when (non-empty-clause? form#)
       (match form#
         ~@match-forms
         form# (throw (Exception. (format ~(format "%s failed: invalid clause: %%s" fn-name) form#)))))))

;; ## -------------------- Aggregation --------------------

(defrecord Aggregation [^Keyword aggregation-type
                        ^Field field])

(defparser parse-aggregation
  ["rows"]                                         (->Aggregation :rows nil)
  ["count"]                                        (->Aggregation :count nil)
  ["avg" (field-id :guard unexpanded-Field?)]      (->Aggregation :avg (ph field-id))
  ["count" (field-id :guard unexpanded-Field?)]    (->Aggregation :count (ph field-id))
  ["distinct" (field-id :guard unexpanded-Field?)] (->Aggregation :distinct (ph field-id))
  ["stddev" (field-id :guard unexpanded-Field?)]   (do (assert-driver-supports :standard-deviation-aggregations)
                                                       (->Aggregation :stddev (ph field-id)))
  ["sum" (field-id :guard unexpanded-Field?)]      (->Aggregation :sum (ph field-id))
  ["cum_sum" (field-id :guard unexpanded-Field?)]  (->Aggregation :cumulative-sum (ph field-id)))


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
                          ^Float lat
                          ^Float lon])

(defrecord Filter:Between [^Keyword filter-type
                           ^Field   field
                           ^Value   min-val
                           ^Value   max-val])

(defrecord Filter:Field+Value [^Keyword filter-type
                               ^Field   field
                               ^Value   value])

(defrecord Filter:Field [^Keyword filter-type
                         ^Field   field])


;; ### Parsers

(defn- orderable-Value?
  "Is V an unexpanded value that can be compared with operators such as `<` and `>`?
   i.e. This is true of numbers and dates, but not of other strings or booleans."
  [v]
  (match v
    (_ :guard number?)         true
    (_ :guard u/date-string?)  true
    _                          false))

(defn- Value?
  "Is V a valid unexpanded `Value`?"
  [v]
  (or (string? v)
      (= v true)
      (= v false)
      (orderable-Value? v)))

(defparser parse-filter-subclause
   ["INSIDE" (lat-field :guard unexpanded-Field?) (lon-field :guard unexpanded-Field?) (lat-max :guard number?) (lon-min :guard number?) (lat-min :guard number?) (lon-max :guard number?)]
  (map->Filter:Inside {:filter-type :inside
                       :lat         {:field (ph lat-field)
                                     :min   (ph lat-field lat-min)
                                     :max   (ph lat-field lat-max)}
                       :lon         {:field (ph lon-field)
                                     :min   (ph lon-field lon-min)
                                     :max   (ph lon-field lon-max)}})

  ["BETWEEN" (field-id :guard unexpanded-Field?) (min :guard orderable-Value?) (max :guard orderable-Value?)]
  (map->Filter:Between {:filter-type :between
                        :field       (ph field-id)
                        :min-val     (ph field-id min)
                        :max-val     (ph field-id max)})

  ;; Single-value != and =
  [(filter-type :guard (partial contains? #{"!=" "="})) (field-id :guard unexpanded-Field?) (val :guard Value?)]
  (map->Filter:Field+Value {:filter-type (keyword filter-type)
                            :field       (ph field-id)
                            :value       (ph field-id val)})

  ;; <, >, <=, >= - like single-value != and =, but value must be orderable
  [(filter-type :guard (partial contains? #{"<" ">" "<=" ">="})) (field-id :guard unexpanded-Field?) (val :guard orderable-Value?)]
  (map->Filter:Field+Value {:filter-type (keyword filter-type)
                            :field       (ph field-id)
                            :value       (ph field-id val)})

  ;; = with more than one value -- Convert to OR and series of = clauses
  ["=" (field-id :guard unexpanded-Field?) & (values :guard #(and (seq %) (every? Value? %)))]
  (map->Filter {:compound-type :or
                :subclauses    (vec (for [value values]
                                      (map->Filter:Field+Value {:filter-type :=
                                                                :field       (ph field-id)
                                                                :value       (ph field-id value)})))})

  ;; != with more than one value -- Convert to AND and series of != clauses
  ["!=" (field-id :guard unexpanded-Field?) & (values :guard #(and (seq %) (every? Value? %)))]
  (map->Filter {:compound-type :and
                :subclauses    (vec (for [value values]
                                      (map->Filter:Field+Value {:filter-type :!=
                                                                :field       (ph field-id)
                                                                :value       (ph field-id value)})))})

  [(filter-type :guard (partial contains? #{"STARTS_WITH" "CONTAINS" "ENDS_WITH"})) (field-id :guard unexpanded-Field?) (val :guard string?)]
  (map->Filter:Field+Value {:filter-type (case filter-type
                                           "STARTS_WITH" :starts-with
                                           "CONTAINS"    :contains
                                           "ENDS_WITH"   :ends-with)
                            :field       (ph field-id)
                            :value       (ph field-id val)})

  [(filter-type :guard string?) (field-id :guard unexpanded-Field?)]
  (map->Filter:Field {:filter-type (case filter-type
                                     "NOT_NULL" :not-null
                                     "IS_NULL"  :is-null)
                      :field       (ph field-id)}))

(defparser parse-filter
  ["AND" & subclauses] (map->Filter {:compound-type :and
                                     :subclauses    (mapv parse-filter subclauses)})
  ["OR" & subclauses]  (map->Filter {:compound-type :or
                                     :subclauses    (mapv parse-filter subclauses)})
  subclause            (parse-filter-subclause subclause))


;; ## -------------------- Order-By --------------------

(defrecord OrderByAggregateField [^Keyword source           ; Name used in original query. Always :aggregation for right now
                                  ^Integer index            ; e.g. 0
                                  ^Aggregation aggregation] ; The aggregation clause being referred to
  IField
  (qualified-name-components [_]
    ;; Return something like [nil "count"]
    ;; nil is used where Table name would normally go
    [nil (name (:aggregation-type aggregation))]))


(defrecord OrderBySubclause [^Field   field       ; or aggregate Field?
                             ^Keyword direction]) ; either :ascending or :descending

(defn- parse-order-by-direction [direction]
  (case direction
    "ascending"  :ascending
    "descending" :descending))

(defparser parse-order-by-subclause
  [["aggregation" index] direction]               (let [{{:keys [aggregation]} :query} *original-query-dict*]
                                                    (assert aggregation "Query does not contain an aggregation clause.")
                                                    (->OrderBySubclause (->OrderByAggregateField :aggregation index (parse-aggregation aggregation))
                                                                        (parse-order-by-direction direction)))
  [(field-id :guard unexpanded-Field?) direction] (->OrderBySubclause (ph field-id)
                                                                      (parse-order-by-direction direction)))
(defparser parse-order-by
  subclauses (mapv parse-order-by-subclause subclauses))
