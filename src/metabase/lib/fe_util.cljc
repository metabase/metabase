(ns metabase.lib.fe-util
  (:refer-clojure :exclude [every? mapv select-keys some #?(:clj doseq) #?(:clj for)])
  (:require
   [inflections.core :as inflections]
   [medley.core :as m]
   [metabase.lib.aggregation :as lib.aggregation]
   [metabase.lib.card :as lib.card]
   [metabase.lib.common :as lib.common]
   [metabase.lib.dispatch :as lib.dispatch]
   [metabase.lib.expression :as lib.expression]
   [metabase.lib.filter :as lib.filter]
   [metabase.lib.hierarchy :as lib.hierarchy]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.lib.metadata.calculation :as lib.metadata.calculation]
   [metabase.lib.metadata.protocols :as lib.metadata.protocols]
   [metabase.lib.normalize :as lib.normalize]
   [metabase.lib.options :as lib.options]
   [metabase.lib.query :as lib.query]
   [metabase.lib.ref :as lib.ref]
   [metabase.lib.schema :as lib.schema]
   [metabase.lib.schema.expression :as lib.schema.expression]
   [metabase.lib.schema.filter :as lib.schema.filter]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.lib.schema.join :as lib.schema.join]
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
   [metabase.util.number :as u.number]
   [metabase.util.performance :refer [every? mapv select-keys some #?(:clj doseq) #?(:clj for)]]
   [metabase.util.time :as u.time]))

(def ^:private ExpressionArg
  [:or
   :string
   :boolean
   :keyword
   :int
   :float
   ::lib.schema.metadata/column
   ::lib.schema.metadata/segment
   ::lib.schema.metadata/metric])

(def ^:private ExpressionParts
  [:schema
   {:registry {::expression-parts
               [:map
                [:lib/type [:= :mbql/expression-parts]]
                [:operator [:or :keyword :string]]
                [:options :map]
                [:args [:sequential [:or ExpressionArg [:ref ::expression-parts]]]]]}}
   ::expression-parts])

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

(defn expand-temporal-expression
  "Modify expression in a way, that its resulting [[expression-parts]] are digestable by filter picker.

   Current filter picker implementation is unable to handle expression parts of expressions of a form
   `[:= {...} [:field {:temporal-unit :week} 11] \"2024-05-12\"]` -- expressions that check for equality of a column
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

(defn- column-metadata-from-ref
  [query stage-number a-ref]
  (-> (lib.metadata.calculation/metadata query stage-number a-ref)
      lib.filter/add-column-operators))

(defmulti expression-parts-method
  "Builds the expression parts by dispatching on the type of the argument."
  {:arglists '([query stage-number arg])}
  (fn [_query _stage-number value]
    (lib.dispatch/dispatch-value value))
  :hierarchy lib.hierarchy/hierarchy)

(defmethod expression-parts-method :default
  [query stage-number [op options & args]]
  {:lib/type :mbql/expression-parts
   :operator op
   :options  options
   :args     (mapv (partial expression-parts-method query stage-number) args)})

(doseq [dispatch-value [:if :case]]
  (defmethod expression-parts-method dispatch-value
    ; case and if expressions expect a vector of pairs of if-then clause as
    ; the first argument, but ExpressionParts can only represent a flat list of clauses.
    ; This multimethod flattens the arguments into a flat list.
    [query stage-number [op options clause-pairs fallback]]
    ((get-method expression-parts-method :default)
     query stage-number (cond->
                         (into [op options] cat clause-pairs)
                          (some? fallback) (conj fallback)))))

(doseq [dispatch-value [:dispatch-type/expression-parts
                        :dispatch-type/string
                        :dispatch-type/integer
                        :dispatch-type/number
                        :dispatch-type/boolean
                        :dispatch-type/keyword
                        :dispatch-type/nil
                        :metadata/column
                        :metadata/measure
                        :metadata/segment
                        :metadata/metric]]
  (defmethod expression-parts-method dispatch-value
    [_query _stage-number value]
    value))

(defmethod expression-parts-method :=
  [query stage-number clause]
  ((get-method expression-parts-method :default)
   query stage-number (cond-> clause
                        (expandable-temporal-expression? clause) expand-temporal-expression)))

(defmethod expression-parts-method :field
  [query stage-number field-ref]
  (let [stripped-ref (lib.options/update-options field-ref #(dissoc % :lib/expression-name))]
    (column-metadata-from-ref query stage-number stripped-ref)))

(defmethod expression-parts-method :segment
  [query _stage-number segment-ref]
  (or
   (lib.metadata/segment query (last segment-ref))
   {:lib/type :metadata/segment
    :id (last segment-ref)
    :display-name (i18n/tru "Unknown Segment")}))

(defmethod expression-parts-method :measure
  [query _stage-number measure-ref]
  (or
   (lib.metadata/measure query (last measure-ref))
   {:lib/type :metadata/measure
    :id (last measure-ref)
    :display-name (i18n/tru "Unknown Measure")}))

(defmethod expression-parts-method :metric
  [query _stage-number metric-ref]
  (let [metric-id (last metric-ref)]
    (if-let [metric (lib.metadata/metric query metric-id)]
      metric
      {:lib/type :metadata/metric
       :id metric-id
       :display-name (i18n/tru "Unknown Metric")})))

(defmethod expression-parts-method :expression
  [query stage-number expression-ref]
  ;; Set the expression name as used in the ref as the expression might
  ;; have other aliases set on it which might be wrong.
  (lib.options/with-options
    (column-metadata-from-ref query stage-number expression-ref)
    {:lib/expression-name (last expression-ref)}))

(defmethod expression-parts-method :aggregation
  [query stage-number [_tag _opts aggregation-ref]]
  (let [aggregation-columns (lib.aggregation/aggregations-metadata query stage-number)]
    (m/find-first (comp #{aggregation-ref} :lib/source-uuid) aggregation-columns)))

(mu/defn expression-parts :- [:or ExpressionArg ExpressionParts]
  "Return the parts of the filter clause `arg` in query `query` at stage `stage-number`."
  ([query value]
   (expression-parts query -1 value))

  ([query :- ::lib.schema/query
    stage-index :- :int
    expression-clause :- [:or ::lib.schema.expression/expression ExpressionArg ExpressionParts]]
   (expression-parts-method query stage-index expression-clause)))

(defn- case-or-if-expression?
  [clause]
  (and (vector? clause)
       (boolean (#{:case :if} (first clause)))))

(defn- case-or-if-pairs
  [args]
  (mapv vec (partition 2 args)))

(defn- group-case-or-if-args
  "case and if expression expect the first argument to be a
   list of pairs of if-then clauses.

   Callers of expression-clause might not always be aware of what clause they are
   passing so they can't pass the correct format for the arguments.

   Additionally, expression-parts flattens the arguments into a flat list.

   This helper groups the arguments into a list of pairs again."
  [[op options & args]]
  (if (even? (count args))
    [op options (case-or-if-pairs args)]
    [op options (case-or-if-pairs (butlast args)) (last args)]))

(defn- fix-expression-clause
  [clause]
  (cond-> clause
    (case-or-if-expression? clause) group-case-or-if-args))

(defmulti expression-clause-method
  "Builds the expression clause by dispatching on the type of the argument."
  {:arglists '([value])}
  lib.dispatch/dispatch-value
  :hierarchy lib.hierarchy/hierarchy)

(defmethod expression-clause-method :default
  [value]
  value)

(doseq [dispatch-value [:metadata/column
                        :metadata/measure
                        :metadata/segment
                        :metadata/metric]]
  (defmethod expression-clause-method dispatch-value
    [metadata]
    (lib.ref/ref metadata)))

(defmethod expression-clause-method :mbql/expression-parts
  [{:keys [operator options args]}]
  (-> (into [(keyword operator) (or options {})] (map lib.common/->op-arg) args)
      fix-expression-clause
      lib.options/ensure-uuid
      lib.normalize/normalize))

(mu/defn expression-clause :- ::lib.schema.expression/expression
  "Returns a standalone clause for an `operator`, `options`, and arguments."
  ;; TODO - remove lib.schema.expression/expression here as it might not be supported in all cases
  ([parts :- [:or ExpressionParts ExpressionArg ::lib.schema.expression/expression]]
   (expression-clause-method parts))

  ([operator :- [:or :keyword :string]
    args     :- [:sequential [:or ExpressionArg ExpressionParts ::lib.schema.expression/expression]]
    options  :- [:maybe :map]]
   (expression-clause-method {:lib/type :mbql/expression-parts
                              :operator operator
                              :options  options
                              :args     args})))

(defmethod lib.common/->op-arg :mbql/expression-parts
  [{:keys [operator options args] :or {options {}}}]
  (expression-clause operator args options))

(defn- expression-clause-with-in
  "Like [[expression-clause]], but also auto-converts `:=` and `:!=` to `:in` and `:not-in` when there are more than 2
  arguments."
  [operator args options]
  (let [operator (if (> (count args) 2)
                   (case operator
                     :=  :in
                     :!= :not-in
                     operator)
                   operator)]
    (expression-clause operator args options)))

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
  (expression-clause-with-in operator (into [column] values)
                             (if (#{:is-empty :not-empty := :!=} operator)
                               {}
                               {:case-sensitive (:case-sensitive options false)})))

(mu/defn string-filter-parts :- [:maybe StringFilterParts]
  "Destructures a string filter clause created by [[string-filter-clause]]. Returns `nil` if the clause does not match
  the expected shape. To avoid mistakes the function returns `options` for all operators even though they might not be
  used. Note that the FE does not support `:is-null` and `:not-null` operators with string columns."
  [query         :- ::lib.schema/query
   stage-number  :- :int
   filter-clause :- ::lib.schema.expression/expression]
  (let [ref->col    #(column-metadata-from-ref query stage-number %)
        string-col? #(ref-clause-with-type? % [:type/Text :type/TextLike])
        result (fn [op col-ref args options]
                 {:operator op, :column (ref->col col-ref), :values (vec args), :options options})]
    (lib.util.match/match-lite filter-clause
      ;; no arguments
      [(op :guard #{:is-empty :not-empty}) _ (col-ref :guard string-col?) & (args :len 0 :guard (every? string? args))]
      (result op col-ref [] {})

      ;; multiple arguments, `:=`
      [(op :guard #{:= :in}) _ (col-ref :guard string-col?) & (args :guard (every? string? args))]
      (result := col-ref args {})

      ;; multiple arguments, `:!=`
      [(op :guard #{:!= :not-in}) _ (col-ref :guard string-col?) & (args :guard (every? string? args))]
      (result :!= col-ref args {})

      ;; multiple arguments with options
      [(op :guard #{:contains :does-not-contain :starts-with :ends-with}) opts (col-ref :guard string-col?) & (args :guard (every? string? args))]
      (result op col-ref args {:case-sensitive (:case-sensitive opts true)})

      ;; do not match inner clauses
      _ nil)))

(def ^:private NumberFilterValue
  [:or number? [:fn u.number/bigint?]])

(defn- number->expression-arg
  [value]
  (if (u.number/bigint? value)
    (lib.expression/value value)
    value))

(defn- expression-arg->number
  [arg]
  (lib.util.match/match-lite arg
    (value :guard number?)
    value

    [:value (x :guard (= (:base-type x) :type/BigInteger)) (value :guard string?)]
    (u.number/parse-bigint value)

    _ nil))

(def ^:private NumberFilterParts
  [:map
   [:operator ::lib.schema.filter/number-filter-operator]
   [:column   ::lib.schema.metadata/column]
   [:values   [:sequential NumberFilterValue]]])

(mu/defn number-filter-clause :- ::lib.schema.expression/expression
  "Creates a numeric filter clause based on FE-friendly filter parts. It should be possible to destructure each created
  expression with [[number-filter-parts]]."
  [operator :- ::lib.schema.filter/number-filter-operator
   column   :- ::lib.schema.metadata/column
   values   :- [:maybe [:sequential NumberFilterValue]]]
  (expression-clause-with-in operator (into [column] (map number->expression-arg) values) {}))

(mu/defn number-filter-parts :- [:maybe NumberFilterParts]
  "Destructures a numeric filter clause created by [[number-filter-clause]]. Returns `nil` if the clause does not match
  the expected shape."
  [query         :- ::lib.schema/query
   stage-number  :- :int
   filter-clause :- ::lib.schema.expression/expression]
  (let [ref->col    #(column-metadata-from-ref query stage-number %)
        number-col? #(ref-clause-with-type? % [:type/Number])
        number-arg? #(some? (expression-arg->number %))]
    (lib.util.match/match-lite filter-clause
      (:or
       ;; no arguments
       [(op :guard #{:is-null :not-null}) _ (col-ref :guard number-col?) & (args :len 0 :guard (every? number-arg? args))]

       ;; multiple arguments, `:=`
       [(op :guard #{:= :in})             _ (col-ref :guard number-col?) & (args        :guard (every? number-arg? args))]

       ;; multiple arguments, `:!=`
       [(op :guard #{:!= :not-in})        _ (col-ref :guard number-col?) & (args        :guard (every? number-arg? args))]

       ;; exactly 1 argument
       [(op :guard #{:> :>= :< :<=})      _ (col-ref :guard number-col?) & (args :len 1 :guard (every? number-arg? args))]

       ;; exactly 2 arguments
       [(op :guard #{:between})           _ (col-ref :guard number-col?) & (args :len 2 :guard (every? number-arg? args))])
      {:operator ({:in :=, :not-in :!=} op op)
       :column   (ref->col col-ref)
       :values   (mapv expression-arg->number args)}

      ;; do not match inner clauses
      _ nil)))

(def ^:private CoordinateFilterParts
  [:map
   [:operator         ::lib.schema.filter/coordinate-filter-operator]
   [:column           ::lib.schema.metadata/column]
   [:longitude-column {:optional true} [:maybe ::lib.schema.metadata/column]]
   [:values           [:sequential NumberFilterValue]]])

(mu/defn coordinate-filter-clause :- ::lib.schema.expression/expression
  "Creates a coordinate filter clause based on FE-friendly filter parts. It should be possible to destructure each
  created expression with [[coordinate-filter-parts]]."
  [operator         :- ::lib.schema.filter/coordinate-filter-operator
   column           :- ::lib.schema.metadata/column
   longitude-column :- [:maybe ::lib.schema.metadata/column]
   values           :- [:maybe [:sequential NumberFilterValue]]]
  (if (= operator :inside)
    (expression-clause operator (into [column longitude-column] values) {})
    (expression-clause-with-in operator (into [column] (map number->expression-arg) values) {})))

(mu/defn coordinate-filter-parts :- [:maybe CoordinateFilterParts]
  "Destructures a coordinate filter clause created by [[coordinate-filter-clause]]. Returns `nil` if the clause does not
  match the expected shape. Unlike regular numeric filters, coordinate filters do not support `:is-null` and
  `:not-null`. There is also a special `:inside` operator that requires both latitude and longitude columns."
  [query         :- ::lib.schema/query
   stage-number  :- :int
   filter-clause :- ::lib.schema.expression/expression]
  (let [ref->col        #(column-metadata-from-ref query stage-number %)
        coordinate-col? #(and (ref-clause-with-type? % [:type/Number])
                              (lib.types.isa/coordinate? (ref->col %)))
        number-arg?     #(some? (expression-arg->number %))
        result          (fn [op col-ref lon-col-ref args]
                          (cond-> {:operator ({:in :=, :not-in :!=} op op)
                                   :column (ref->col col-ref)
                                   :values (mapv expression-arg->number args)}
                            lon-col-ref (assoc :longitude-column (ref->col lon-col-ref))))]
    (lib.util.match/match-lite filter-clause
      (:or
       ;; multiple arguments, `:=`
       [(op :guard #{:= :in})        _ (col-ref :guard coordinate-col?) & (args        :guard (every? number-arg? args))]
       ;; multiple arguments, `:!=`
       [(op :guard #{:!= :not-in})   _ (col-ref :guard coordinate-col?) & (args        :guard (every? number-arg? args))]
       ;; exactly 1 argument
       [(op :guard #{:> :>= :< :<=}) _ (col-ref :guard coordinate-col?) & (args :len 1 :guard (every? number-arg? args))]
       ;; exactly 2 arguments
       [(op :guard #{:between})      _ (col-ref :guard coordinate-col?) & (args :len 2 :guard (every? number-arg? args))])
      (result op col-ref nil args)

      ;; exactly 4 arguments
      [(op :guard #{:inside})
       _
       (lat-col-ref :guard coordinate-col?)
       (lon-col-ref :guard coordinate-col?)
       & (args :len 4 :guard (every? number-arg? args))]
      (result op lat-col-ref lon-col-ref args)

      ;; do not match inner clauses
      _ nil)))

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
    (lib.util.match/match-lite filter-clause
      (:or
       ;; no arguments
       [(op :guard #{:is-null :not-null}) _ (col-ref :guard boolean-col?) & (args :len 0 :guard (every? boolean? args))]
       ;; exactly 1 argument
       [(op :guard #{:=})                 _ (col-ref :guard boolean-col?) & (args :len 1 :guard (every? boolean? args))])
      {:operator op, :column (ref->col col-ref), :values (vec args)}

      ;; do not match inner clauses
      _ nil)))

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
        date-col? #(ref-clause-with-type? % [:type/Date :type/DateTime])
        result    (fn [op col-ref args]
                    (let [date? (some u.time/matches-date? args)
                          values (mapv u.time/coerce-to-timestamp args)]
                      (when (every? u.time/valid? values)
                        {:operator op, :column (ref->col col-ref), :values values, :with-time? (not date?)})))]
    (lib.util.match/match-lite filter-clause
      (:or
       ;; exactly 1 argument
       [(op :guard #{:= :> :<}) _ (col-ref :guard date-col?) & (args :len 1 :guard (every? string? args))]

       ;; exactly 2 arguments
       [(op :guard #{:between}) _ (col-ref :guard date-col?) & (args :len 2 :guard (every? string? args))])
      (result op col-ref args)

      ;; do not match inner clauses
      _ nil)))

(def ^:private RelativeDateFilterParts
  [:map
   [:column       ::lib.schema.metadata/column]
   [:value        number?]
   [:unit         ::lib.schema.temporal-bucketing/unit.date-time.interval]
   [:offset-value {:optional true} [:maybe number?]]
   [:offset-unit  {:optional true} [:maybe ::lib.schema.temporal-bucketing/unit.date-time.interval]]
   [:options      [:maybe ::lib.schema.filter/time-interval-options]]])

(mu/defn relative-date-filter-clause :- ::lib.schema.expression/expression
  "Creates a relative date filter clause based on FE-friendly filter parts. It should be possible to destructure each
   created expression with [[relative-date-filter-parts]]."
  [column       :- ::lib.schema.metadata/column
   value        :- number?
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
    (lib.util.match/match-lite filter-clause
      [:time-interval
       opts
       (col-ref :guard date-col?)
       (value :guard (or (number? value) (= :current value)))
       (unit :guard keyword?)]
      {:column       (ref->col col-ref)
       :value        (if (= value :current) 0 value)
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

      ;; do not match inner clauses
      _ nil)))

(def ^:private ExcludeDateFilterParts
  [:map
   [:operator ::lib.schema.filter/exclude-date-filter-operator]
   [:column   ::lib.schema.metadata/column]
   [:unit     {:optional true} [:maybe ::lib.schema.filter/exclude-date-filter-unit]]
   [:values   [:sequential number?]]])

(mu/defn- make-expression-parts :- ExpressionParts
  "Build a mbql/expression-parts map with a new uuid"
  [operator :- :keyword
   args :- [:sequential [:or ExpressionArg ExpressionParts]]]
  {:lib/type :mbql/expression-parts
   :operator operator
   :options  {:lib/uuid (str (random-uuid))}
   :args     args})

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
                   :hour-of-day (make-expression-parts :get-hour [column])
                   :day-of-week (make-expression-parts :get-day-of-week [column :iso])
                   :month-of-year (make-expression-parts :get-month [column])
                   :quarter-of-year (make-expression-parts :get-quarter [column]))
                 column)]
    (expression-clause-with-in operator (into [expr] values) {})))

(mu/defn exclude-date-filter-parts :- [:maybe ExcludeDateFilterParts]
  "Destructures an exclude date filter clause created by [[exclude-date-filter-clause]]. Returns `nil` if the clause
  does not match the expected shape."
  [query stage-number filter-clause]
  (let [ref->col  #(column-metadata-from-ref query stage-number %)
        date-col? #(ref-clause-with-type? % [:type/Date :type/DateTime])
        op->unit  {:get-hour :hour-of-day
                   :get-month :month-of-year
                   :get-quarter :quarter-of-year}]
    (lib.util.match/match-lite filter-clause
      ;; no arguments
      [(op :guard #{:is-null :not-null}) _ (col-ref :guard date-col?) & (args :len 0 :guard (every? int? args))]
      {:operator op, :column (ref->col col-ref), :values []}

      ;; without `mode`
      [(_ :guard #{:!= :not-in}) _ [(op :guard #{:get-hour :get-month :get-quarter}) _ (col-ref :guard date-col?)] & (args :guard (every? int? args))]
      {:operator :!=, :column (ref->col col-ref), :unit (op->unit op), :values args}

      ;; with `:mode`
      [(_ :guard #{:!= :not-in}) _ [:get-day-of-week _ (col-ref :guard date-col?) :iso] & (args :guard (every? int? args))]
      {:operator :!=, :column (ref->col col-ref), :unit :day-of-week, :values args}

      ;; do not match inner clauses
      _ nil)))

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
    (lib.util.match/match-lite filter-clause
      (:or
       ;; no arguments
       [(op :guard #{:is-null :not-null}) _ (col-ref :guard time-col?) & (args :len 0 :guard (every? string? args))]
       ;; exactly 1 argument
       [(op :guard #{:> :<})              _ (col-ref :guard time-col?) & (args :len 1 :guard (every? string? args))]
       ;; exactly 2 arguments
       [(op :guard #{:between})           _ (col-ref :guard time-col?) & (args :len 2 :guard (every? string? args))])
      (let [values (mapv u.time/coerce-to-time args)]
        (when (every? u.time/valid? values)
          {:operator op, :column (ref->col col-ref), :values values}))

      ;; do not match inner clauses
      _ nil)))

(def ^:private DefaultFilterParts
  [:map
   [:operator ::lib.schema.filter/default-filter-operator]
   [:column   ::lib.schema.metadata/column]])

(mu/defn default-filter-clause :- ::lib.schema.expression/expression
  "Creates a default filter clause based on FE-friendly filter parts. It should be possible to destructure each created
  expression with [[default-filter-parts]]. This clause works as a fallback for more specialized column types."
  [operator :- ::lib.schema.filter/default-filter-operator
   column   :- ::lib.schema.metadata/column]
  (expression-clause operator [column] {}))

(mu/defn default-filter-parts :- [:maybe DefaultFilterParts]
  "Destructures a default filter clause created by [[default-filter-clause]]. Returns `nil` if the clause does not match
  the expected shape or if the clause uses a string column; the FE allows only `:is-empty` and `:not-empty` operators
  for string columns."
  [query         :- ::lib.schema/query
   stage-number  :- :int
   filter-clause :- ::lib.schema.expression/expression]
  (let [ref->col       #(column-metadata-from-ref query stage-number %)
        supported-col? #(and (lib.util/ref-clause? %)
                             (not (lib.util/original-isa? % :type/Text))
                             (not (lib.util/original-isa? % :type/TextLike)))]
    (lib.util.match/match-lite filter-clause
      [(op :guard #{:is-null :not-null}) _ (col-ref :guard supported-col?)]
      {:operator op, :column (ref->col col-ref)}

      _ nil)))

;; ::lib.schema.expression/expression
(def ^:private JoinConditionParts
  [:map
   [:operator       ::lib.schema.join/condition.operator]
   [:lhs-expression ::lib.schema.expression/expression]
   [:rhs-expression ::lib.schema.expression/expression]])

(mu/defn join-condition-clause :- ::lib.schema.join/condition
  "Creates a join condition from the operator, LHS and RHS expressions."
  [operator       :- ::lib.schema.join/condition.operator
   lhs-expression :- ::lib.schema.expression/expression
   rhs-expression :- ::lib.schema.expression/expression]
  (expression-clause operator [lhs-expression rhs-expression] {}))

(mu/defn join-condition-parts :- [:maybe JoinConditionParts]
  "Destructures a join condition created by [[join-condition-clause]]."
  [join-condition :- ::lib.schema.join/condition]
  (lib.util.match/match-one join-condition
    [(op :guard lib.schema.join/condition-operators) _ lhs rhs]
    {:operator op, :lhs-expression lhs, :rhs-expression rhs}

    ;; do not match inner clauses
    _ nil))

(mu/defn join-condition-lhs-or-rhs-literal? :- :boolean
  "Whether this LHS or RHS expression is a `:value` clause."
  [lhs-or-rhs :- [:maybe ::lib.schema.expression/expression]]
  (lib.util/clause-of-type? lhs-or-rhs :value))

(mu/defn join-condition-lhs-or-rhs-column? :- :boolean
  "Whether this LHS or RHS expression is a `:field` or `:expression` reference."
  [lhs-or-rhs :- [:maybe ::lib.schema.expression/expression]]
  (or (lib.util/clause-of-type? lhs-or-rhs :field)
      (lib.util/clause-of-type? lhs-or-rhs :expression)))

(mu/defn filter-args-display-name :- :string
  "Provides a reasonable display name for the `filter-clause` excluding the column-name.
   Can be expanded as needed but only currently defined for a narrow set of date filters.

   Falls back to the full filter display-name"
  [query stage-number filter-clause]
  (let [->temporal-name #(u.time/format-unit % nil)
        temporal? #(lib.util/original-isa? % :type/Temporal)
        unit= (fn [maybe-clause unit-or-units]
                (let [units (set (u/one-or-many unit-or-units))]
                  (clojure.core/and
                   (temporal? maybe-clause)
                   (lib.util/clause? maybe-clause)
                   (clojure.core/contains? units (:temporal-unit (second maybe-clause))))))
        ->unit {:get-hour :hour-of-day
                :get-month :month-of-year
                :get-quarter :quarter-of-year}]
    (lib.util.match/match-lite filter-clause
      [#{:= :in} _ [:get-day-of-week _ (_ :guard temporal?) :iso] (b :guard int?)]
      (inflections/plural (u.time/format-unit b :day-of-week-iso))

      [#{:!= :not-in} _ [:get-day-of-week _ (_ :guard temporal?) :iso] (b :guard int?)]
      (i18n/tru "Excludes {0}" (inflections/plural (u.time/format-unit b :day-of-week-iso)))

      [#{:= :in} _ [(f :guard #{:get-hour :get-month :get-quarter}) _ (_ :guard temporal?)] (b :guard int?)]
      (u.time/format-unit b (->unit f))

      [#{:!= :not-in} _ [(f :guard #{:get-hour :get-month :get-quarter}) _ (_ :guard temporal?)] (b :guard int?)]
      (i18n/tru "Excludes {0}" (u.time/format-unit b (->unit f)))

      [#{:= :in} _ (x :guard (unit= x lib.schema.temporal-bucketing/datetime-truncation-units)) (y :guard string?)]
      (u.time/format-relative-date-range y 0 (:temporal-unit (second x)) nil nil {:include-current true})

      [:during _ (x :guard temporal?) (y :guard string?) unit]
      (u.time/format-relative-date-range y 1 unit -1 unit {})

      [#{:= :in} _ (x :guard temporal?) (y :guard (or (int? y) (string? y)))]
      (lib.temporal-bucket/describe-temporal-pair x y)

      [#{:!= :not-in} _ (x :guard temporal?) (y :guard (or (int? y) (string? y)))]
      (i18n/tru "Excludes {0}" (lib.temporal-bucket/describe-temporal-pair x y))

      [:< _ (x :guard temporal?) (y :guard string?)]
      (i18n/tru "Before {0}" (->temporal-name y))

      [:> _ (x :guard temporal?) (y :guard string?)]
      (i18n/tru "After {0}" (->temporal-name y))

      [:between _ (_ :guard temporal?) (y :guard string?) (z :guard string?)]
      (u.time/format-diff y z)

      [:is-null & _]
      (i18n/tru "Is Empty")

      [:not-null & _]
      (i18n/tru "Is Not Empty")

      [:time-interval opts (_ :guard temporal?) n unit]
      (lib.temporal-bucket/describe-temporal-interval n unit opts)

      [:relative-time-interval _ (_ :guard temporal?) n unit offset offset-unit]
      (lib.temporal-bucket/describe-temporal-interval-with-offset n unit offset offset-unit)

      _
      (lib.metadata.calculation/display-name query stage-number filter-clause))))

(defn- query-dependents-snippets
  "Recursively extract snippet dependencies from snippet template tags.
   Returns a sequence of dependent items including the snippet and any nested snippets."
  [metadata-providerable snippet-id visited-ids]
  (if-let [snippet (lib.metadata/native-query-snippet metadata-providerable snippet-id)]
    (let [visited-ids' (conj visited-ids snippet-id)]
      (cons {:type :native-query-snippet, :id snippet-id}
            ;; Recursively get dependencies from the snippet's own template tags
            (for [{nested-type       :type,
                   nested-snippet-id :snippet-id} (vals (:template-tags snippet))
                  :when (and (= nested-type :snippet)
                             (integer? nested-snippet-id)
                             (not (contains? visited-ids' nested-snippet-id)))
                  dependency (query-dependents-snippets metadata-providerable
                                                        nested-snippet-id
                                                        visited-ids')]
              dependency)))
    ;; Return just the ID if we can't fetch the snippet:
    [{:type :native-query-snippet, :id snippet-id}]))

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
  (let [base-stage  (first (:stages query-or-join))
        database-id (or (:database query-or-join) -1)]
    (concat
     (when (pos? database-id)
       [{:type :database, :id database-id}
        {:type :schema, :id database-id}])
     (when (= (:lib/type base-stage) :mbql.stage/native)
       (concat
        ;; Extract field dependencies from dimension template tags
        (for [{tag-type :type, [dim-tag _opts id] :dimension} (vals (:template-tags base-stage))
              :when                                           (and (= tag-type :dimension)
                                                                   (= dim-tag :field)
                                                                   (integer? id))]
          {:type :field, :id id})
        ;; Extract snippet dependencies from snippet template tags (with recursion)
        (mapcat
         (fn [{tag-type :type, snippet-id :snippet-id}]
           (when (and (= tag-type :snippet)
                      (some? snippet-id)
                      (integer? snippet-id))
             ;; Only try to recurse if we have a real metadata provider
             (if (lib.metadata.protocols/metadata-providerable? metadata-providerable)
               (query-dependents-snippets metadata-providerable snippet-id #{})
               ;; If we don't have a real metadata provider, just return the direct dependency
               [{:type :native-query-snippet, :id snippet-id}])))
         (vals (:template-tags base-stage)))))
     (when-let [card-id (:source-card base-stage)]
       (let [card       (lib.metadata/card metadata-providerable card-id)
             definition (:dataset-query card)]
         (concat [{:type :table, :id (str "card__" card-id)}]
                 (when-let [card-columns (lib.card/saved-question-metadata metadata-providerable card-id)]
                   (query-dependents-foreign-keys metadata-providerable card-columns))
                 (when (and (= (:type card) :metric) definition)
                   (query-dependents metadata-providerable
                                     definition)))))
     (when-let [table-id (:source-table base-stage)]
       (cons {:type :table, :id table-id}
             (query-dependents-foreign-keys metadata-providerable
                                            (lib.metadata/fields metadata-providerable table-id))))
     (for [stage     (:stages query-or-join)
           join      (:joins stage)
           dependent (query-dependents metadata-providerable join)]
       dependent))))

(def ^:private DependentItem
  [:and
   [:map
    [:type [:enum :database :schema :table :card :field :native-query-snippet]]]
   [:multi {:dispatch :type}
    [:database [:map [:id ::lib.schema.id/database]]]
    [:schema   [:map [:id ::lib.schema.id/database]]]
    [:table    [:map [:id [:or ::lib.schema.id/table :string]]]]
    [:field [:map [:id ::lib.schema.id/field]]]
    [:native-query-snippet [:map [:id ::lib.schema.id/native-query-snippet]]]]])

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
