(ns metabase.query-processor.middleware.auto-bucket-datetimes
  "Middleware for automatically bucketing unbucketed `:type/Temporal` (but not `:type/Time`) Fields with `:day`
  bucketing. Applies to any unbucketed Field in a breakout, or fields in a filter clause being compared against
  `yyyy-MM-dd` format datetime strings."
  (:require [metabase.mbql
             [predicates :as mbql.preds]
             [schema :as mbql.s]
             [util :as mbql.u]]
            [metabase.mbql.schema.helpers :as mbql.s.helpers]
            [metabase.models.field :refer [Field]]
            [metabase.util :as u]
            [metabase.util.schema :as su]
            [schema.core :as s]
            [toucan.db :as db]))

(def ^:private FieldTypeInfo
  {:base_type                     (s/maybe su/FieldType)
   (s/optional-key :special_type) (s/maybe su/FieldType)
   s/Keyword                      s/Any})

(def ^:private FieldIDOrName->TypeInfo
  {(s/cond-pre su/NonBlankString su/IntGreaterThanZero) (s/maybe FieldTypeInfo)})

;; Unfortunately these Fields won't be in the store yet since Field resolution can't happen before we add the implicit
;; `:fields` clause, which happens after this
;;
;; TODO - What we could do tho is fetch all the stuff we need for the Store and then save these Fields in the store,
;; which would save a bit of time when we do resolve them
(s/defn ^:private unbucketed-fields->field-id->type-info :- FieldIDOrName->TypeInfo
  "Fetch a map of Field ID -> type information for the Fields referred to by the `unbucketed-fields`."
  [unbucketed-fields :- (su/non-empty [(mbql.s.helpers/one-of mbql.s/field-id mbql.s/field-literal)])]
  (merge
   ;; build map of field-literal-name -> {:base_type base-type}
   (into {} (for [[clause field-name base-type] unbucketed-fields
                  :when                         (= clause :field-literal)]
              [field-name {:base_type base-type}]))
   ;; build map of field ID -> <info from DB>
   (when-let [field-ids (seq (filter integer? (map second unbucketed-fields)))]
     (u/key-by :id (db/select [Field :id :base_type :special_type]
                     :id [:in (set field-ids)])))))

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
   ;; do not autobucket field-ids that are already wrapped by another Field clause like `datetime-field` or
   ;; `binning-strategy`
   (and (mbql.preds/Field? x)
        (not (mbql.u/is-clause? #{:field-id :field-literal} x)))))

(defn- date-or-datetime-field? [{base-type :base_type, special-type :special_type}]
  (some (fn [field-type]
          (some #(isa? field-type %)
                [:type/Date :type/DateTime]))
        [base-type special-type]))

(s/defn ^:private wrap-unbucketed-fields
  "Wrap Fields in breakouts and filters in a `:datetime-field` clause if appropriate; look at corresponing type
  information in `field-id->type-inf` to see if we should do so."
  ;; we only want to wrap clauses in `:breakout` and `:filter` so just make a 3-arg version of this fn that takes the
  ;; name of the clause to rewrite and call that twice
  ([query field-id->type-info :- FieldIDOrName->TypeInfo]
   (-> query
       (wrap-unbucketed-fields field-id->type-info :breakout)
       (wrap-unbucketed-fields field-id->type-info :filter)))

  ([query field-id->type-info clause-to-rewrite]
   (let [datetime-but-not-time? (comp date-or-datetime-field? field-id->type-info)]
     (mbql.u/replace-in query [:query clause-to-rewrite]
       ;; don't replace anything that's already wrapping a `field-id`
       (_ :guard should-not-be-autobucketed?)
       &match

       ;; if it's a raw `:field-id` and `field-id->type-info` tells us it's a `:type/Temporal` (but not `:type/Time`),
       ;; then go ahead and replace it
       [(_ :guard #{:field-id :field-literal}) (_ :guard datetime-but-not-time?) & _]
       [:datetime-field &match :day]))))

(s/defn ^:private auto-bucket-datetimes*
  [{{breakouts :breakout, filter-clause :filter} :query, :as query}]
  ;; find any breakouts or filters in the query that are just plain `[:field-id ...]` clauses (unwrapped by any other
  ;; clause)
  (if-let [unbucketed-fields (mbql.u/match (cons filter-clause breakouts)
                               (_ :guard should-not-be-autobucketed?) nil
                               [:field-literal _ _]                   &match
                               [:field-id _]                          &match)]
    ;; if we found some unbucketed breakouts/filters, fetch the Fields & type info that are referred to by those
    ;; breakouts/filters...
    (let [field-id->type-info (unbucketed-fields->field-id->type-info unbucketed-fields)]
      ;; ...and then update each breakout/filter by wrapping it if appropriate
      (wrap-unbucketed-fields query field-id->type-info))
    ;; otherwise if there are no unbuketed breakouts/filters return the query as-is
    query))

(defn auto-bucket-datetimes
  "Middleware that automatically wraps breakout and filter `:field-id` clauses in `[:datetime-field ... :day]` if the
  Field they refer to has a type that derives from `:type/Temporal` (but not `:type/Time`). (This is done for historic
  reasons, before datetime bucketing was added to MBQL; datetime Fields defaulted to breaking out by day. We might
  want to revisit this behavior in the future.)

  Applies to any unbucketed Field in a breakout, or fields in a filter clause being compared against `yyyy-MM-dd`
  format datetime strings."
  [qp]
  (fn [query rff context]
    (qp (auto-bucket-datetimes* query) rff context)))
