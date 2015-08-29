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
            [metabase.driver.query-processor.interface :refer :all]
            (metabase.models [database :refer [Database]]
                             [field :as field]
                             [foreign-key :refer [ForeignKey]]
                             [table :refer [Table]])
            [metabase.util :as u])
  (:import clojure.lang.Keyword
           (metabase.driver.query_processor.interface DateTimeFieldPlaceholder
                                                      Field
                                                      FieldPlaceholder
                                                      Value)))

(declare parse-aggregation parse-breakout parse-fields parse-filter parse-order-by ph)

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
      (let [fields (into {} (for [[id field] (sel :many :id->fields [field/Field :name :display_name :base_type :special_type :preview_display :table_id :parent_id :description], :id [in field-ids])]
                              [id (let [{:keys [parent-id], :as field} (rename-mb-field-keys field)]
                                    (map->Field (merge field (when parent-id {:parent (ph parent-id)}))))]))]

        (swap! *table-ids* set/union (set (map :table-id (vals fields))))
        ;; Recurse in case any new [nested] Field placeholders were emitted and we need to do recursive Field resolution
        ;; We can't use recur here because binding wraps body in try/catch
        (resolve-fields (walk/prewalk #(resolve-field % fields) expanded-query-dict) @*field-ids*)))))

(defn- resolve-database
  "Resolve the `Database` in question for an EXPANDED-QUERY-DICT."
  [{database-id :database, :as expanded-query-dict}]
  (assoc expanded-query-dict :database (sel :one :fields [Database :name :id :engine :details] :id database-id)))

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

(defn- unexpanded-Field?
  "Is this a valid value for a `Field` ID in an unexpanded query? (i.e. an integer or `fk->` form)."
  ;; ["aggregation" 0] "back-reference" form not included here since its specific to the order_by clause
  [field]
  (match field
    (field-id :guard integer?)                                             true
    ["fk->" (fk-field-id :guard integer?) (dest-field-id :guard integer?)] true
    _                                                                      false))

(defn- unexpanded-DateTimeField?
  "Is this a valid value for a `DateTimeField` in an unexpanded query? (e.g. `[\"datetime_field\" ...]`)"
  [field]
  (match field
    ["datetime_field" (_ :guard field-id?) "as" (_ :guard datetime-field-unit?)] true
    _                                                                           false))

(defn- unexpanded-Field?
  "Is this a valid field reference? (i.e. a Field ID or a `datetime_field`)."
  [field]
  (or (field-id? field)
      (unexpanded-DateTimeField? field)))

(defn- legacy-date-literal?
  "Is this a literal legacy date literal?"
  [v]
  (and (string? v)
       (re-matches #"^\d{4}-[01]\d-[0-3]\d$" v)))

(defn- datetime-value?
  "Is VALUE a datetime literal or relative value?"
  [value]
  (match value
    (_ :guard legacy-date-literal?)                                  true ; DEPRECATED
    ["datetime" (_ :guard u/date-string?)]                           true
    ["datetime" "now"]                                               true
    ["datetime" (_ :guard integer?) (_ :guard datetime-value-unit?)] true
    _                                                                false))

(defn- field-placeholder [field-id]
   {:post [(or (instance? FieldPlaceholder %)
               (instance? DateTimeFieldPlaceholder %))]}
   (match field-id
     (id :guard integer?)
     (do (swap! *field-ids* conj id)
         (->FieldPlaceholder id))

     ["fk->" (fk-field-id :guard integer?) (dest-field-id :guard integer?)]
     (do (assert-driver-supports :foreign-keys)
         (swap! *field-ids* conj dest-field-id)
         (swap! *fk-field-ids* conj fk-field-id)
         (->FieldPlaceholder dest-field-id))

     ["datetime_field" (field :guard field-id?) "as" (unit :guard datetime-field-unit?)]
     (->DateTimeFieldPlaceholder (:field-id (ph field)) (keyword unit))

     _ (throw (Exception. (str "Invalid field: " field-id)))))

(defn- value-placeholder [field value]
  {:pre [(or (instance? FieldPlaceholder field)
             (instance? DateTimeFieldPlaceholder field))
         (integer? (:field-id field))]}
  (match value
    ;; DEPRECATED - YYYY-MM-DD date strings should now be passed as ["datetime" ...]. Allowed here for backwards-compatibility.
    (literal :guard legacy-date-literal?)
    (->DateTimeLiteralPlaceholder field (u/parse-rfc-3339 literal))

    (_ :guard number?) (->ValuePlaceholder field value)
    (_ :guard string?) (->ValuePlaceholder field value)
    true               (->ValuePlaceholder field true)
    false              (->ValuePlaceholder field false)

    ["datetime" (literal :guard u/date-string?)]
    (->DateTimeLiteralPlaceholder field (u/parse-rfc-3339 literal))

    ["datetime" "now"]
    (->DateTimeValuePlaceholder field :day 0)

    ["datetime" (relative-amount :guard integer?) (unit :guard datetime-value-unit?)]
    (->DateTimeValuePlaceholder field (keyword unit) relative-amount)

    _ (throw (Exception. (format "Invalid value: '%s'" value)))))

(defn- ph
  "Create a new placeholder object for a Field ID or value."
  ([field-id]       (field-placeholder field-id))
  ([field-id value] (value-placeholder (ph field-id) value)))


;; # ======================================== CLAUSE DEFINITIONS ========================================

(defmacro defparser
  "Convenience for writing a parser function, i.e. one that pattern-matches against a lone argument."
  [fn-name & match-forms]
  `(defn ~(vary-meta fn-name assoc :private true) [form#]
     (when (non-empty-clause? form#)
       (match form#
         ~@match-forms
         ~'_ (throw (Exception. (format ~(format "%s failed: invalid clause: %%s" fn-name) form#)))))))

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

;; [TIME_INTERVAL ...] filters are just syntactic sugar for more complicated datetime filter subclauses.
;; This function parses the args to the TIME_INTERVAL and returns the appropriate subclause.
;; This clause is then recursively parsed below by parse-filter-subclause.
;;
;; A valid input looks like [TIME_INTERVAL <field> (current|last|next|<int>) <unit>] .
;;
;; "current", "last", and "next" are the same as supplying the integers 0, -1, and 1, respectively.
;; For these values, we want to generate a clause like [= [datetime_field <field> as <unit>] [datetime <int> <unit>]].
;;
;; For ints > 1 or < -1, we want to generate a range (i.e., a BETWEEN filter clause). These should *exclude* the current moment in time.
;;
;; e.g. [TIME_INTERVAL <field> -30 "day"] refers to the past 30 days, excluding today; i.e. the range of -31 days ago to -1 day ago.
;; Thus values of n < -1 translate to clauses like [BETWEEN [datetime_field <field> as day] [datetime -31 day] [datetime -1 day]].
(defparser parse-time-interval-filter-subclause
  ;; For "current"/"last"/"next" replace with the appropriate int and recurse
  [field "current" unit] (parse-time-interval-filter-subclause [field  0 unit])
  [field "last"    unit] (parse-time-interval-filter-subclause [field -1 unit])
  [field "next"    unit] (parse-time-interval-filter-subclause [field  1 unit])

  ;; For values of -1 <= n <= 1, generate the appropriate [= ...] clause
  [field  0 unit] ["=" ["datetime_field" field "as" unit] ["datetime" "now"]]
  [field -1 unit] ["=" ["datetime_field" field "as" unit] ["datetime" -1 unit]]
  [field  1 unit] ["=" ["datetime_field" field "as" unit] ["datetime"  1 unit]]

  ;; For other int values of n generate the appropriate [BETWEEN ...] clause
  [field (n :guard #(< % -1)) unit] ["BETWEEN" ["datetime_field" field "as" unit] ["datetime" (dec n) unit] ["datetime"      -1 unit]]
  [field (n :guard #(> %  1)) unit] ["BETWEEN" ["datetime_field" field "as" unit] ["datetime"       1 unit] ["datetime" (inc n) unit]])

(defparser parse-filter-subclause
  ["TIME_INTERVAL" (field-id :guard field-id?) (n :guard #(or (integer? %) (contains? #{"current" "last" "next"} %))) (unit :guard datetime-value-unit?)]
  (parse-filter-subclause (parse-time-interval-filter-subclause [field-id n (name unit)]))

  ["TIME_INTERVAL" & args]
  (throw (Exception. (format "Invalid TIME_INTERVAL clause: %s" args)))

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

(defrecord OrderBySubclause [^Field   field       ; or aggregate unexpanded-Field?
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
