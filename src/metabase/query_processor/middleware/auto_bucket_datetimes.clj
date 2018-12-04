(ns metabase.query-processor.middleware.auto-bucket-datetimes
  "Middleware for automatically bucketing unbucketed `:type/DateTime` (but not `:type/Time`) Fields with `:day`
  bucketing. Applies to any unbucketed Field in a breakout, or fields in a filter clause being compared against
  `yyyy-MM-dd` format datetime strings."
  (:require [metabase.mbql
             [predicates :as mbql.preds]
             [schema :as mbql.s]
             [util :as mbql.u]]
            [metabase.models.field :refer [Field]]
            [metabase.util :as u]
            [metabase.util.schema :as su]
            [schema.core :as s]
            [toucan.db :as db]))

(def ^:private FieldTypeInfo
  {:base_type    (s/maybe su/FieldType)
   :special_type (s/maybe su/FieldType)
   s/Keyword     s/Any})

;; Unfortunately these Fields won't be in the store yet since Field resolution can't happen before we add the implicit
;; `:fields` clause, which happens after this
;;
;; TODO - What we could do tho is fetch all the stuff we need for the Store and then save these Fields in the store,
;; which would save a bit of time when we do resolve them
(s/defn ^:private unbucketed-fields->field-id->type-info :- {su/IntGreaterThanZero (s/maybe FieldTypeInfo)}
  "Fetch a map of Field ID -> type information for the Fields referred to by the `unbucketed-fields`."
  [unbucketed-fields :- (su/non-empty [mbql.s/field-id])]
  (u/key-by :id (db/select [Field :id :base_type :special_type]
                  :id [:in (set (map second unbucketed-fields))])))

(defn- yyyy-MM-dd-date-string? [x]
  (and (string? x)
       (re-matches #"^\d{4}-\d{2}-\d{2}$" x)))

(defn- should-not-be-autobucketed?
  "Is `x` a clause (or a clause that contains a clause) that we should definitely not autobucket?"
  [x]
  (or
   ;; do not autobucket Fields in a filter clause that either:
   (when (mbql.preds/Filter? x)
     (or
      ;; *  is not and equality or comparison filter. e.g. wouldn't make sense to bucket a field and then check if it is
      ;;    `NOT NULL`
      (not (mbql.u/is-clause? #{:= :!= :< :> :<= :>= :between} x))
      ;; *  has arguments that aren't `yyyy-MM-dd` date strings. The only reason we auto-bucket datetime Fields in the
      ;; *  first place is for legacy reasons, if someone is specifying additional info like hour/minute then we
      ;; *  shouldn't assume they want to bucket by day
      (let [[_ _ & vs] x]
        (not (every? yyyy-MM-dd-date-string? vs)))))
   ;; do not autobucket field-ids that are already wrapped by another Field clause like `datetime-field` or
   ;; `binning-strategy`
   (and (mbql.preds/Field? x)
        (not (mbql.u/is-clause? :field-id x)))))

(s/defn ^:private wrap-unbucketed-fields
  "Wrap Fields in breakouts and filters in a `:datetime-field` clause if appropriate; look at corresponing type
  information in `field-id->type-inf` to see if we should do so."
  ;; we only want to wrap clauses in `:breakout` and `:filter` so just make a 3-arg version of this fn that takes the
  ;; name of the clause to rewrite and call that twice
  ([query field-id->type-info :- {su/IntGreaterThanZero (s/maybe FieldTypeInfo)}]
   (-> query
       (wrap-unbucketed-fields field-id->type-info :breakout)
       (wrap-unbucketed-fields field-id->type-info :filter)))

  ([query field-id->type-info clause-to-rewrite]
   (mbql.u/replace-in query [:query clause-to-rewrite]
     ;; don't replace anything that's already wrapping a `field-id`
     (_ :guard should-not-be-autobucketed?)
     &match

     ;; if it's a raw `:field-id` and `field-id->type-info` tells us it's a `:type/DateTime` (but not `:type/Time`),
     ;; then go ahead and replace it
     [:field-id (_ :guard (comp mbql.u/datetime-but-not-time-field? field-id->type-info))]
     [:datetime-field &match :day])))

(s/defn ^:private auto-bucket-datetimes* :- mbql.s/Query
  [{{breakouts :breakout, filter-clause :filter} :query, :as query} :- mbql.s/Query]
  ;; find any breakouts or filters in the query that are just plain `[:field-id ...]` clauses (unwrapped by any other
  ;; clause)
  (if-let [unbucketed-fields (mbql.u/match (cons filter-clause breakouts)
                               (_ :guard should-not-be-autobucketed?) nil
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
  Field they refer to has a type that derives from `:type/DateTime` (but not `:type/Time`). (This is done for historic
  reasons, before datetime bucketing was added to MBQL; datetime Fields defaulted to breaking out by day. We might
  want to revisit this behavior in the future.)

  Applies to any unbucketed Field in a breakout, or fields in a filter clause being compared against `yyyy-MM-dd`
  format datetime strings."
  [qp]
  (comp qp auto-bucket-datetimes*))
