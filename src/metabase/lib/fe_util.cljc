(ns metabase.lib.fe-util
  (:require
   [inflections.core :as inflections]
   [metabase.legacy-mbql.normalize :as mbql.normalize]
   [metabase.lib.card :as lib.card]
   [metabase.lib.common :as lib.common]
   [metabase.lib.convert :as lib.convert]
   [metabase.lib.expression :as lib.expression]
   [metabase.lib.field :as lib.field]
   [metabase.lib.filter :as lib.filter]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.lib.metadata.calculation :as lib.metadata.calculation]
   [metabase.lib.options :as lib.options]
   [metabase.lib.query :as lib.query]
   [metabase.lib.schema :as lib.schema]
   [metabase.lib.schema.common :as lib.schema.common]
   [metabase.lib.schema.expression :as lib.schema.expression]
   [metabase.lib.schema.filter :as lib.schema.filter]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.lib.schema.metadata :as lib.schema.metadata]
   [metabase.lib.schema.temporal-bucketing :as lib.schema.temporal-bucketing]
   [metabase.lib.temporal-bucket :as lib.temporal-bucket]
   [metabase.lib.types.isa :as lib.types.isa]
   [metabase.lib.util :as lib.util]
   [metabase.lib.util.match :as lib.util.match]
   [metabase.util :as u]
   [metabase.util.formatting.date :as fmt.date]
   [metabase.util.i18n :as i18n]
   [metabase.util.malli :as mu]
   [metabase.util.time :as u.time]))

(def ^:private ExpressionParts
  [:map
   [:lib/type [:= :mbql/expression-parts]]
   [:operator [:or :keyword :string]]
   [:options ::lib.schema.common/options]
   [:args [:sequential :any]]])

(def ^:private expandable-time-units #{:hour})

(def ^:private expandable-date-units #{:week :month :quarter :year})

(def ^:private expandable-temporal-units
  (into expandable-time-units expandable-date-units))

(defn- expandable-temporal-expression?
  [[operator _options & [maybe-clause-arg other-arg :as args]]]
  (boolean (and (= := operator)
                (= 2 (count args))
                (lib.util/clause? maybe-clause-arg)
                (contains? expandable-temporal-units
                           (:temporal-unit (lib.options/options maybe-clause-arg)))
                (u.time/timestamp-coercible? other-arg))))

(defn- expand-temporal-expression
  "Modify expression in a way, that its resulting [[expression-parts]] are digestable by filter picker.

   Current filter picker implementation is unable to handle expression parts of expressions of a form
   `[:= {...} [:field {:temporal-unit :week} 11] \"2024-05-12\"]` -- expresions that check for equality of a column
   with `:temporal-unit` set to value other than `:day` or `:minute` to some date time value.

   To mitigate that expressions are converted to `:between` form which is handled correctly by filter picker. For more
   info on the issue see the comment [https://github.com/metabase/metabase/issues/12496#issuecomment-1629317661].
   This functionality is backend approach to \"smaller solution\"."
  [[_operator options column-arg dt-arg :as _expression-clause]]
  (let [temporal-unit (:temporal-unit (lib.options/options column-arg))
        interval (u.time/to-range (u.time/coerce-to-timestamp dt-arg) {:unit temporal-unit :n 1})
        formatter (if (contains? expandable-time-units temporal-unit)
                    fmt.date/datetime->iso-string
                    fmt.date/date->iso-string)]
    (into [:between options column-arg] (map formatter) interval)))

(defn- maybe-expand-temporal-expression
  [expression-clause]
  (if (expandable-temporal-expression? expression-clause)
    (expand-temporal-expression expression-clause)
    expression-clause))

(defn- column-metadata-from-ref
  [query stage-number a-ref]
  (lib.filter/add-column-operators
   (lib.field/extend-column-metadata-from-ref
    query stage-number
    (lib.metadata.calculation/metadata query stage-number a-ref)
    a-ref)))

(mu/defn expression-parts :- ExpressionParts
  "Return the parts of the filter clause `expression-clause` in query `query` at stage `stage-number`."
  ([query expression-clause]
   (expression-parts query -1 expression-clause))

  ([query :- ::lib.schema/query
    stage-number :- :int
    expression-clause :- ::lib.schema.expression/expression]
   (let [[op options & args] (maybe-expand-temporal-expression expression-clause)
         ->maybe-col #(when (lib.util/ref-clause? %)
                        (column-metadata-from-ref query stage-number %))]
     {:lib/type :mbql/expression-parts
      :operator op
      :options  options
      :args     (mapv (fn [arg]
                        (if (lib.util/clause? arg)
                          (if-let [col (->maybe-col arg)]
                            col
                            (expression-parts query stage-number arg))
                          arg))
                      args)})))

(defmethod lib.common/->op-arg :mbql/expression-parts
  [{:keys [operator options args] :or {options {}}}]
  (lib.common/->op-arg (lib.options/ensure-uuid (into [(keyword operator) options]
                                                      (map lib.common/->op-arg)
                                                      args))))

(mu/defn expression-clause :- ::lib.schema.expression/expression
  "Returns a standalone clause for an `operator`, `options`, and arguments."
  [operator :- :keyword
   args     :- [:sequential :any]
   options  :- [:maybe :map]]
  (lib.options/ensure-uuid (into [operator options] (map lib.common/->op-arg) args)))

(defn- ref-clause-with-type?
  [maybe-ref types]
  (and (lib.util/ref-clause? maybe-ref)
       (some #(lib.util/original-isa? maybe-ref %) types)))

(def ^:private StringFilterParts
  [:map
   [:operator ::lib.schema.filter/string-filter-operator]
   [:column   ::lib.schema.metadata/column]
   [:values   [:sequential :string]]
   [:options  ::lib.schema.filter/string-filter-options]])

(mu/defn string-filter-clause :- ::lib.schema.expression/expression
  "Creates a string filter clause based on FE-friendly filter parts. It should be possible to destructure each created
  expression with [[string-filter-parts]]. Note that the FE does not support `:is-null` and `:not-null` operators with string
  columns."
  [operator :- ::lib.schema.filter/string-filter-operator
   column   :- ::lib.schema.metadata/column
   values   :- [:maybe [:sequential :string]]
   options  :- [:maybe ::lib.schema.filter/string-filter-options]]
  (expression-clause operator (into [column] values)
                     (if (#{:is-empty :not-empty := :!=} operator)
                       {}
                       options)))

(mu/defn string-filter-parts :- [:maybe StringFilterParts]
  "Destructures a string filter clause created by [[string-filter-clause]]. Returns `nil` if the clause does not match
  the expected shape. To avoid mistakes the function returns `options` for all operators even though they might not be
  used. Note that the FE does not support `:is-null` and `:not-null` operators with string columns."
  [query         :- ::lib.schema/query
   stage-number  :- :int
   filter-clause :- ::lib.schema.expression/expression]
  (let [ref->col    #(column-metadata-from-ref query stage-number %)
        string-col? #(ref-clause-with-type? % [:type/Text :type/TextLike])]
    (lib.util.match/match-one filter-clause
      ;; no arguments
      [(op :guard #{:is-empty :not-empty}) _ (col-ref :guard string-col?)]
      {:operator op, :column (ref->col col-ref), :values [], :options {}}

      ;; multiple arguments without options
      [(op :guard #{:= :!=}) _ (col-ref :guard string-col?) & (args :guard #(every? string? %))]
      {:operator op, :column (ref->col col-ref), :values args, :options {}}

      ;; multiple arguments with options
      [(op :guard #{:contains :does-not-contain :starts-with :ends-with}) opts (col-ref :guard string-col?) & (args :guard #(every? string? %))]
      {:operator op, :column (ref->col col-ref), :values args, :options {:case-sensitive (get opts :case-sensitive true)}})))

(def ^:private NumberFilterParts
  [:map
   [:operator ::lib.schema.filter/number-filter-operator]
   [:column   ::lib.schema.metadata/column]
   [:values   [:sequential number?]]])

(mu/defn number-filter-clause :- ::lib.schema.expression/expression
  "Creates a numeric filter clause based on FE-friendly filter parts. It should be possible to destructure each created
  expression with [[number-filter-parts]]."
  [operator :- ::lib.schema.filter/number-filter-operator
   column   :- ::lib.schema.metadata/column
   values   :- [:maybe [:sequential number?]]]
  (expression-clause operator (into [column] values) {}))

(mu/defn number-filter-parts :- [:maybe NumberFilterParts]
  "Destructures a numeric filter clause created by [[number-filter-clause]]. Returns `nil` if the clause does not match
  the expected shape."
  [query         :- ::lib.schema/query
   stage-number  :- :int
   filter-clause :- ::lib.schema.expression/expression]
  (let [ref->col    #(column-metadata-from-ref query stage-number %)
        number-col? #(ref-clause-with-type? % [:type/Number])]
    (lib.util.match/match-one filter-clause
      ;; no arguments
      [(op :guard #{:is-null :not-null}) _ (col-ref :guard number-col?)]
      {:operator op, :column (ref->col col-ref), :values []}

      ;; multiple arguments
      [(op :guard #{:= :!=}) _ (col-ref :guard number-col?) & (args :guard #(every? number? %))]
      {:operator op, :column (ref->col col-ref), :values args}

      ;; exactly 1 argument
      [(op :guard #{:> :>= :< :<=}) _ (col-ref :guard number-col?) (arg :guard number?)]
      {:operator op, :column (ref->col col-ref), :values [arg]}

      ;; exactly 2 arguments
      [(op :guard #{:between}) _ (col-ref :guard number-col?) (start :guard number?) (end :guard number?)]
      {:operator op, :column (ref->col col-ref), :values [start end]})))

(def ^:private CoordinateFilterParts
  [:map
   [:operator         ::lib.schema.filter/coordinate-filter-operator]
   [:column           ::lib.schema.metadata/column]
   [:longitude-column {:optional true} [:maybe ::lib.schema.metadata/column]]
   [:values           [:sequential number?]]])

(mu/defn coordinate-filter-clause :- ::lib.schema.expression/expression
  "Creates a coordinate filter clause based on FE-friendly filter parts. It should be possible to destructure each
  created expression with [[coordinate-filter-parts]]."
  [operator         :- ::lib.schema.filter/coordinate-filter-operator
   column           :- ::lib.schema.metadata/column
   longitude-column :- [:maybe ::lib.schema.metadata/column]
   values           :- [:maybe [:sequential number?]]]
  (if (= operator :inside)
    (expression-clause operator (into [column longitude-column] values) {})
    (expression-clause operator (into [column] values) {})))

(mu/defn coordinate-filter-parts :- [:maybe CoordinateFilterParts]
  "Destructures a coordinate filter clause created by [[coordinate-filter-clause]]. Returns `nil` if the clause does not
  match the expected shape. Unlike regular numeric filters, coordinate filters do not support `:is-null` and
  `:not-null`. There is also a special `:inside` operator that requires both latitude and longitude columns."
  [query         :- ::lib.schema/query
   stage-number  :- :int
   filter-clause :- ::lib.schema.expression/expression]
  (let [ref->col        #(column-metadata-from-ref query stage-number %)
        coordinate-col? #(and (ref-clause-with-type? % [:type/Number])
                              (lib.types.isa/coordinate? (ref->col %)))]
    (lib.util.match/match-one filter-clause
      ;; multiple arguments
      [(op :guard #{:= :!=}) _ (col-ref :guard coordinate-col?) & (args :guard #(every? number? %))]
      {:operator op, :column (ref->col col-ref), :values args}

     ;; exactly 1 argument
      [(op :guard #{:> :>= :< :<=}) _ (col-ref :guard coordinate-col?) (arg :guard number?)]
      {:operator op, :column (ref->col col-ref), :values [arg]}

      ;; exactly 2 arguments
      [(op :guard #{:between})
       _
       (col-ref :guard coordinate-col?)
       & (args :guard #(and (every? number? %) (= (count %) 2)))]
      {:operator op, :column (ref->col col-ref), :values args}

      ;; exactly 4 arguments
      [(op :guard #{:inside})
       _
       (lat-col-ref :guard coordinate-col?)
       (lon-col-ref :guard coordinate-col?)
       & (args :guard #(and (every? number? %) (= (count %) 4)))]
      {:operator op, :column (ref->col lat-col-ref), :longitude-column (ref->col lon-col-ref), :values args})))

(def ^:private BooleanFilterParts
  [:map
   [:operator ::lib.schema.filter/boolean-filter-operator]
   [:column   ::lib.schema.metadata/column]
   [:values   [:sequential :boolean]]])

(mu/defn boolean-filter-clause :- ::lib.schema.expression/expression
  "Creates a boolean filter clause based on FE-friendly filter parts. It should be possible to destructure each created
  expression with [[boolean-filter-parts]]."
  [operator :- ::lib.schema.filter/boolean-filter-operator
   column   :- ::lib.schema.metadata/column
   values   :- [:maybe [:sequential :boolean]]]
  (expression-clause operator (into [column] values) {}))

(mu/defn boolean-filter-parts :- [:maybe BooleanFilterParts]
  "Destructures a boolean filter clause created by [[boolean-filter-clause]]. Returns `nil` if the clause does not match
  the expected shape."
  [query         :- ::lib.schema/query
   stage-number  :- :int
   filter-clause :- ::lib.schema.expression/expression]
  (let [ref->col     #(column-metadata-from-ref query stage-number %)
        boolean-col? #(ref-clause-with-type? % [:type/Boolean])]
    (lib.util.match/match-one filter-clause
      ;; no arguments
      [(op :guard #{:is-null :not-null}) _ (col-ref :guard boolean-col?)]
      {:operator op, :column (ref->col col-ref), :values []}

      ;; exactly 1 argument
      [(op :guard #{:=}) _ (col-ref :guard boolean-col?) (arg :guard boolean?)]
      {:operator op, :column (ref->col col-ref), :values [arg]})))

(def ^:private SpecificDateFilterParts
  [:map
   [:operator   ::lib.schema.filter/specific-date-filter-operator]
   [:column     ::lib.schema.metadata/column]
   [:values     [:sequential [:fn u.time/valid?]]]
   [:with-time? :boolean]])

(mu/defn specific-date-filter-clause :- ::lib.schema.expression/expression
  "Creates a specific date filter clause based on FE-friendly filter parts. It should be possible to destructure each
   created expression with [[specific-date-filter-parts]]."
  [operator   :- ::lib.schema.filter/specific-date-filter-operator
   column     :- ::lib.schema.metadata/column
   values     :- [:maybe [:sequential [:fn u.time/valid?]]]
   with-time? :- [:maybe :boolean]]
  (let [column (cond-> column
                 with-time? (lib.temporal-bucket/with-temporal-bucket :minute))
        values (mapv #(u.time/format-for-base-type % (if with-time? :type/DateTime :type/Date)) values)]
    (expression-clause operator (into [column] values) {})))

(mu/defn specific-date-filter-parts :- [:maybe SpecificDateFilterParts]
  "Destructures a specific date filter clause created by [[specific-date-filter-clause]]. Returns `nil` if the clause
  does not match the expected shape."
  [query         :- ::lib.schema/query
   stage-number  :- :int
   filter-clause :- ::lib.schema.expression/expression]
  (let [ref->col  #(column-metadata-from-ref query stage-number (lib.temporal-bucket/with-temporal-bucket % nil))
        date-col? #(ref-clause-with-type? % [:type/Date :type/DateTime])]
    (lib.util.match/match-one filter-clause
      ;; exactly 1 argument
      [(op :guard #{:= :> :<}) _ (col-ref :guard date-col?) (arg :guard string?)]
      (let [date? (u.time/matches-date? arg)
            arg   (u.time/coerce-to-timestamp arg)]
        (when (u.time/valid? arg)
          {:operator op, :column (ref->col col-ref), :values [arg], :with-time? (not date?)}))

      ;; exactly 2 arguments
      [(op :guard #{:between}) _ (col-ref :guard date-col?) (start :guard string?) (end :guard string?)]
      (let [date? (or (u.time/matches-date? start) (u.time/matches-date? end))
            start (u.time/coerce-to-timestamp start)
            end   (u.time/coerce-to-timestamp end)]
        (when (and (u.time/valid? start) (u.time/valid? end))
          {:operator op, :column (ref->col col-ref), :values [start end], :with-time? (not date?)})))))

(def ^:private RelativeDateFilterParts
  [:map
   [:column       ::lib.schema.metadata/column]
   [:value        [:or number? [:enum :current]]]
   [:unit         ::lib.schema.temporal-bucketing/unit.date-time.interval]
   [:offset-value {:optional true} [:maybe number?]]
   [:offset-unit  {:optional true} [:maybe ::lib.schema.temporal-bucketing/unit.date-time.interval]]
   [:options      [:maybe ::lib.schema.filter/time-interval-options]]])

(mu/defn relative-date-filter-clause :- ::lib.schema.expression/expression
  "Creates a relative date filter clause based on FE-friendly filter parts. It should be possible to destructure each
   created expression with [[relative-date-filter-parts]]."
  [column       :- ::lib.schema.metadata/column
   value        :- [:or number? [:enum :current]]
   unit         :- ::lib.schema.temporal-bucketing/unit.date-time.interval
   offset-value :- [:maybe number?]
   offset-unit  :- [:maybe ::lib.schema.temporal-bucketing/unit.date-time.interval]
   options      :- [:maybe ::lib.schema.filter/time-interval-options]]
  (let [column (lib.temporal-bucket/with-temporal-bucket column nil)]
    (if (or (nil? offset-value) (nil? offset-unit))
      (expression-clause :time-interval [column value unit] options)
      (expression-clause :relative-time-interval [column value unit offset-value offset-unit] {}))))

(mu/defn relative-date-filter-parts :- [:maybe RelativeDateFilterParts]
  "Destructures a relative date filter clause created by [[relative-date-filter-clause]]. Returns `nil` if the clause
  does not match the expected shape."
  [query         :- ::lib.schema/query
   stage-number  :- :int
   filter-clause :- ::lib.schema.expression/expression]
  (let [ref->col  #(column-metadata-from-ref query stage-number %)
        date-col? #(ref-clause-with-type? % [:type/Date :type/DateTime])]
    (lib.util.match/match-one filter-clause
      [:time-interval
       opts
       (col-ref :guard date-col?)
       (value :guard #(or (number? %) (= :current %)))
       (unit :guard keyword?)]
      {:column       (ref->col col-ref)
       :value        value
       :unit         unit
       :options      (select-keys opts [:include-current])}

      [:relative-time-interval
       _
       (col-ref :guard date-col?)
       (value :guard number?)
       (unit :guard keyword?)
       (offset-value :guard number?)
       (offset-unit :guard keyword?)]
      {:column       (ref->col col-ref)
       :value        value
       :unit         unit
       :offset-value offset-value
       :offset-unit  offset-unit
       :options      {}}

      ;; legacy expression; replaced by :relative-time-interval; supported for backward compatibility
      [:between _
       [:+ _
        (col-ref :guard date-col?)
        [:internal _ (offset-value :guard number?) (offset-unit :guard keyword?)]]
       [:relative-datetime _
        (start-value :guard number?)
        (start-unit :guard keyword?)]
       [:relative-datetime _
        (end-value :guard number?)
        (end-unit :guard keyword?)]]
      {:column       (ref->col col-ref)
       :value        (if (pos? offset-value) start-value end-value)
       :unit         start-unit
       :offset-value (- offset-value)
       :offset-unit  offset-unit
       :options      {}})))

(def ^:private ExcludeDateFilterParts
  [:map
   [:operator ::lib.schema.filter/exclude-date-filter-operator]
   [:column   ::lib.schema.metadata/column]
   [:unit     {:optional true} [:maybe ::lib.schema.filter/exclude-date-filter-unit]]
   [:values   [:sequential number?]]])

(mu/defn exclude-date-filter-clause :- ::lib.schema.expression/expression
  "Creates an exclude date filter clause based on FE-friendly filter parts. It should be possible to destructure each
   created expression with [[exclude-date-filter-parts]]."
  [operator :- ::lib.schema.filter/exclude-date-filter-operator
   column   :- ::lib.schema.metadata/column
   unit     :- [:maybe ::lib.schema.filter/exclude-date-filter-unit]
   values   :- [:maybe [:sequential number?]]]
  (let [column (lib.temporal-bucket/with-temporal-bucket column nil)
        expr   (if (= operator :!=)
                 (case unit
                   :hour-of-day (lib.expression/get-hour column)
                   :day-of-week (lib.expression/get-day-of-week column :iso)
                   :month-of-year (lib.expression/get-month column)
                   :quarter-of-year (lib.expression/get-quarter column))
                 column)]
    (expression-clause operator (into [expr] values) {})))

(mu/defn exclude-date-filter-parts :- [:maybe ExcludeDateFilterParts]
  "Destructures an exclude date filter clause created by [[exclude-date-filter-clause]]. Returns `nil` if the clause
  does not match the expected shape."
  [query stage-number filter-clause]
  (let [ref->col  #(column-metadata-from-ref query stage-number %)
        date-col? #(ref-clause-with-type? % [:type/Date :type/DateTime])
        op->unit  {:get-hour :hour-of-day
                   :get-month :month-of-year
                   :get-quarter :quarter-of-year}]
    (lib.util.match/match-one filter-clause
      ;; no arguments
      [(op :guard #{:is-null :not-null}) _ (col-ref :guard date-col?)]
      {:operator op, :column (ref->col col-ref), :values []}

      ;; without `mode`
      [:!= _ [(op :guard #{:get-hour :get-month :get-quarter}) _ (col-ref :guard date-col?)] & (args :guard #(every? int? %))]
      {:operator :!=, :column (ref->col col-ref), :unit (op->unit op), :values args}

      ;; with `:mode`
      [:!= _ [:get-day-of-week _ (col-ref :guard date-col?) :iso] & (args :guard #(every? int? %))]
      {:operator :!=, :column (ref->col col-ref), :unit :day-of-week, :values args})))

(def ^:private TimeFilterParts
  [:map
   [:operator ::lib.schema.filter/time-filter-operator]
   [:column   ::lib.schema.metadata/column]
   [:values   [:sequential [:fn u.time/valid?]]]])

(mu/defn time-filter-clause :- ::lib.schema.expression/expression
  "Creates a time filter clause based on FE-friendly filter parts. It should be possible to destructure each created
  expression with [[time-filter-parts]]."
  [operator :- ::lib.schema.filter/time-filter-operator
   column   :- ::lib.schema.metadata/column
   values   :- [:maybe [:sequential [:fn u.time/valid?]]]]
  (let [format-time #(u.time/format-for-base-type % :type/Time)]
    (expression-clause operator (into [column] (map format-time) values) {})))

(mu/defn time-filter-parts :- [:maybe TimeFilterParts]
  "Destructures a time filter clause created by [[time-filter-clause]]. Returns `nil` if the clause does not match
  the expected shape."
  [query         :- ::lib.schema/query
   stage-number  :- :int
   filter-clause :- ::lib.schema.expression/expression]
  (let [ref->col  #(column-metadata-from-ref query stage-number %)
        time-col? #(ref-clause-with-type? % [:type/Time])]
    (lib.util.match/match-one filter-clause
      ;; no arguments
      [(op :guard #{:is-null :not-null}) _ (col-ref :guard time-col?)]
      {:operator op, :column (ref->col col-ref), :values []}

      ;; exactly 1 argument
      [(op :guard #{:> :<}) _ (col-ref :guard time-col?) (arg :guard string?)]
      (let [arg (u.time/coerce-to-time arg)]
        (when (u.time/valid? arg)
          {:operator op, :column (ref->col col-ref), :values [arg]}))

      ;; exactly 2 arguments
      [(op :guard #{:between}) _ (col-ref :guard time-col?) (start :guard string?) (end :guard string?)]
      (let [start (u.time/coerce-to-time start)
            end   (u.time/coerce-to-time end)]
        (when (and (u.time/valid? start) (u.time/valid? end))
          {:operator op, :column (ref->col col-ref), :values [start end]})))))

(mu/defn filter-args-display-name :- :string
  "Provides a reasonable display name for the `filter-clause` excluding the column-name.
   Can be expanded as needed but only currently defined for a narrow set of date filters.

   Falls back to the full filter display-name"
  [query stage-number filter-clause]
  (let [->temporal-name #(u.time/format-unit % nil)
        temporal? #(lib.util/original-isa? % :type/Temporal)
        unit-is (fn [unit-or-units]
                  (let [units (set (u/one-or-many unit-or-units))]
                    (fn [maybe-clause]
                      (clojure.core/and
                       (temporal? maybe-clause)
                       (lib.util/clause? maybe-clause)
                       (clojure.core/contains? units (:temporal-unit (second maybe-clause)))))))
        ->unit {:get-hour :hour-of-day
                :get-month :month-of-year
                :get-quarter :quarter-of-year}]
    (lib.util.match/match-one filter-clause
      [:= _ [:get-day-of-week _ (_ :guard temporal?) :iso] (b :guard int?)]
      (inflections/plural (u.time/format-unit b :day-of-week-iso))

      [:!= _ [:get-day-of-week _ (_ :guard temporal?) :iso] (b :guard int?)]
      (i18n/tru "Excludes {0}" (inflections/plural (u.time/format-unit b :day-of-week-iso)))

      [:= _ [(f :guard #{:get-hour :get-month :get-quarter}) _ (_ :guard temporal?)] (b :guard int?)]
      (u.time/format-unit b (->unit f))

      [:!= _ [(f :guard #{:get-hour :get-month :get-quarter}) _ (_ :guard temporal?)] (b :guard int?)]
      (i18n/tru "Excludes {0}" (u.time/format-unit b (->unit f)))

      [:= _ (x :guard (unit-is lib.schema.temporal-bucketing/datetime-truncation-units)) (y :guard string?)]
      (u.time/format-relative-date-range y 0 (:temporal-unit (second x)) nil nil {:include-current true})

      [:during _ (x :guard temporal?) (y :guard string?) unit]
      (u.time/format-relative-date-range y 1 unit -1 unit {})

      [:= _ (x :guard temporal?) (y :guard (some-fn int? string?))]
      (lib.temporal-bucket/describe-temporal-pair x y)

      [:!= _ (x :guard temporal?) (y :guard (some-fn int? string?))]
      (i18n/tru "Excludes {0}" (lib.temporal-bucket/describe-temporal-pair x y))

      [:< _ (x :guard temporal?) (y :guard string?)]
      (i18n/tru "Before {0}" (->temporal-name y))

      [:> _ (x :guard temporal?) (y :guard string?)]
      (i18n/tru "After {0}" (->temporal-name y))

      [:between _ (x :guard temporal?) (y :guard string?) (z :guard string?)]
      (u.time/format-diff y z)

      [:is-null & _]
      (i18n/tru "Is Empty")

      [:not-null & _]
      (i18n/tru "Is Not Empty")

      [:time-interval _ (x :guard temporal?) n unit]
      (lib.temporal-bucket/describe-temporal-interval n unit)

      _
      (lib.metadata.calculation/display-name query stage-number filter-clause))))

(defn- query-dependents-foreign-keys
  [metadata-providerable columns]
  (for [column columns
        :let [fk-target-field-id (:fk-target-field-id column)]
        :when (and fk-target-field-id (lib.types.isa/foreign-key? column))]
    (if-let [fk-target-field (lib.metadata/field metadata-providerable fk-target-field-id)]
      {:type :table, :id (:table-id fk-target-field)}
      {:type :field, :id fk-target-field-id})))

(defn- query-dependents
  [metadata-providerable query-or-join]
  (let [base-stage (first (:stages query-or-join))
        database-id (or (:database query-or-join) -1)]
    (concat
     (when (pos? database-id)
       [{:type :database, :id database-id}
        {:type :schema,   :id database-id}])
     (when (= (:lib/type base-stage) :mbql.stage/native)
       (for [{tag-type :type, [dim-tag _opts id] :dimension} (vals (:template-tags base-stage))
             :when (and (= tag-type :dimension)
                        (= dim-tag :field)
                        (integer? id))]
         {:type :field, :id id}))
     (when-let [card-id (:source-card base-stage)]
       (let [card (lib.metadata/card metadata-providerable card-id)
             definition (:dataset-query card)]
         (concat [{:type :table, :id (str "card__" card-id)}]
                 (when-let [card-columns (lib.card/saved-question-metadata metadata-providerable card-id)]
                   (query-dependents-foreign-keys metadata-providerable card-columns))
                 (when (and (= (:type card) :metric) definition)
                   (query-dependents metadata-providerable
                                     (-> definition mbql.normalize/normalize lib.convert/->pMBQL))))))
     (when-let [table-id (:source-table base-stage)]
       (cons {:type :table, :id table-id}
             (query-dependents-foreign-keys metadata-providerable
                                            (lib.metadata/fields metadata-providerable table-id))))
     (for [stage (:stages query-or-join)
           join (:joins stage)
           dependent (query-dependents metadata-providerable join)]
       dependent))))

(def ^:private DependentItem
  [:and
   [:map
    [:type [:enum :database :schema :table :card :field]]]
   [:multi {:dispatch :type}
    [:database [:map [:id ::lib.schema.id/database]]]
    [:schema   [:map [:id ::lib.schema.id/database]]]
    [:table    [:map [:id [:or ::lib.schema.id/table :string]]]]
    [:field    [:map [:id ::lib.schema.id/field]]]]])

(mu/defn dependent-metadata :- [:sequential DependentItem]
  "Return the IDs and types of entities the metadata about is required
  for the FE to function properly.  `card-id` is provided
  when editing the card with that ID and in this case `a-query` is its
  definition (i.e., the dataset-query). `card-type` specifies the type
  of the card being created or edited."
  [query     :- ::lib.schema/query
   card-id   :- [:maybe ::lib.schema.id/card]
   card-type :- ::lib.schema.metadata/card.type]
  (into []
        (distinct)
        (concat
         (query-dependents query query)
         (when (and (some? card-id)
                    (#{:model :metric} card-type))
           (cons {:type :table, :id (str "card__" card-id)}
                 (when-let [card (lib.metadata/card query card-id)]
                   (query-dependents query (lib.query/query query card))))))))

(mu/defn table-or-card-dependent-metadata :- [:sequential DependentItem]
  "Return the IDs and types of entities which are needed upfront to create a new query based on a table/card."
  [_metadata-providerable :- ::lib.schema.metadata/metadata-providerable
   table-id               :- [:or ::lib.schema.id/table :string]]
  [{:type :table, :id table-id}])
