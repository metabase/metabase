(ns metabase.query-processor.middleware.auto-bucket-datetimes
  "Middleware for automatically bucketing unbucketed `:type/Temporal` (but not `:type/Time`) Fields with `:day`
  bucketing. Applies to any unbucketed Field in a breakout, or fields in a filter clause being compared against
  `yyyy-MM-dd` format datetime strings."
  (:require
   [medley.core :as m]
   [metabase.legacy-mbql.util :as mbql.u]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.lib.schema :as lib.schema]
   [metabase.lib.schema.common :as lib.schema.common]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.lib.util.match :as lib.util.match]
   [metabase.lib.walk :as lib.walk]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu]
   [metabase.util.malli.registry :as mr]))

(mr/def ::column-type-info
  [:map
   [:base-type      [:maybe ::lib.schema.common/base-type]]
   [:effective-type [:maybe ::lib.schema.common/base-type]]
   [:semantic-type {:optional true} [:maybe ::lib.schema.common/semantic-or-relation-type]]])

(mr/def ::column-id-or-name->type-info
  [:map-of
   [:or ::lib.schema.common/non-blank-string ::lib.schema.id/field]
   [:maybe ::column-type-info]])

;; Unfortunately these Fields won't be in the store yet since Field resolution can't happen before we add the implicit
;; `:fields` clause, which happens after this
;;
;; TODO - What we could do tho is fetch all the stuff we need for the Store and then save these Fields in the store,
;; which would save a bit of time when we do resolve them
(mu/defn ^:private unbucketed-fields->field-id->type-info :- [:maybe ::column-id-or-name->type-info]
  "Fetch a map of Field ID -> type information for the Fields referred to by the `unbucketed-fields`. Return an empty map
  for empty `unbucketed-fields`."
  [metadata-providerable unbucketed-fields :- [:maybe [:sequential :mbql.clause/field]]]
  (merge
   ;; build map of field-literal-name -> {:base-type base-type}
   (into {} (for [[_tag opts id-or-name] unbucketed-fields
                  :when                 (string? id-or-name)]
              [id-or-name {:base-type      (:base-type opts)
                           :effective-type ((some-fn :effective-type :base-type) opts)}]))
   ;; build map of field ID -> <info from DB>
   (when-let [field-ids (not-empty (into #{}
                                         (comp (map peek)
                                               (filter integer?))
                                         unbucketed-fields))]
     (into {} (for [{id :id, :as field} (try
                                          (lib.metadata/bulk-metadata-or-throw metadata-providerable
                                                                               :metadata/column
                                                                               field-ids)
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
      (mbql.u/is-clause? :relative-datetime v)))

(mu/defn ^:private filter-clause?
  [query      :- ::lib.schema/query
   stage-path :- ::lib.walk/stage-path
   x]
  (and (mbql.u/mbql-clause? x)
       (when-let [expr-type (try
                              (lib.walk/apply-f-for-stage-at-path lib/type-of query stage-path x)
                              (catch Throwable e
                                (log/errorf e "Error calculating expression type: %s" (ex-message e))
                                nil))]
         (isa? expr-type :type/Boolean))))

(mu/defn ^:private simple-filter-clause?
  [query      :- ::lib.schema/query
   stage-path :- ::lib.walk/stage-path
   x]
  (and (filter-clause? query stage-path x)
       (not (mbql.u/is-clause? #{:and :or :not} x))))

(mr/def ::do-not-bucket-reason
  [:and
   qualified-keyword?
   [:fn
    {:error/message "do-not-bucket-reason keyword"}
    #(= (namespace %) "do-not-bucket-reason")]])

;;; This returns a keyword corresponding to why we're not autobucketing for debugging/testing purposes
(mu/defn ^:private should-not-be-autobucketed? :- [:maybe ::do-not-bucket-reason]
  "Is `x` a clause (or a clause that contains a clause) that we should definitely not autobucket?"
  [query      :- ::lib.schema/query
   stage-path :- ::lib.walk/stage-path
   x]
  (cond
    ;; do not autobucket clauses in a non-compound filter clause that either:
    (simple-filter-clause? query stage-path x)
    (cond
      ;; *  is not an equality or comparison filter. e.g. wouldn't make sense to bucket a field and then check if it is
      ;;    `NOT NULL`
      (not (mbql.u/is-clause? #{:= :!= :< :> :<= :>= :between} x))
      :do-not-bucket-reason/not-equality-or-comparison-filter

      ;; *  has arguments that aren't `yyyy-MM-dd` date strings. The only reason we auto-bucket datetime clauses in the
      ;; *  first place is for legacy reasons, if someone is specifying additional info like hour/minute then we
      ;; *  shouldn't assume they want to bucket by day
      (let [[_tag _opts _ref & values] x]
        (not (every? auto-bucketable-value? values)))
      :do-not-bucket-reason/not-all-values-are-auto-bucketable)

    ;; *  do not autobucket clauses that are updating the time interval
    (lib.util.match/match-one x
      [(_tag :guard #{:+ :-})
       _
       [(_ :guard #{:expression :field}) _ _]
       [:interval _ _n (unit :guard #{:minute :hour :second})]])
    :do-not-bucket-reason/bucket-between-relative-starting-from

    ;; do not auto-bucket clauses inside a `:time-interval` filter: it already supplies its own unit
    ;; do not auto-bucket clauses inside a `:datetime-diff` clause: the precise timestamp is needed for the difference
    (mbql.u/is-clause? #{:time-interval :datetime-diff} x)
    :do-not-bucket-reason/bucketed-or-precise-operation

    ;; do not autobucket clauses that already have a temporal unit, or have a binning strategy
    (and (or (mbql.u/is-clause? :expression x)
             (mbql.u/is-clause? :field x))
         (let [[_tag opts _id-or-name] x]
           ((some-fn :temporal-unit :binning) opts)))
    :do-not-bucket-reason/field-with-bucketing-or-binning))

(mu/defn ^:private date-or-datetime-clause?
  [{base-type :base-type, effective-type :effective-type} :- ::column-type-info]
  (some (fn [field-type]
          (some #(isa? field-type %)
                [:type/Date :type/DateTime]))
        [base-type effective-type]))

(mu/defn ^:private wrap-unbucketed-clauses :- ::lib.schema/stage
  "Add `:temporal-unit` to `:field`s and `:expression`s in breakouts and filters if appropriate; for fields, look
  at corresponing type information in `field-id->type-info` to see if we should do so. For expressions examine the clause
  options."
  ;; we only want to wrap clauses in `:breakout` and `:filter` so just make a 3-arg version of this fn that takes the
  ;; name of the clause to rewrite and call that twice
  [query               :- ::lib.schema/query
   stage-path          :- ::lib.walk/stage-path
   stage               :- ::lib.schema/stage
   field-id->type-info :- [:maybe ::column-id-or-name->type-info]]
  (letfn [(datetime-but-not-time? [field-id]
            (some-> field-id field-id->type-info date-or-datetime-clause?))
          ;; Following function copies type extraction logic from [[unbucketed-fields->field-id->type-info]],
          ;; to conform original schema.
          (expression-opts->type-info [{:keys [base-type effective-type]}] :- ::column-id-or-name->type-info
            {:base-type base-type
             :effective-type (or effective-type base-type)})
          (wrap-clauses [x]
            (lib.util.match/replace x
              ;; don't replace anything that's already bucketed or otherwise is not subject to autobucketing
              (_ :guard (partial should-not-be-autobucketed? query stage-path))
              &match

              ;; if it's a `:field` clause and `field-id->type-info` tells us it's a `:type/Temporal` (but not
              ;; `:type/Time`), then go ahead and replace it
              [:field opts (id-or-name :guard datetime-but-not-time?)]
              [:field (assoc opts :temporal-unit :day) id-or-name]

              [:expression (opts :guard (comp date-or-datetime-clause? expression-opts->type-info)) name']
              [:expression (assoc opts :temporal-unit :day) name']))
          (rewrite-clause [stage clause-to-rewrite]
            (m/update-existing stage clause-to-rewrite wrap-clauses))]
    (-> stage
        (rewrite-clause :breakout)
        (rewrite-clause :filters))))

(mu/defn ^:private auto-bucket-datetimes-this-stage :- ::lib.schema/stage
  [query                                             :- ::lib.schema/query
   stage-path                                        :- ::lib.walk/stage-path
   {breakouts :breakout, :keys [filters], :as stage} :- ::lib.schema/stage]
  ;; find any breakouts or filters in the query that are just plain `[:field-id ...]` clauses (unwrapped by any other
  ;; clause)
  (if-let [unbucketed-clauses (lib.util.match/match (cons filters breakouts)
                                (_clause :guard (partial should-not-be-autobucketed? query stage-path)) nil
                                :expression                                  &match
                                :field                                       &match)]
    ;; if we found some unbucketed breakouts/filters, fetch the Fields & type info that are referred to by those
    ;; breakouts/filters...
    (let [unbucketed-fields (filter (comp (partial = :field) first) unbucketed-clauses)
          field-id->type-info (unbucketed-fields->field-id->type-info query unbucketed-fields)]
      ;; ...and then update each breakout/filter by wrapping it if appropriate
      (wrap-unbucketed-clauses query stage-path stage field-id->type-info))
    ;; otherwise if there are no unbucketed breakouts/filters return the query as-is
    stage))

(mu/defn auto-bucket-datetimes :- ::lib.schema/query
  "Middleware that automatically adds `:temporal-unit` `:day` to breakout and filter `:field` clauses if the Field they
  refer to has a type that derives from `:type/Temporal` (but not `:type/Time`). (This is done for historic reasons,
  before datetime bucketing was added to MBQL; datetime Fields defaulted to breaking out by day. We might want to
  revisit this behavior in the future.)

  Applies to any unbucketed Field in a breakout, or fields in a filter clause being compared against `yyyy-MM-dd`
  format datetime strings."
  [query :- ::lib.schema/query]
  (lib.walk/walk-stages
   query
   (fn [query stage-path stage]
     (when (or (seq (:filters stage))
               (seq (:breakout stage)))
       (auto-bucket-datetimes-this-stage query stage-path stage)))))
