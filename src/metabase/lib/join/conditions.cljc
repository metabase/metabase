(ns metabase.lib.join.conditions
  (:require
   [medley.core :as m]
   [metabase.lib.common :as lib.common]
   [metabase.lib.equality :as lib.equality]
   [metabase.lib.filter :as lib.filter]
   [metabase.lib.filter.operator :as lib.filter.operator]
   [metabase.lib.join.alias :as lib.join.alias]
   [metabase.lib.join.common :as lib.join.common]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.lib.metadata.calculation :as lib.metadata.calculation]
   [metabase.lib.schema :as lib.schema]
   [metabase.lib.schema.common :as lib.schema.common]
   [metabase.lib.schema.expression :as lib.schema.expression]
   [metabase.lib.schema.filter :as lib.schema.filter]
   [metabase.lib.schema.join :as lib.schema.join]
   [metabase.lib.schema.temporal-bucketing
    :as lib.schema.temporal-bucketing]
   [metabase.lib.temporal-bucket :as lib.temporal-bucket]
   [metabase.lib.types.isa :as lib.types.isa]
   [metabase.lib.util :as lib.util]
   [metabase.mbql.util.match :as mbql.u.match]
   [metabase.shared.util.i18n :as i18n]
   [metabase.util :as u]
   [metabase.util.malli :as mu]))

(mu/defn ^:private standard-join-condition? :- :boolean
  "Whether this join condition is a binary condition with two `:field` references (a LHS and a RHS), as you'd produce
  in the frontend using functions like [[join-condition-operators]], [[join-condition-lhs-columns]],
  and [[join-condition-rhs-columns]]."
  [condition  :- [:maybe ::lib.schema.expression/boolean]]
  (when condition
    (mbql.u.match/match-one condition
      [(_operator :guard keyword?)
       _opts
       [:field _lhs-opts _lhs-id-or-name]
       [:field _rhs-opts _rhs-id-or-name]]
      true
      _
      false)))

(defn standard-join-condition-lhs
  "If `condition` is a [[standard-join-condition?]], return the LHS."
  [condition]
  (when (standard-join-condition? condition)
    (let [[_operator _opts lhs _rhs] condition]
      lhs)))

(defn standard-join-condition-rhs
  "If `condition` is a [[standard-join-condition?]], return the RHS."
  [condition]
  (when (standard-join-condition? condition)
    (let [[_operator _opts _lhs rhs] condition]
      rhs)))

(defn standard-join-condition-update-rhs
  "If `condition` is a [[standard-join-condition?]], update the RHS with `f` like

    (apply f rhs args)"
  [condition f & args]
  (if-not (standard-join-condition? condition)
    condition
    (let [[operator opts lhs rhs] condition]
      [operator opts lhs (apply f rhs args)])))

(mu/defn join-conditions :- [:maybe ::lib.schema.join/conditions]
  "Get all join conditions for the given join"
  [a-join :- lib.join.common/PartialJoin]
  (:conditions a-join))

(defn- with-join-conditions-add-alias-to-rhses
  "Add `join-alias` to the RHS of all [[standard-join-condition?]] `conditions` that don't already have a `:join-alias`.
  If an RHS already has a `:join-alias`, don't second guess what was already explicitly specified."
  [conditions join-alias]
  (if-not join-alias
    conditions
    (mapv (fn [condition]
            (or (when-let [rhs (standard-join-condition-rhs condition)]
                  (when-not (lib.join.alias/current-join-alias rhs)
                    (standard-join-condition-update-rhs condition lib.join.alias/with-join-alias join-alias)))
                condition))
          conditions)))

(mu/defn with-join-conditions :- lib.join.common/PartialJoin
  "Update the `:conditions` (filters) for a Join clause."
  {:style/indent [:form]}
  [a-join     :- lib.join.common/PartialJoin
   conditions :- [:maybe [:sequential [:or ::lib.schema.expression/boolean ::lib.schema.common/external-op]]]]
  (let [conditions (-> (mapv lib.common/->op-arg conditions)
                       (with-join-conditions-add-alias-to-rhses (lib.join.alias/current-join-alias a-join)))]
    (u/assoc-dissoc a-join :conditions (not-empty conditions))))

;;; Building join conditions:
;;;
;;; The QB GUI needs to build a join condition before the join itself is attached to the query. There are three parts
;;; to a join condition. Suppose we're building a query like
;;;
;;;    SELECT * FROM order JOIN user ON order.user_id = user.id
;;;
;;; The condition is
;;;
;;;    order.user_id  =  user.id
;;;    ^^^^^^^^^^^^^  ^  ^^^^^^^
;;;          1        2     3
;;;
;;; and the three parts are:
;;;
;;; 1. LHS/source column: the column in the left-hand side of the condition, e.g. the `order.user_id` in the example
;;;    above. Either comes from the source Table, or a previous stage of the query, or a previously-joined
;;;    Table/Model/Saved Question. `order.user_id` presumably is an FK to `user.id`, and while this is typical, is not
;;;    required.
;;;
;;; 2. The operator: `=` in the example above. Corresponds to an `:=` MBQL clause. `=` is selected by default.
;;;
;;; 3. RHS/destination/target column: the column in the right-hand side of the condition e.g. `user.id` in the example
;;;    above. `user.id` is a column in the Table/Model/Saved Question we are joining against.
;;;
;;; The Query Builder allows selecting any of these three parts in any order. The functions below return possible
;;; options for each respective part. At the time of this writing, selecting one does not filter out incompatible
;;; options for the other parts, but hopefully we can implement this in the future -- see #31174

(mu/defn ^:private sort-join-condition-columns :- [:sequential lib.metadata/ColumnMetadata]
  "Sort potential join condition columns as returned by [[join-condition-lhs-columns]]
  or [[join-condition-rhs-columns]]. PK columns are returned first, followed by FK columns, followed by other columns.
  Otherwise original order is maintained."
  [columns :- [:sequential lib.metadata/ColumnMetadata]]
  (let [{:keys [pk fk other]} (group-by (fn [column]
                                          (cond
                                            (lib.types.isa/primary-key? column) :pk
                                            (lib.types.isa/foreign-key? column) :fk
                                            :else                               :other))
                                        columns)]
    (concat pk fk other)))

(defn- mark-selected-column [metadata-providerable existing-column-or-nil columns]
  (if-not existing-column-or-nil
    columns
    (lib.equality/mark-selected-columns metadata-providerable columns [existing-column-or-nil])))

(mu/defn join-condition-lhs-columns :- [:sequential lib.metadata/ColumnMetadata]
  "Get a sequence of columns that can be used as the left-hand-side (source column) in a join condition. This column
  is the one that comes from the source Table/Card/previous stage of the query or a previous join.

  If you are changing the LHS of a condition for an existing join, pass in that existing join as `join-or-joinable` so
  we can filter out the columns added by it (it doesn't make sense to present the columns added by a join as options
  for its own LHS) or added by later joins (joins can only depend on things from previous joins). Otherwise you can
  either pass in `nil` or the [[Joinable]] (Table or Card metadata) we're joining against when building a new
  join. (Things other than joins are ignored, but this argument is flexible for consistency with the signature
  of [[join-condition-rhs-columns]].) See #32005 for more info.

  If the left-hand-side column has already been chosen and we're UPDATING it, pass in `lhs-column-or-nil` so we can
  mark the current column as `:selected` in the metadata/display info.

  If the right-hand-side column has already been chosen (they can be chosen in any order in the Query Builder UI),
  pass in the chosen RHS column. In the future, this may be used to restrict results to compatible columns. (See #31174)

  Results will be returned in a 'somewhat smart' order with PKs and FKs returned before other columns.

  Unlike most other things that return columns, implicitly-joinable columns ARE NOT returned here."
  ([query joinable lhs-column-or-nil rhs-column-or-nil]
   (join-condition-lhs-columns query -1 joinable lhs-column-or-nil rhs-column-or-nil))

  ([query              :- ::lib.schema/query
    stage-number       :- :int
    join-or-joinable   :- [:maybe lib.join.common/JoinOrJoinable]
    lhs-column-or-nil  :- [:maybe lib.join.common/Field]
    ;; not yet used, hopefully we will use in the future when present for filtering incompatible columns out.
    _rhs-column-or-nil :- [:maybe lib.join.common/Field]]
   ;; calculate all the visible columns including the existing join; then filter out any columns that come from the
   ;; existing join and any subsequent joins. The reason for doing things this way rather than removing the joins
   ;; before calculating visible columns is that we don't want to either create possibly-invalid queries, or have to
   ;; rely on the logic in [[metabase.lib.remove-replace/remove-join]] which would cause circular references; this is
   ;; simpler as well.
   ;;
   ;; e.g. if we have joins [J1 J2 J3 J4] and current join = J2, then we want to ignore the visible columns from J2,
   ;; J3, and J4.
   (let [existing-join-alias    (when (lib.join.common/join? join-or-joinable)
                                  (lib.join.alias/current-join-alias join-or-joinable))
         join-aliases-to-ignore (into #{}
                                      (comp (map lib.join.alias/current-join-alias)
                                            (drop-while #(not= % existing-join-alias)))
                                      (lib.join.common/joins query stage-number))
         lhs-column-or-nil      (or lhs-column-or-nil
                                    (when (lib.join.common/join? join-or-joinable)
                                      (standard-join-condition-lhs (first (join-conditions join-or-joinable)))))]
     (->> (lib.metadata.calculation/visible-columns query stage-number
                                                    (lib.util/query-stage query stage-number)
                                                    {:include-implicitly-joinable? false})
          (remove (fn [col]
                    (when-let [col-join-alias (lib.join.alias/current-join-alias col)]
                      (contains? join-aliases-to-ignore col-join-alias))))
          (mark-selected-column query lhs-column-or-nil)
          sort-join-condition-columns))))

(mu/defn join-condition-rhs-columns :- [:sequential lib.metadata/ColumnMetadata]
  "Get a sequence of columns that can be used as the right-hand-side (target column) in a join condition. This column
  is the one that belongs to the thing being joined, `join-or-joinable`, which can be something like a
  Table ([[metabase.lib.metadata/TableMetadata]]), Saved Question/Model ([[metabase.lib.metadata/CardMetadata]]),
  another query, etc. -- anything you can pass to [[join-clause]]. You can also pass in an existing join.

  If the left-hand-side column has already been chosen (they can be chosen in any order in the Query Builder UI),
  pass in the chosen LHS column. In the future, this may be used to restrict results to compatible columns. (See #31174)

  If the right-hand-side column has already been chosen and we're UPDATING it, pass in `rhs-column-or-nil` so we can
  mark the current column as `:selected` in the metadata/display info.

  Results will be returned in a 'somewhat smart' order with PKs and FKs returned before other columns."
  ([query joinable lhs-column-or-nil rhs-column-or-nil]
   (join-condition-rhs-columns query -1 joinable lhs-column-or-nil rhs-column-or-nil))

  ([query              :- ::lib.schema/query
    stage-number       :- :int
    join-or-joinable   :- lib.join.common/JoinOrJoinable
    ;; not yet used, hopefully we will use in the future when present for filtering incompatible columns out.
    _lhs-column-or-nil :- [:maybe lib.join.common/Field]
    rhs-column-or-nil  :- [:maybe lib.join.common/Field]]
   ;; I was on the fence about whether these should get `:lib/source :source/joins` or not -- it seems like based on
   ;; the QB UI they shouldn't. See screenshots in #31174
   (let [joinable          (if (lib.join.common/join? join-or-joinable)
                             (lib.join.common/joined-thing query join-or-joinable)
                             join-or-joinable)
         join-alias        (when (lib.join.common/join? join-or-joinable)
                             (lib.join.alias/current-join-alias join-or-joinable))
         rhs-column-or-nil (or rhs-column-or-nil
                               (when (lib.join.common/join? join-or-joinable)
                                 (standard-join-condition-rhs (first (join-conditions join-or-joinable)))))]
     (->> (lib.metadata.calculation/visible-columns query stage-number joinable {:include-implicitly-joinable? false})
          (map (fn [col]
                 (cond-> (assoc col :lib/source :source/joins)
                   join-alias (lib.join.alias/with-join-alias join-alias))))
          (mark-selected-column query rhs-column-or-nil)
          sort-join-condition-columns))))

(mu/defn join-condition-operators :- [:sequential ::lib.schema.filter/operator]
  "Return a sequence of valid filter clause operators that can be used to build a join condition. In the Query Builder
  UI, this can be chosen at any point before or after choosing the LHS and RHS. Invalid options are not currently
  filtered out based on values of the LHS or RHS, but in the future we can add this -- see #31174."
  ([query lhs-column-or-nil rhs-column-or-nil]
   (join-condition-operators query -1 lhs-column-or-nil rhs-column-or-nil))

  ([_query             :- ::lib.schema/query
    _stage-number      :- :int
    ;; not yet used, hopefully we will use in the future when present for filtering incompatible options out.
    _lhs-column-or-nil :- [:maybe lib.metadata/ColumnMetadata]
    _rhs-column-or-nil :- [:maybe lib.metadata/ColumnMetadata]]
   ;; currently hardcoded to these six operators regardless of LHS and RHS.
   lib.filter.operator/join-operators))

(mu/defn ^:private pk-column :- [:maybe lib.metadata/ColumnMetadata]
  "Given something `x` (e.g. a Table metadata) find the PK column."
  [query        :- ::lib.schema/query
   stage-number :- :int
   x]
  (m/find-first lib.types.isa/primary-key?
                (lib.metadata.calculation/visible-columns query stage-number x)))

(mu/defn ^:private fk-column-for-pk-in :- [:maybe lib.metadata/ColumnMetadata]
  [pk-col          :- [:maybe lib.metadata/ColumnMetadata]
   visible-columns :- [:maybe [:sequential lib.metadata/ColumnMetadata]]]
  (when-let [pk-id (:id pk-col)]
    (m/find-first (fn [{:keys [fk-target-field-id], :as col}]
                    (and (lib.types.isa/foreign-key? col)
                         (= fk-target-field-id pk-id)))
                  visible-columns)))

(mu/defn ^:private fk-column-for :- [:maybe lib.metadata/ColumnMetadata]
  "Given a query stage find an FK column that points to the PK `pk-col`."
  [query        :- ::lib.schema/query
   stage-number :- :int
   pk-col       :- [:maybe lib.metadata/ColumnMetadata]]
  (when pk-col
    (let [visible-columns (lib.metadata.calculation/visible-columns query stage-number (lib.util/query-stage query stage-number))]
      (fk-column-for-pk-in pk-col visible-columns))))

(mu/defn suggested-join-condition :- [:maybe ::lib.schema.expression/boolean] ; i.e., a filter clause
  "Return a suggested default join condition when constructing a join against `joinable`, e.g. a Table, Saved
  Question, or another query. A suggested condition will be returned if the query stage has a foreign key to the
  primary key of the thing we're joining (see #31175 for more info); otherwise this will return `nil` if no default
  condition is suggested."
  ([query joinable]
   (suggested-join-condition query -1 joinable))

  ([query         :- ::lib.schema/query
    stage-number  :- :int
    joinable]
   (letfn [(filter-clause [x y]
             (lib.filter/filter-clause (lib.filter.operator/operator-def :=) x y))]
     (or (when-let [pk-col (pk-column query stage-number joinable)]
           (when-let [fk-col (fk-column-for query stage-number pk-col)]
             (filter-clause fk-col pk-col)))
         (when-let [pk-col (pk-column query stage-number (lib.util/query-stage query stage-number))]
           (when-let [fk-col (fk-column-for-pk-in pk-col (lib.metadata.calculation/visible-columns query stage-number joinable))]
             (filter-clause pk-col fk-col)))))))

(mu/defn join-condition-update-temporal-bucketing :- ::lib.schema.expression/boolean
  "Updates the provided join-condition's fields' temporal-bucketing option, returns the updated join-condition.
   Must be called on a standard join condition as per [[standard-join-condition?]].
   This will sync both the lhs and rhs fields, and the fields that support the provided option will be updated.
   Fields that do not support the provided option will be ignored."
  ([query :- ::lib.schema/query
    join-condition :- [:or ::lib.schema.expression/boolean ::lib.schema.common/external-op]
    option-or-unit :- [:maybe [:or
                               ::lib.schema.temporal-bucketing/option
                               ::lib.schema.temporal-bucketing/unit]]]
   (join-condition-update-temporal-bucketing query -1 join-condition option-or-unit))
  ([query :- ::lib.schema/query
    stage-number :- :int
    join-condition :- [:or ::lib.schema.expression/boolean ::lib.schema.common/external-op]
    option-or-unit :- [:maybe [:or
                               ::lib.schema.temporal-bucketing/option
                               ::lib.schema.temporal-bucketing/unit]]]
   (let [[_ _ lhs rhs :as join-condition] (lib.common/->op-arg join-condition)]
     (assert (standard-join-condition? join-condition)
             (i18n/tru "Non-standard join condition. {0}" (pr-str join-condition)))
     (let [unit (cond-> option-or-unit
                  (not (keyword? option-or-unit)) :unit)
           stage-number (lib.util/canonical-stage-index query stage-number)
           available-lhs (lib.temporal-bucket/available-temporal-buckets query stage-number lhs)
           available-rhs (lib.temporal-bucket/available-temporal-buckets query stage-number rhs)
           sync-lhs? (or (nil? unit) (contains? (set (map :unit available-lhs)) unit))
           sync-rhs? (or (nil? unit) (contains? (set (map :unit available-rhs)) unit))]
       (cond-> join-condition
         sync-lhs? (update 2 lib.temporal-bucket/with-temporal-bucket unit)
         sync-rhs? (update 3 lib.temporal-bucket/with-temporal-bucket unit))))))
