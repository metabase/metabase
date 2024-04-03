(ns metabase.query-processor.middleware.auto-bucket-datetimes
  "Middleware for automatically bucketing unbucketed `:type/Temporal` (but not `:type/Time`) Fields with `:day`
  bucketing. Applies to any unbucketed Field in a breakout, or fields in a filter clause being compared against
  `yyyy-MM-dd` format datetime strings."
  (:require
   [clojure.walk :as walk]
   [medley.core :as m]
   [metabase.legacy-mbql.predicates :as mbql.preds]
   [metabase.legacy-mbql.schema :as mbql.s]
   [metabase.legacy-mbql.schema.helpers :as schema.helpers]
   [metabase.lib.util.match :as lib.util.match]
   [metabase.query-processor.store :as qp.store]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu]
   [metabase.util.malli.schema :as ms]))

(def ^:private FieldTypeInfo
  [:map
   [:base-type [:maybe ms/FieldType]]
   [:semantic-type {:optional true} [:maybe ms/FieldSemanticOrRelationType]]])

(def ^:private FieldIDOrName->TypeInfo
  [:map-of
   [:or ms/NonBlankString ms/PositiveInt]
   [:maybe FieldTypeInfo]])

;; Unfortunately these Fields won't be in the store yet since Field resolution can't happen before we add the implicit
;; `:fields` clause, which happens after this
;;
;; TODO - What we could do tho is fetch all the stuff we need for the Store and then save these Fields in the store,
;; which would save a bit of time when we do resolve them
(mu/defn ^:private unbucketed-fields->field-id->type-info :- FieldIDOrName->TypeInfo
  "Fetch a map of Field ID -> type information for the Fields referred to by the `unbucketed-fields`."
  [unbucketed-fields :- [:sequential {:min 1} mbql.s/field]]
  (merge
   ;; build map of field-literal-name -> {:base-type base-type}
   (into {} (for [[_ id-or-name {:keys [base-type]}] unbucketed-fields
                  :when                              (string? id-or-name)]
              [id-or-name {:base-type base-type}]))
   ;; build map of field ID -> <info from DB>
   (when-let [field-ids (not-empty (into #{}
                                         (comp (map second)
                                               (filter integer?))
                                         unbucketed-fields))]
     (into {} (for [{id :id, :as field} (try
                                          (qp.store/bulk-metadata :metadata/column field-ids)
                                          ;; don't fail if some of the Fields are invalid.
                                          (catch Throwable e
                                            (log/errorf e "Error fetching Fields: %s" (ex-message e))
                                            nil))]
                [id (select-keys field [:base-type :effective-type :semantic-type])])))))

(defn- yyyy-MM-dd-date-string? [x]
  (and (string? x)
       (re-matches #"^\d{4}-\d{2}-\d{2}$" x)))

(defn- auto-bucketable-value? [v]
  (or (yyyy-MM-dd-date-string? v)
      (schema.helpers/is-clause? :relative-datetime v)))

(defn- should-not-be-autobucketed?
  "Is `x` a clause (or a clause that contains a clause) that we should definitely not autobucket?"
  [x]
  (or
   ;; do not autobucket Fields in a non-compound filter clause that either:
   (when (and (mbql.preds/Filter? x)
              (not (schema.helpers/is-clause? #{:and :or :not} x)))
     (or
      ;; *  is not an equality or comparison filter. e.g. wouldn't make sense to bucket a field and then check if it is
      ;;    `NOT NULL`
      (not (schema.helpers/is-clause? #{:= :!= :< :> :<= :>= :between} x))
      ;; *  has arguments that aren't `yyyy-MM-dd` date strings. The only reason we auto-bucket datetime Fields in the
      ;; *  first place is for legacy reasons, if someone is specifying additional info like hour/minute then we
      ;; *  shouldn't assume they want to bucket by day
      (let [[_ _ & vs] x]
        (not (every? auto-bucketable-value? vs)))))
   ;; do not auto-bucket fields inside a `:time-interval` filter: it already supplies its own unit
   ;; do not auto-bucket fields inside a `:datetime-diff` clause: the precise timestamp is needed for the difference
   (schema.helpers/is-clause? #{:time-interval :datetime-diff} x)
   ;; do not autobucket Fields that already have a temporal unit, or have a binning strategy
   (and (schema.helpers/is-clause? :field x)
        (let [[_ _ opts] x]
          ((some-fn :temporal-unit :binning) opts)))))

(defn- date-or-datetime-field? [{base-type :base-type, effective-type :effective-type}]
  (some (fn [field-type]
          (some #(isa? field-type %)
                [:type/Date :type/DateTime]))
        [base-type effective-type]))

(mu/defn ^:private wrap-unbucketed-fields
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
               (lib.util.match/replace x
                 ;; don't replace anything that's already bucketed or otherwise is not subject to autobucketing
                 (_ :guard should-not-be-autobucketed?)
                 &match

                 ;; if it's a `:field` clause and `field-id->type-info` tells us it's a `:type/Temporal` (but not
                 ;; `:type/Time`), then go ahead and replace it
                 [:field (id-or-name :guard datetime-but-not-time?) opts]
                 [:field id-or-name (assoc opts :temporal-unit :day)]))]
       (m/update-existing inner-query clause-to-rewrite wrap-fields)))))

(mu/defn ^:private auto-bucket-datetimes-this-level
  [{breakouts :breakout, filter-clause :filter, :as inner-query}]
  ;; find any breakouts or filters in the query that are just plain `[:field-id ...]` clauses (unwrapped by any other
  ;; clause)
  (if-let [unbucketed-fields (lib.util.match/match (cons filter-clause breakouts)
                               (_ :guard should-not-be-autobucketed?) nil
                               :field                                 &match)]
    ;; if we found some unbucketed breakouts/filters, fetch the Fields & type info that are referred to by those
    ;; breakouts/filters...
    (let [field-id->type-info (unbucketed-fields->field-id->type-info unbucketed-fields)]
      ;; ...and then update each breakout/filter by wrapping it if appropriate
      (wrap-unbucketed-fields inner-query field-id->type-info))
    ;; otherwise if there are no unbucketed breakouts/filters return the query as-is
    inner-query))

(defn auto-bucket-datetimes
  "Middleware that automatically adds `:temporal-unit` `:day` to breakout and filter `:field` clauses if the Field they
  refer to has a type that derives from `:type/Temporal` (but not `:type/Time`). (This is done for historic reasons,
  before datetime bucketing was added to MBQL; datetime Fields defaulted to breaking out by day. We might want to
  revisit this behavior in the future.)

  Applies to any unbucketed Field in a breakout, or fields in a filter clause being compared against `yyyy-MM-dd`
  format datetime strings."
  [{query-type :type, :as query}]
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
