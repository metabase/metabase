(ns metabase.query-processor.middleware.auto-bucket-datetimes
  "Middleware for automatically bucketing unbucketed `:type/Temporal` (but not `:type/Time`) Fields with `:day`
  bucketing. Applies to any unbucketed Field in a breakout, or fields in a filter clause being compared against
  `yyyy-MM-dd` format datetime strings."
  (:require [clojure.set :as set]
            [clojure.walk :as walk]
            [medley.core :as m]
            [metabase.mbql.predicates :as mbql.preds]
            [metabase.mbql.schema :as mbql.s]
            [metabase.mbql.util :as mbql.u]
            [metabase.models.field :refer [Field]]
            [metabase.util.schema :as su]
            [schema.core :as s]
            [toucan.db :as db]))

(def ^:private FieldTypeInfo
  {:base-type                      (s/maybe su/FieldType)
   (s/optional-key :semantic-type) (s/maybe su/FieldSemanticOrRelationType)
   s/Keyword                       s/Any})

(def ^:private FieldIDOrName->TypeInfo
  {(s/cond-pre su/NonBlankString su/IntGreaterThanZero) (s/maybe FieldTypeInfo)})

;; Unfortunately these Fields won't be in the store yet since Field resolution can't happen before we add the implicit
;; `:fields` clause, which happens after this
;;
;; TODO - What we could do tho is fetch all the stuff we need for the Store and then save these Fields in the store,
;; which would save a bit of time when we do resolve them
(s/defn ^:private unbucketed-fields->field-id->type-info :- FieldIDOrName->TypeInfo
  "Fetch a map of Field ID -> type information for the Fields referred to by the `unbucketed-fields`."
  [unbucketed-fields :- (su/non-empty [mbql.s/field])]
  (merge
   ;; build map of field-literal-name -> {:base-type base-type}
   (into {} (for [[_ id-or-name {:keys [base-type]}] unbucketed-fields
                  :when                              (string? id-or-name)]
              [id-or-name {:base-type base-type}]))
   ;; build map of field ID -> <info from DB>
   (when-let [field-ids (seq (filter integer? (map second unbucketed-fields)))]
     (into {} (for [{id :id, :as field}
                    (db/select [Field :id :base_type :effective_type :semantic_type]
                      :id [:in (set field-ids)])]
                [id (set/rename-keys (select-keys field
                                                  [:base_type :effective_type :semantic_type])
                                     {:base_type      :base-type
                                      :effective_type :effective-type
                                      :semantic_type  :semantic-type})])))))

(defn- yyyy-MM-dd-date-string? [x]
  (and (string? x)
       (re-matches #"^\d{4}-\d{2}-\d{2}$" x)))

(defn- auto-bucketable-value? [v]
  (or (yyyy-MM-dd-date-string? v)
      (mbql.u/is-clause? :relative-datetime v)))

(defn- should-not-be-autobucketed?
  "Is `x` a clause (or a clause that contains a clause) that we should definitely not autobucket?"
  [x]
  (or
   ;; do not autobucket Fields in a non-compound filter clause that either:
   (when (and (mbql.preds/Filter? x)
              (not (mbql.u/is-clause? #{:and :or :not} x)))
     (or
      ;; *  is not an equality or comparison filter. e.g. wouldn't make sense to bucket a field and then check if it is
      ;;    `NOT NULL`
      (not (mbql.u/is-clause? #{:= :!= :< :> :<= :>= :between} x))
      ;; *  has arguments that aren't `yyyy-MM-dd` date strings. The only reason we auto-bucket datetime Fields in the
      ;; *  first place is for legacy reasons, if someone is specifying additional info like hour/minute then we
      ;; *  shouldn't assume they want to bucket by day
      (let [[_ _ & vs] x]
        (not (every? auto-bucketable-value? vs)))))
   ;; do not auto-bucket fields inside a `:time-interval` filter -- it already supplies its own unit
   (mbql.u/is-clause? :time-interval x)
   ;; do not autobucket Fields that already have a temporal unit, or have a binning strategy
   (and (mbql.u/is-clause? :field x)
        (let [[_ _ opts] x]
          ((some-fn :temporal-unit :binning) opts)))))

(defn- date-or-datetime-field? [{base-type :base-type, effective-type :effective-type}]
  (some (fn [field-type]
          (some #(isa? field-type %)
                [:type/Date :type/DateTime]))
        [base-type effective-type]))

(s/defn ^:private wrap-unbucketed-fields
  "Add `:temporal-unit` to `:field`s in breakouts and filters if appropriate; look at corresponing type information in
  `field-id->type-info` to see if we should do so."
  ;; we only want to wrap clauses in `:breakout` and `:filter` so just make a 3-arg version of this fn that takes the
  ;; name of the clause to rewrite and call that twice
  ([inner-query field-id->type-info :- FieldIDOrName->TypeInfo]
   (-> inner-query
       (wrap-unbucketed-fields field-id->type-info :breakout)
       (wrap-unbucketed-fields field-id->type-info :filter)))

  ([inner-query field-id->type-info clause-to-rewrite]
   (let [datetime-but-not-time? (comp date-or-datetime-field? field-id->type-info)]
     (letfn [(wrap-fields [x]
               (mbql.u/replace x
                 ;; don't replace anything that's already bucketed or otherwise is not subject to autobucketing
                 (_ :guard should-not-be-autobucketed?)
                 &match

                 ;; if it's a `:field` clause and `field-id->type-info` tells us it's a `:type/Temporal` (but not
                 ;; `:type/Time`), then go ahead and replace it
                 [:field (id-or-name :guard datetime-but-not-time?) opts]
                 [:field id-or-name (assoc opts :temporal-unit :day)]))]
       (m/update-existing inner-query clause-to-rewrite wrap-fields)))))

(s/defn ^:private auto-bucket-datetimes-this-level
  [{breakouts :breakout, filter-clause :filter, :as inner-query}]
  ;; find any breakouts or filters in the query that are just plain `[:field-id ...]` clauses (unwrapped by any other
  ;; clause)
  (if-let [unbucketed-fields (mbql.u/match (cons filter-clause breakouts)
                               (_ :guard should-not-be-autobucketed?) nil
                               :field                                 &match)]
    ;; if we found some unbucketed breakouts/filters, fetch the Fields & type info that are referred to by those
    ;; breakouts/filters...
    (let [field-id->type-info (unbucketed-fields->field-id->type-info unbucketed-fields)]
      ;; ...and then update each breakout/filter by wrapping it if appropriate
      (wrap-unbucketed-fields inner-query field-id->type-info))
    ;; otherwise if there are no unbucketed breakouts/filters return the query as-is
    inner-query))

(defn- auto-bucket-datetimes-all-levels [{query-type :type, :as query}]
  (if (not= query-type :query)
    query
    ;; walk query, looking for inner-query forms that have a `:filter` key
    (walk/postwalk
     (fn [form]
       (if (and (map? form)
                (or (seq (:filter form))
                    (seq (:breakout form))))
         (auto-bucket-datetimes-this-level form)
         form))
     query)))

(defn auto-bucket-datetimes
  "Middleware that automatically adds `:temporal-unit` `:day` to breakout and filter `:field` clauses if the Field they
  refer to has a type that derives from `:type/Temporal` (but not `:type/Time`). (This is done for historic reasons,
  before datetime bucketing was added to MBQL; datetime Fields defaulted to breaking out by day. We might want to
  revisit this behavior in the future.)

  Applies to any unbucketed Field in a breakout, or fields in a filter clause being compared against `yyyy-MM-dd`
  format datetime strings."
  [qp]
  (fn [query rff context]
    (qp (auto-bucket-datetimes-all-levels query) rff context)))
