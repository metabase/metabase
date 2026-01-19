(ns metabase.lib.filter
  (:refer-clojure :exclude [filter and or not = < <= > >= not-empty case every? some mapv empty? not-empty
                            #?(:clj doseq) #?(:clj for)])
  (:require
   [inflections.core :as inflections]
   [medley.core :as m]
   [metabase.lib.common :as lib.common]
   [metabase.lib.dispatch :as lib.dispatch]
   [metabase.lib.equality :as lib.equality]
   [metabase.lib.filter.operator :as lib.filter.operator]
   [metabase.lib.hierarchy :as lib.hierarchy]
   [metabase.lib.metadata.calculation :as lib.metadata.calculation]
   [metabase.lib.options :as lib.options]
   [metabase.lib.ref :as lib.ref]
   [metabase.lib.schema :as lib.schema]
   [metabase.lib.schema.common :as lib.schema.common]
   [metabase.lib.schema.expression :as lib.schema.expression]
   [metabase.lib.schema.filter :as lib.schema.filter]
   [metabase.lib.schema.metadata :as lib.schema.metadata]
   [metabase.lib.schema.temporal-bucketing :as lib.schema.temporal-bucketing]
   [metabase.lib.temporal-bucket :as lib.temporal-bucket]
   [metabase.lib.types.isa :as lib.types.isa]
   [metabase.lib.util :as lib.util]
   [metabase.lib.util.match :as lib.util.match]
   [metabase.util :as u]
   [metabase.util.i18n :as i18n]
   [metabase.util.malli :as mu]
   [metabase.util.number :as u.number]
   [metabase.util.performance :as perf :refer [every? some mapv empty? #?(:clj doseq) #?(:clj for)]]
   [metabase.util.time :as u.time]))

(doseq [tag [:and :or]]
  (lib.hierarchy/derive tag ::compound))

(doseq [tag [:= :!= :in :not-in :starts-with :ends-with :contains :does-not-contain]]
  (lib.hierarchy/derive tag ::varargs))

(doseq [tag [:< :<= :> :>=]]
  (lib.hierarchy/derive tag ::binary))

(doseq [tag [:is-null :not-null :is-empty :not-empty :not]]
  (lib.hierarchy/derive tag ::unary))

(defmethod lib.metadata.calculation/describe-top-level-key-method :filters
  [query stage-number _key]
  (when-let [filters (perf/not-empty (:filters (lib.util/query-stage query stage-number)))]
    (i18n/tru "Filtered by {0}"
              (lib.util/join-strings-with-conjunction
               (i18n/tru "and")
               (for [filter filters]
                 (lib.metadata.calculation/display-name query stage-number filter :long))))))

;;; Display names for filter clauses are only really used in generating descriptions for `:case` aggregations or for
;;; generating the suggested name for a query.

(defmethod lib.metadata.calculation/display-name-method ::compound
  [query stage-number [tag _opts & subclauses] style]
  (lib.util/join-strings-with-conjunction
   (clojure.core/case tag
     :and (i18n/tru "and")
     :or  (i18n/tru "or"))
   (for [clause subclauses]
     (lib.metadata.calculation/display-name query stage-number clause style))))

(defmethod lib.metadata.calculation/display-name-method ::varargs
  [query stage-number expr style]
  (let [->display-name #(lib.metadata.calculation/display-name query stage-number % style)
        ->temporal-name lib.temporal-bucket/describe-temporal-pair
        numeric? #(clojure.core/and (lib.util/original-isa? % :type/Number)
                                    (lib.util/clause? %)
                                    (-> (lib.metadata.calculation/metadata query stage-number %)
                                        lib.types.isa/id?
                                        clojure.core/not))
        temporal? #(lib.util/original-isa? % :type/Temporal)
        unit= (fn [a unit-or-units]
                (let [units (set (u/one-or-many unit-or-units))]
                  (clojure.core/and
                   (temporal? a)
                   (lib.util/clause? a)
                   (clojure.core/contains? units (:temporal-unit (second a))))))
        ->unbucketed-display-name #(-> %
                                       (update 1 dissoc :temporal-unit)
                                       ->display-name)
        ->bucket-name #(-> %
                           second
                           :temporal-unit
                           lib.temporal-bucket/describe-temporal-unit
                           u/lower-case-en)
        ->unit {:get-hour :hour-of-day
                :get-month :month-of-year
                :get-quarter :quarter-of-year
                :get-year :year-of-era}]
    (lib.util.match/match-lite expr
      [(op :guard #{:= :in :!= :not-in}) _ [:get-hour _ (a :guard temporal?)] (b :guard int?)]
      (i18n/tru "{0} {1} {2}" (->unbucketed-display-name a) (if (#{:= :in} op) "is at" "excludes the hour of")
                (u.time/format-unit b :hour-of-day))

      [(op :guard #{:= :in :!= :not-in}) _ [:get-day-of-week _ (a :guard temporal?) :iso] & (args :guard (every? int? args))]
      (let [cnt (count args)
            in? (#{:= :in} op)]
        (cond (clojure.core/> cnt 1)
              (i18n/tru "{0} {1} {2} {3} selections" (->display-name a) (if in? "is one of" "excludes") cnt
                        (-> :day-of-week lib.temporal-bucket/describe-temporal-unit u/lower-case-en))

              in? (i18n/tru "{0} is on {1}" (->display-name a) (u.time/format-unit (first args) :day-of-week-iso))

              :else (i18n/tru "{0} excludes {1}" (->unbucketed-display-name a)
                              (inflections/plural (u.time/format-unit (first args) :day-of-week-iso)))))

      [(_ :guard #{:= :in}) _ [(f :guard #{:get-month :get-quarter :get-year}) _ (a :guard temporal?)] (b :guard int?)]
      (i18n/tru "{0} is in {1}" (->unbucketed-display-name a) (u.time/format-unit b (->unit f)))

      [(_ :guard #{:!= :not-in}) _ [:get-month _ (a :guard temporal?)] (b :guard int?)]
      (i18n/tru "{0} excludes each {1}" (->unbucketed-display-name a) (u.time/format-unit b :month-of-year))

      [(_ :guard #{:!= :not-in}) _ [:get-quarter _ (a :guard temporal?)] (b :guard int?)]
      (i18n/tru "{0} excludes {1} each year" (->unbucketed-display-name a) (u.time/format-unit b :quarter-of-year))

      [(_ :guard #{:!= :not-in}) _ [:get-year _ (a :guard temporal?)] (b :guard int?)]
      (i18n/tru "{0} excludes {1}" (->unbucketed-display-name a) (u.time/format-unit b :year))

      [(op :guard #{:= :in :!= :not-in}) _ [(f :guard #{:get-hour :get-month :get-quarter :get-year}) _ (a :guard temporal?)] & (args :guard (every? int? args))]
      (i18n/tru "{0} {1} {2} {3} selections"
                (->unbucketed-display-name a)
                (if (#{:= :in} op) "is one of" "excludes")
                (count args)
                (-> f ->unit lib.temporal-bucket/describe-temporal-unit u/lower-case-en))

      [(_ :guard #{:= :in}) _ (a :guard numeric?) b]
      (i18n/tru "{0} is equal to {1}" (->display-name a) (->display-name b))

      [(_ :guard #{:= :in}) _ (a :guard (unit= a lib.schema.temporal-bucketing/datetime-truncation-units)) (b :guard string?)]
      (i18n/tru "{0} is {1}" (->unbucketed-display-name a) (u.time/format-relative-date-range b 0 (:temporal-unit (second a)) nil nil {:include-current true}))

      [(_ :guard #{:= :in}) _ (a :guard (unit= a :day-of-week)) (b :guard (clojure.core/or (int? b) (string? b)))]
      (i18n/tru "{0} is {1}" (->display-name a) (->temporal-name a b))

      [(_ :guard #{:= :in}) _ (a :guard temporal?) (b :guard (clojure.core/or (int? b) (string? b)))]
      (i18n/tru "{0} is on {1}" (->display-name a) (->temporal-name a b))

      [(_ :guard #{:!= :not-in}) _ (a :guard numeric?) b]
      (i18n/tru "{0} is not equal to {1}" (->display-name a) (->display-name b))

      [(_ :guard #{:!= :not-in}) _ (a :guard temporal?) (b :guard (clojure.core/or (int? b) (string? b)))]
      (let [tname (->temporal-name a b)]
        (cond (unit= a :day-of-week)
              (i18n/tru "{0} excludes {1}" (->unbucketed-display-name a) (inflections/plural tname))
              (unit= a :month-of-year)
              (i18n/tru "{0} excludes each {1}" (->unbucketed-display-name a) tname)
              (unit= a :quarter-of-year)
              (i18n/tru "{0} excludes {1} each year" (->unbucketed-display-name a) tname)
              (unit= a :hour-of-day)
              (i18n/tru "{0} excludes the hour of {1}" (->unbucketed-display-name a) tname)
              (temporal? a)
              (i18n/tru "{0} excludes {1}" (->display-name a) (->temporal-name a b))))

      [(_ :guard #{:!= :not-in}) _ (a :guard temporal?) & args]
      (i18n/tru "{0} excludes {1} {2} selections" (->unbucketed-display-name a) (count args) (->bucket-name a))

      [(op :guard #{:= :in :!= :not-in}) _ (a :guard numeric?) & args]
      (i18n/tru "{0} is {1} to {2} selections" (->display-name a) (if (#{:= :in} op) "equal" "not equal") (count args))

      [(op :guard #{:= :in :!= :not-in}) _ a b]
      (i18n/tru "{0} {1} {2}" (->display-name a) (if (#{:= :in} op) "is" "is not") (if (string? b) b (->display-name b)))

      [(op :guard #{:= :in :!= :not-in}) _ a & args]
      (i18n/tru "{0} {1} {2} selections" (->display-name a) (if (#{:= :in} op) "is" "is not") (count args))

      [:starts-with _ x & args]
      (if (clojure.core/= (count args) 1)
        (let [y (first args)]
          (i18n/tru "{0} starts with {1}" (->display-name x) (if (string? y) y (->display-name y))))
        (i18n/tru "{0} starts with {1} selections" (->display-name x) (count args)))

      [:ends-with _ x & args]
      (if (clojure.core/= (count args) 1)
        (let [y (first args)]
          (i18n/tru "{0} ends with {1}" (->display-name x) (if (string? y) y (->display-name y))))
        (i18n/tru "{0} ends with {1} selections" (->display-name x) (count args)))

      [:contains _ x & args]
      (if (clojure.core/= (count args) 1)
        (let [y (first args)]
          (i18n/tru "{0} contains {1}" (->display-name x) (if (string? y) y (->display-name y))))
        (i18n/tru "{0} contains {1} selections" (->display-name x) (count args)))

      [:does-not-contain _ x & args]
      (if (clojure.core/= (count args) 1)
        (let [y (first args)]
          (i18n/tru "{0} does not contain {1}" (->display-name x) (if (string? y) y (->display-name y))))
        (i18n/tru "{0} does not contain {1} selections" (->display-name x) (count args))))))

(defmethod lib.metadata.calculation/display-name-method ::binary
  [query stage-number expr style]
  (let [->display-name #(lib.metadata.calculation/display-name query stage-number % style)
        ->temporal-name #(u.time/format-unit % nil)
        temporal? #(lib.util/original-isa? % :type/Temporal)]
    (lib.util.match/match-lite expr
      [:< _ (x :guard temporal?) (y :guard string?)]
      (i18n/tru "{0} is before {1}"                   (->display-name x) (->temporal-name y))

      [:< _ x y]
      (i18n/tru "{0} is less than {1}"                (->display-name x) (->display-name y))

      [:<= _ x y]
      (i18n/tru "{0} is less than or equal to {1}"    (->display-name x) (->display-name y))

      [:> _ (x :guard temporal?) (y :guard string?)]
      (i18n/tru "{0} is after {1}"                    (->display-name x) (->temporal-name y))

      [:> _ x y]
      (i18n/tru "{0} is greater than {1}"             (->display-name x) (->display-name y))

      [:>= _ x y]
      (i18n/tru "{0} is greater than or equal to {1}" (->display-name x) (->display-name y)))))

(defmethod lib.metadata.calculation/display-name-method :between
  [query stage-number expr style]
  (let [->display-name #(lib.metadata.calculation/display-name query stage-number % style)
        ->unbucketed-display-name #(-> %
                                       (update 1 dissoc :temporal-unit)
                                       ->display-name)]
    (lib.util.match/match-lite expr
      [:between _ x (y :guard string?) (z :guard string?)]
      (i18n/tru "{0} is {1}"
                (->unbucketed-display-name x)
                (u.time/format-diff y z))

      [:between _
       [:+ _ x [:interval _ n unit]]
       [:relative-datetime _ n2 unit2]
       [:relative-datetime _ 0 _]]
      (i18n/tru "{0} is in the {1}, {2}"
                (->display-name x)
                (u/lower-case-en (lib.temporal-bucket/describe-temporal-interval n2 unit2))
                (lib.temporal-bucket/describe-relative-datetime (- n) unit))

      [:between _
       [:+ _ x [:interval _ n unit]]
       [:relative-datetime _ 0 _]
       [:relative-datetime _ n2 unit2]]
      (i18n/tru "{0} is in the {1}, {2}"
                (->display-name x)
                (u/lower-case-en (lib.temporal-bucket/describe-temporal-interval n2 unit2))
                (lib.temporal-bucket/describe-relative-datetime (- n) unit))

      [:between _ x y z]
      (i18n/tru "{0} is between {1} and {2}"
                (->display-name x)
                (->display-name y)
                (->display-name z)))))

(defmethod lib.metadata.calculation/display-name-method :during
  [query stage-number [_tag _opts expr value unit] style]
  (let [->display-name #(lib.metadata.calculation/display-name query stage-number % style)]
    (i18n/tru "{0} is {1}"
              (->display-name expr)
              (u.time/format-relative-date-range value 1 unit -1 unit {}))))

(defmethod lib.metadata.calculation/display-name-method :inside
  [query stage-number [_tag opts lat-expr lon-expr lat-max lon-min lat-min lon-max] style]
  (lib.metadata.calculation/display-name query stage-number
                                         [:and opts
                                          [:between opts lat-expr lat-min lat-max]
                                          [:between opts lon-expr lon-min lon-max]]
                                         style))

(defmethod lib.metadata.calculation/display-name-method ::unary
  [query stage-number [tag _opts expr] style]
  (let [expr (lib.metadata.calculation/display-name query stage-number expr style)]
    ;; for whatever reason the descriptions of for `:is-null` and `:not-null` is "is empty" and "is not empty".
    (clojure.core/case tag
      :is-null   (i18n/tru "{0} is empty"     expr)
      :not-null  (i18n/tru "{0} is not empty" expr)
      :is-empty  (i18n/tru "{0} is empty"     expr)
      :not-empty (i18n/tru "{0} is not empty" expr)
      ;; TODO -- This description is sorta wack, we should use [[metabase.legacy-mbql.util/negate-filter-clause]] to
      ;; negate `expr` and then generate a description. That would require porting that stuff to pMBQL tho.
      :not       (i18n/tru "not {0}" expr))))

(defmethod lib.metadata.calculation/display-name-method :value
  [query stage-number [_value {:keys [base-type]} expr] style]
  (lib.metadata.calculation/display-name query
                                         stage-number
                                         (cond-> expr
                                           (clojure.core/and (string? expr) (isa? base-type :type/BigInteger))
                                           u.number/parse-bigint)
                                         style))

(defmethod lib.metadata.calculation/display-name-method :time-interval
  [query stage-number [_tag opts expr n unit] style]
  (if (clojure.core/or
       (clojure.core/= n :current)
       (clojure.core/= n 0)
       (clojure.core/and
        (clojure.core/= (abs n) 1)
        (clojure.core/= unit :day)))
    (i18n/tru "{0} is {1}"
              (lib.metadata.calculation/display-name query stage-number expr style)
              (u/lower-case-en (lib.temporal-bucket/describe-temporal-interval n unit opts)))
    (i18n/tru "{0} is in the {1}"
              (lib.metadata.calculation/display-name query stage-number expr style)
              (u/lower-case-en (lib.temporal-bucket/describe-temporal-interval n unit opts)))))

(defmethod lib.metadata.calculation/display-name-method :relative-time-interval
  [query stage-number [_tag _opts column value bucket offset-value offset-bucket] style]
  (if (neg? offset-value)
    (i18n/tru "{0} is in the {1}, {2}"
              (lib.metadata.calculation/display-name query stage-number column style)
              (u/lower-case-en (lib.temporal-bucket/describe-temporal-interval value bucket))
              (lib.temporal-bucket/describe-relative-datetime offset-value offset-bucket))
    (i18n/tru "{0} is in the {1}, {2}"
              (lib.metadata.calculation/display-name query stage-number column style)
              (u/lower-case-en (lib.temporal-bucket/describe-temporal-interval value bucket))
              (lib.temporal-bucket/describe-relative-datetime offset-value offset-bucket))))

(defmethod lib.metadata.calculation/display-name-method :relative-datetime
  [_query _stage-number [_tag _opts n unit] _style]
  (lib.temporal-bucket/describe-temporal-interval n unit))

(defmethod lib.metadata.calculation/display-name-method :interval
  [_query _stage-number [_tag opts n unit] _style]
  (lib.temporal-bucket/describe-temporal-interval n unit opts))

(lib.common/defop and [x y & more])
(lib.common/defop or [x y & more])
(lib.common/defop not [x])
(lib.common/defop = [x y & more])
(lib.common/defop != [x y & more])
(lib.common/defop in [x y & more])
(lib.common/defop not-in [x y & more])
(lib.common/defop < [x y])
(lib.common/defop <= [x y])
(lib.common/defop > [x y])
(lib.common/defop >= [x y])
(lib.common/defop between [x lower upper])
(lib.common/defop inside [lat lon lat-max lon-min lat-min lon-max])
(lib.common/defop is-null [x])
(lib.common/defop not-null [x])
(lib.common/defop is-empty [x])
(lib.common/defop not-empty [x])
(lib.common/defop starts-with [whole & parts])
(lib.common/defop ends-with [whole & parts])
(lib.common/defop contains [whole & parts])
(lib.common/defop does-not-contain [whole & parts])
(lib.common/defop relative-time-interval [x value bucket offset-value offset-bucket])
(lib.common/defop time-interval [x amount unit])
(lib.common/defop during [t v unit])
(lib.common/defop segment [segment-id])

(mu/defn add-filter-to-stage
  "Add a new filter clause to a `stage`, ignoring it if it is a duplicate clause (ignoring :lib/uuid)."
  [stage      :- ::lib.schema/stage
   new-filter :- [:maybe ::lib.schema.expression/boolean]]
  (if-not new-filter
    stage
    (let [existing-filter? (some (fn [existing-filter]
                                   (lib.equality/= existing-filter new-filter))
                                 (:filters stage))]
      (if existing-filter?
        stage
        (update stage :filters #(conj (vec %) new-filter))))))

(mu/defn add-filters-to-stage :- ::lib.schema/stage
  "Add additional filter clauses to a `stage`. Ignores any duplicate clauses (ignoring :lib/uuid)."
  [stage       :- ::lib.schema/stage
   new-filters :- [:maybe [:sequential ::lib.schema.expression/boolean]]]
  (reduce add-filter-to-stage stage new-filters))

(mu/defn remove-duplicate-filters-in-stage :- ::lib.schema/stage
  "Remove any duplicate filters from a query `stage` (ignoring :lib/uuid)."
  [stage :- ::lib.schema/stage]
  (add-filters-to-stage (dissoc stage :filters) (:filters stage)))

(mu/defn flatten-compound-filters-in-stage :- ::lib.schema/stage
  "Flatten any `:and` filters in a `stage`. Does multiple passes until all `:and` filters are flattened."
  [stage :- ::lib.schema/stage]
  (letfn [(flatten-filters [filter-clauses]
            ;; if we did ANY flattening, recurse so we can see if we can do MORE. I'm using a volatile to track this
            ;; so we can avoid equality comparisons which are more expensive and also potentially dangerous (don't
            ;; want to accidentally end up with infinite recursion here)
            (let [did-some-flattening? (volatile! false)
                  filter-clauses'      (into []
                                             (mapcat (fn [[tag _opts & args :as filter-clause]]
                                                       (if (clojure.core/= tag :and)
                                                         (do
                                                           (vreset! did-some-flattening? true)
                                                           args)
                                                         [filter-clause])))
                                             filter-clauses)]
              (if @did-some-flattening?
                (recur filter-clauses')
                filter-clauses')))]
    (cond-> stage
      (seq (:filters stage)) (update :filters flatten-filters))))

(mu/defn filter :- :metabase.lib.schema/query
  "Sets `boolean-expression` as a filter on `query`. Ignores duplicate filters (ignoring :lib/uuid)."
  ([query :- :metabase.lib.schema/query
    boolean-expression]
   (metabase.lib.filter/filter query nil boolean-expression))

  ([query :- :metabase.lib.schema/query
    stage-number :- [:maybe :int]
    boolean-expression]
   ;; if this is a Segment metadata, convert it to `:segment` MBQL clause before adding
   (if (clojure.core/= (lib.dispatch/dispatch-value boolean-expression) :metadata/segment)
     (recur query stage-number (lib.ref/ref boolean-expression))
     (let [stage-number (clojure.core/or stage-number -1)
           new-filter (lib.common/->op-arg boolean-expression)]
       (lib.util/update-query-stage query stage-number add-filter-to-stage new-filter)))))

(mu/defn filters :- [:maybe [:ref ::lib.schema/filters]]
  "Returns the current filters in stage with `stage-number` of `query`.
  If `stage-number` is omitted, the last stage is used. Logically, the
  filter attached to the query is the conjunction of the expressions
  in the returned list. If the returned list is empty, then there is no
  filter attached to the query.
  See also [[metabase.lib.util/query-stage]]."
  ([query :- :metabase.lib.schema/query] (filters query nil))
  ([query :- :metabase.lib.schema/query
    stage-number :- [:maybe :int]]
   (perf/not-empty (:filters (lib.util/query-stage query (clojure.core/or stage-number -1))))))

(def ColumnWithOperators
  "Malli schema for ColumnMetadata extended with the list of applicable operators."
  [:merge
   [:ref ::lib.schema.metadata/column]
   [:map
    [:operators {:optional true} [:sequential [:ref ::lib.schema.filter/operator]]]]])

(mu/defn filterable-column-operators :- [:maybe [:sequential ::lib.schema.filter/operator]]
  "Returns the operators for which `filterable-column` is applicable."
  [filterable-column :- ColumnWithOperators]
  (:operators filterable-column))

(mu/defn add-column-operators :- ColumnWithOperators
  "Extend the column metadata with the available operators if any."
  [column :- ::lib.schema.metadata/column]
  (let [operators (lib.filter.operator/filter-operators column)]
    (m/assoc-some column :operators (perf/not-empty operators))))

(defn- leading-ref
  "Returns the first argument of `a-filter` if it is a reference clause, nil otherwise."
  [a-filter]
  (when-let [leading-arg (clojure.core/and (lib.util/clause? a-filter)
                                           (get a-filter 2))]
    (when (lib.util/ref-clause? leading-arg)
      leading-arg)))

(mu/defn filterable-columns :- [:maybe [:sequential ColumnWithOperators]]
  "Get column metadata for all the columns that can be filtered in
  the stage number `stage-number` of the query `query`
  If `stage-number` is omitted, the last stage is used.
  The rules for determining which columns can be broken out by are as follows:

  1. custom `:expressions` in this stage of the query

  2. Fields 'exported' by the previous stage of the query, if there is one;
     otherwise Fields from the current `:source-table`

  3. Fields exported by explicit joins

  4. Fields in Tables that are implicitly joinable."

  ([query :- ::lib.schema/query]
   (filterable-columns query -1))

  ([query        :- ::lib.schema/query
    stage-number :- :int]
   (filterable-columns query stage-number nil))

  ([query        :- ::lib.schema/query
    stage-number :- :int
    options      :- [:maybe ::lib.metadata.calculation/visible-columns.options]]
   (let [columns (sequence
                  (comp (map add-column-operators)
                        (clojure.core/filter :operators))
                  (lib.metadata.calculation/visible-columns query stage-number options))
         existing-filters (filters query stage-number)]
     (cond
       (empty? columns)
       nil

       (empty? existing-filters)
       (vec columns)

       :else
       (let [matching (group-by
                       (fn [filter-pos]
                         (when-let [a-ref (leading-ref (get existing-filters filter-pos))]
                           (lib.equality/find-matching-column query stage-number a-ref columns)))
                       (range (count existing-filters)))]
         (mapv #(let [positions (matching %)]
                  (cond-> %
                    positions (assoc :filter-positions positions)))
               columns))))))

(mu/defn filter-clause :- ::lib.schema.expression/boolean
  "Returns a standalone filter clause for a `filter-operator`,
  a `column`, and arguments."
  [filter-operator :- [:or ::lib.schema.filter/operator :keyword :string]
   column          :- ::lib.schema.metadata/column
   & args]
  (let [tag (if (map? filter-operator)
              (:short filter-operator)
              (keyword filter-operator))]
    (lib.options/ensure-uuid (into [tag {} (lib.common/->op-arg column)]
                                   (map lib.common/->op-arg args)))))

(mu/defn filter-operator :- ::lib.schema.filter/operator
  "Return the filter operator of the boolean expression `filter-clause`
  at `stage-number` in `query`.
  If `stage-number` is omitted, the last stage is used."
  ([query a-filter-clause]
   (filter-operator query -1 a-filter-clause))

  ([query :- ::lib.schema/query
    stage-number :- :int
    a-filter-clause :- ::lib.schema.expression/boolean]
   (let [[op _ first-arg] a-filter-clause
         columns (lib.metadata.calculation/visible-columns query stage-number)
         col     (lib.equality/find-matching-column query stage-number first-arg columns)]
     (clojure.core/or (m/find-first #(clojure.core/= (:short %) op)
                                    (lib.filter.operator/filter-operators col))
                      (lib.filter.operator/operator-def op)))))

(def ^:private FilterParts
  [:map
   [:lib/type [:= :mbql/filter-parts]]
   [:operator ::lib.schema.filter/operator]
   [:options ::lib.schema.common/options]
   [:column [:maybe ColumnWithOperators]]
   [:args [:sequential :any]]])

(mu/defn filter-parts :- FilterParts
  "Return the parts of the filter clause `a-filter-clause` in query `query` at stage `stage-number`.
  Might obsolete [[filter-operator]]."
  ([query a-filter-clause]
   (filter-parts query -1 a-filter-clause))

  ([query :- ::lib.schema/query
    stage-number :- :int
    a-filter-clause :- ::lib.schema.expression/boolean]
   (let [[op options first-arg & rest-args] a-filter-clause
         columns (lib.metadata.calculation/visible-columns query stage-number)
         col     (lib.equality/find-matching-column query stage-number first-arg columns)]
     {:lib/type :mbql/filter-parts
      :operator (clojure.core/or (m/find-first #(clojure.core/= (:short %) op)
                                               (lib.filter.operator/filter-operators col))
                                 (lib.filter.operator/operator-def op))
      :options  options
      :column   (some-> col add-column-operators)
      :args     (vec rest-args)})))
