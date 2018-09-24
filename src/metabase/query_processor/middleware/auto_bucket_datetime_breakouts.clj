(ns metabase.query-processor.middleware.auto-bucket-datetime-breakouts
  "Middleware for automatically bucketing unbucketed `:type/DateTime` breakout Fields with `:day` bucketing."
  (:require [metabase.mbql
             [schema :as mbql.s]
             [util :as mbql.u]]
            [metabase.models.field :refer [Field]]
            [metabase.util :as u]
            [metabase.util.schema :as su]
            [schema.core :as s]
            [toucan.db :as db]))

(def ^:private FieldTypeInfo
  {:id           su/IntGreaterThanZero
   :base_type    (s/maybe su/FieldType)
   :special_type (s/maybe su/FieldType)})

(s/defn ^:private is-datetime-field?
  [{base-type :base_type, special-type :special_type} :- (s/maybe FieldTypeInfo)]
  (or (isa? base-type :type/DateTime)
      (isa? special-type :type/DateTime)))

(s/defn ^:private unbucketed-breakouts->field-id->type-info :- {su/IntGreaterThanZero (s/maybe FieldTypeInfo)}
  "Fetch a map of Field ID -> type information for the Fields referred to by the `unbucketed-breakouts`."
  [unbucketed-breakouts :- (su/non-empty [mbql.s/field-id])]
  (u/key-by :id (db/select [Field :id :base_type :special_type]
                  :id [:in (set (map second unbucketed-breakouts))])))

(s/defn ^:private wrap-unbucketed-datetime-breakouts :-  [mbql.s/Field]
  "Wrap each breakout in `breakouts` in a `:datetime-field` clause if appropriate; look at corresponing type
  information in `field-id->type-inf` to see if we should do so."
  [breakouts :- [mbql.s/Field], field-id->type-info :- {su/IntGreaterThanZero (s/maybe FieldTypeInfo)}]
  (for [breakout breakouts]
    (if (and (mbql.u/is-clause? :field-id breakout)
             (is-datetime-field? (field-id->type-info (second breakout))))
      [:datetime-field breakout :day]
      breakout)))

(s/defn ^:private auto-bucket-datetime-breakouts* :- mbql.s/Query
  [{{breakouts :breakout} :query, :as query} :- mbql.s/Query]
  ;; find any breakouts in the query that are just plain `[:field-id ...]` clauses
  (if-let [unbucketed-breakouts (seq (filter (partial mbql.u/is-clause? :field-id) breakouts))]
    ;; if we found some unbuketed breakouts, fetch the Fields & type info that are referred to by those breakouts...
    (let [field-id->type-info (unbucketed-breakouts->field-id->type-info unbucketed-breakouts)]
      ;; ...and then update each breakout by wrapping it if appropriate
      (update-in query [:query :breakout] #(wrap-unbucketed-datetime-breakouts % field-id->type-info)))
    ;; otherwise if there are no unbuketed breakouts return the query as-is
    query))

(defn auto-bucket-datetime-breakouts
  "Middleware that automatically wraps breakout `:field-id` clauses in `[:datetime-field ... :day]` if the Field they
  refer to has a type that derives from `:type/DateTime`. (This is done for historic reasons, before datetime
  bucketing was added to MBQL; datetime Fields defaulted to breaking out by day. We might want to revisit this
  behavior in the future.)"
  [qp]
  (comp qp auto-bucket-datetime-breakouts*))
