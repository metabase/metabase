(ns metabase.legacy-mbql.schema
  "Schema for validating a *normalized* MBQL 4 query.

  For 'historical reasons' all the MBQL clauses in this namespace have a schema like
  `::tag`, e.g. `metabase.legacy-mbql.schema/starts-with` for the `:starts-with` clause.
  Other schemas use `UpperCamelCase` names (as an artifact of when this was written using Schema 100 years ago) --
  changing this convention is more work than it's work, so follow it here if you need to touch this namespace.

  GENERALLY you should not need to touch this namespace, since MBQL 4 should be considered frozen in time in 57+ with
  the move to MBQL 5 in the app DB and over the wire -- any new MBQL clauses should only get added to the MBQL 5
  schema in [[metabase.lib.schema]] going forward. We don't want to have to add things to two places for the rest of
  our lives; it's ok if MBQL 4 doesn't support some new features."
  (:refer-clojure :exclude [every? select-keys #?(:clj doseq) some mapv update-keys empty? not-empty])
  (:require
   [clojure.set :as set]
   [clojure.string :as str]
   [malli.core :as mc]
   [metabase.legacy-mbql.schema.helpers :as helpers :refer [is-clause?]]
   [metabase.legacy-mbql.schema.macros :refer [defclause defclause* one-of]]
   [metabase.lib.hierarchy :as lib.hierarchy]
   [metabase.lib.normalize :as lib.normalize]
   [metabase.lib.schema.actions :as lib.schema.actions]
   [metabase.lib.schema.aggregation :as lib.schema.aggregation]
   [metabase.lib.schema.binning :as lib.schema.binning]
   [metabase.lib.schema.common :as lib.schema.common]
   [metabase.lib.schema.constraints :as lib.schema.constraints]
   [metabase.lib.schema.expression.temporal :as lib.schema.expression.temporal]
   [metabase.lib.schema.expression.window :as lib.schema.expression.window]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.lib.schema.info :as lib.schema.info]
   [metabase.lib.schema.join :as lib.schema.join]
   [metabase.lib.schema.literal :as lib.schema.literal]
   [metabase.lib.schema.metadata :as lib.schema.metadata]
   [metabase.lib.schema.metadata.fingerprint :as lib.schema.metadata.fingerprint]
   [metabase.lib.schema.middleware-options :as lib.schema.middleware-options]
   [metabase.lib.schema.parameter :as lib.schema.parameter]
   [metabase.lib.schema.ref :as lib.schema.ref]
   [metabase.lib.schema.settings :as lib.schema.settings]
   [metabase.lib.schema.template-tag :as lib.schema.template-tag]
   [metabase.lib.schema.temporal-bucketing :as lib.schema.temporal-bucketing]
   [metabase.lib.util.match :as lib.util.match]
   [metabase.util :as u]
   [metabase.util.malli :as mu]
   [metabase.util.malli.registry :as mr]
   [metabase.util.performance :as perf :refer [every? select-keys #?(:clj doseq) some mapv update-keys empty? not-empty]]
   [metabase.util.time :as u.time]))

(defn infer-mbql-clause-schema
  "Infer the schema for something that is (probably) an MBQL clause."
  [x]
  (when (sequential? x)
    (when-let [tag (helpers/effective-clause-tag x)]
      (keyword "metabase.legacy-mbql.schema" (name tag)))))

(defn- normalize-mbql-clause [x]
  (when-let [schema (infer-mbql-clause-schema x)]
    (lib.normalize/normalize schema x)))

(mr/def ::AnyMBQLClause
  "Schema for ANY valid MBQL clause"
  [:fn
   {:error/message "Valid MBQL clause"
    :decode/normalize normalize-mbql-clause}
   helpers/normalized-mbql-clause?])

(mr/def ::options-style
  "For convenience of converting back and forth between MBQL 5, from now on we can record info about the options style
  of a given clause you can do:

    (defmethod options-style-method :field [_tag] ::options-style.last-always)"
  [:enum
   {:default ::options-style.none}
   ;;
   ;; this is the default style (options is unsupported)
   ::options-style.none
   ;;
   ;; same style as MBQL 5; options map is always the first arg after the tag and we should use `{}` instead of `nil`
   ;; for empty options. `:lib/uuid` should be preserved here I think.
   ::options-style.mbql5
   ;;
   ;; like a `:field` ref, options are ALWAYS the last arg, but should be `nil` if the options map is empty.
   ::options-style.last-always
   ;;
   ;; The same as but keys should be `snake_case` (`:value` uses this)
   ::options-style.last-always.snake_case
   ;;
   ;; like a `:expression` ref, options is optional but should only be present if non-nil.
   ::options-style.last-unless-empty
   ;;
   ;; for `:contains` and other string filters: style is `::options-style.last-unless-empty` if the clause has two
   ;; args, otherwise it's basically the same as `::options-style.mbql-5` if it has > 3 args, altho `:lib/uuid`
   ;; should not be kept on conversion to legacy
   ::options-style.𝕨𝕚𝕝𝕕])

(defmulti ^:private options-style-method
  {:arglists '([tag])}
  keyword)

(defmethod options-style-method :default
  [_tag]
  ::options-style.none)

(mu/defn options-style :- ::options-style
  "The style of options a legacy MBQL clause supports."
  [tag :- simple-keyword?]
  (options-style-method tag))

;; `:day-of-week` depends on the [[metabase.lib-be.core/start-of-week]] Setting, by default Sunday.
;; 1 = first day of the week (e.g. Sunday)
;; 7 = last day of the week (e.g. Saturday)
(def ^:private date-bucketing-units
  "Set of valid units for bucketing or comparing against a *date* Field."
  #{:default :day :day-of-week :day-of-month :day-of-year :week :week-of-year
    :month :month-of-year :quarter :quarter-of-year :year :year-of-era})

(def ^:private time-bucketing-units
  "Set of valid units for bucketing or comparing against a *time* Field."
  #{:default :millisecond :second :minute :minute-of-hour :hour :hour-of-day})

(def datetime-bucketing-units
  "Set of valid units for bucketing or comparing against a *datetime* Field."
  (set/union date-bucketing-units time-bucketing-units))

(mr/def ::DateUnit
  "Valid unit for date bucketing."
  (into [:enum {:error/message "date bucketing unit"}] date-bucketing-units))

;; it could make sense to say hour-of-day(field) =  hour-of-day("2018-10-10T12:00")
;; but it does not make sense to say month-of-year(field) = month-of-year("08:00:00"),
;; does it? So we'll restrict the set of units a TimeValue can have to ones that have no notion of day/date.
(mr/def ::TimeUnit
  "Valid unit for time bucketing."
  (into [:enum {:error/message "time bucketing unit"}] time-bucketing-units))

(mr/def ::DateTimeUnit
  "Valid unit for *datetime* bucketing."
  (into [:enum {:error/message "datetime bucketing unit"}] datetime-bucketing-units))

(mr/def ::TemporalExtractUnit
  "Valid units to extract from a temporal."
  [:enum
   {:error/message "temporal extract unit"}
   :year-of-era
   :quarter-of-year
   :month-of-year
   :week-of-year-iso
   :week-of-year-us
   :week-of-year-instance
   :day-of-month
   :day-of-week
   :day-of-week-iso
   :hour-of-day
   :minute-of-hour
   :second-of-minute])

(mr/def ::DatetimeDiffUnit
  "Valid units for a datetime-diff clause."
  [:enum
   {:error/message "datetime-diff unit", :decode/normalize helpers/normalize-keyword}
   :second :minute :hour :day :week :month :quarter :year])

(mr/def ::ExtractWeekMode
  "Valid modes to extract weeks."
  [:enum
   {:error/message "temporal-extract week extraction mode", :decode/normalize helpers/normalize-keyword}
   :iso :us :instance])

(mr/def ::RelativeDatetimeUnit
  [:enum
   {:error/message "relative-datetime unit", :decode/normalize helpers/normalize-keyword}
   :default :minute :hour :day :week :month :quarter :year])

;; TODO - `unit` is not allowed if `n` is `current`
(defclause relative-datetime
  n    [:or
        {:decode/normalize (fn [x]
                             (if (number? x)
                               x
                               :current))}
        [:= :current]
        :int]
  unit (optional [:ref ::RelativeDatetimeUnit]))

(defclause interval
  n    :int
  unit [:ref ::RelativeDatetimeUnit])

;; This clause is automatically generated by middleware when datetime literals (literal strings or one of the Java
;; types) are encountered. Unit is inferred by looking at the Field the timestamp is compared against. Implemented
;; mostly to convenience driver implementations. You don't need to use this form directly when writing MBQL; datetime
;; literal strings are preferred instead.
;;
;; example:
;; [:= [:field 10 {:temporal-unit :day}] "2018-10-02"]
;;
;; becomes:
;; [:= [:field 10 {:temporal-unit :day}] [:absolute-datetime #inst "2018-10-02" :day]]
(defclause* absolute-datetime
  [:multi {:error/message "valid :absolute-datetime clause"
           :dispatch      (fn [x]
                            (cond
                              (not (is-clause? :absolute-datetime x))            :invalid
                              (mr/validate ::lib.schema.literal/date (second x)) :date
                              :else                                              :datetime))}
   [:invalid [:fn
              {:error/message "not an :absolute-datetime clause"}
              (constantly false)]]
   [:date (helpers/clause
           :absolute-datetime
           "date" ::lib.schema.literal/date
           "unit" ::DateUnit)]
   [:datetime (helpers/clause
               :absolute-datetime
               "datetime" ::lib.schema.literal/datetime
               "unit"     ::DateTimeUnit)]])

;; almost exactly the same as `absolute-datetime`, but generated in some situations where the literal in question was
;; clearly a time (e.g. "08:00:00.000") and/or the Field derived from `:type/Time` and/or the unit was a
;; time-bucketing unit
(defclause time
  time ::lib.schema.literal/time
  unit [:ref ::TimeUnit])

(mr/def ::DateOrDatetimeLiteral
  "Schema for a valid date or datetime literal."
  [:or
   {:error/message "date or datetime literal"}
   [:ref ::relative-datetime]
   [:ref ::absolute-datetime]
   ;; literal datetime strings and Java types will get transformed to [[absolute-datetime]] clauses automatically by
   ;; middleware so drivers don't need to deal with these directly. You only need to worry about handling
   ;; `absolute-datetime` clauses.
   [:ref ::lib.schema.literal/datetime]
   [:ref ::lib.schema.literal/date]])

(mr/def ::TimeLiteral
  "Schema for valid time literals."
  [:or
   {:error/message "time literal"}
   [:ref ::time]
   [:ref ::lib.schema.literal/time]])

(mr/def ::TemporalLiteral
  "Schema for valid temporal literals."
  [:or
   {:error/message "temporal literal"}
   [:ref ::DateOrDatetimeLiteral]
   [:ref ::TimeLiteral]])

(mr/def ::DateTimeValue
  "Schema for a datetime value drivers will personally have to handle, either an `absolute-datetime` form or a
  `relative-datetime` form."
  (one-of absolute-datetime relative-datetime time))

(mr/def ::ValueTypeInfo
  [:map
   {:decode/normalize (fn [m]
                        (when (map? m)
                          (update-keys m (comp keyword u/->snake_case_en))))
    :description      (str "Type info about a value in a `:value` clause. Added automatically by `wrap-value-literals`"
                           " middleware to values in filter clauses based on the Field in the clause.")}
   [:database_type {:optional true} [:maybe ::lib.schema.common/non-blank-string]]
   [:base_type     {:optional true} [:maybe ::lib.schema.common/base-type]]
   [:semantic_type {:optional true} [:maybe ::lib.schema.common/semantic-or-relation-type]]
   [:unit          {:optional true} [:maybe ::DateTimeUnit]]
   [:name          {:optional true} [:maybe ::lib.schema.common/non-blank-string]]])

;; Arguments to filter clauses are automatically replaced with [:value <value> <type-info>] clauses by the
;; `wrap-value-literals` middleware. This is done to make it easier to implement query processors, because most driver
;; implementations dispatch off of Object type, which is often not enough to make informed decisions about how to
;; treat certain objects. For example, a string compared against a Postgres UUID Field needs to be parsed into a UUID
;; object, since text <-> UUID comparison doesn't work in Postgres. For this reason, raw literals in `:filter`
;; clauses are wrapped in `:value` clauses and given information about the type of the Field they will be compared to.
;;
;; :value clauses are also used to wrap top-level literal values in expression clauses.
(defclause value
  value    :any
  type-info [:maybe ::ValueTypeInfo])

(defmethod options-style-method :value [_tag] ::options-style.last-always.snake_case)

;; Expression *references* refer to a something in the `:expressions` clause, e.g. something like
;;
;;    [:+ [:field 1 nil] [:field 2 nil]]
;;
;; As of 0.42.0 `:expression` references can have an optional options map
(mr/def ::ExpressionRefOptions
  "Options for a legacy `:expression` ref in MBQL 4 are the same as in MBQL 5, except that `:lib/uuid` is optional and
  it cannot be empty."
  [:and
   [:merge
    {:decode/normalize (fn [m]
                         (when-let [m (lib.schema.ref/normalize-expression-options m)]
                           (dissoc m :lib/uuid)))}
    ::lib.schema.ref/expression.options
    [:map
     [:lib/uuid {:optional true} ::lib.schema.common/uuid]]]
   (lib.schema.common/disallowed-keys {:lib/uuid "MBQL 4 refs should not have :lib/uuid"})
   [:fn
    {:error/message    "MBQL 4 :expression options should not be empty, use a nil map instead"
     :decode/normalize perf/not-empty}
    seq]])

(mr/def ::ExpressionName
  [:ref
   {:decode/normalize #(cond-> % (keyword? %) u/qualified-name)}
   ::lib.schema.common/non-blank-string])

(defclause* expression
  [:and
   (helpers/clause
    :expression
    "expression-name" [:ref ::ExpressionName]
    "options"         [:optional ::ExpressionRefOptions])
   [:fn
    {:error/message    ":expression should not have empty opts"
     :decode/normalize (fn [x]
                         (when (helpers/possibly-unnormalized-mbql-clause? x)
                           (if (and (= (count x) 3)
                                    (empty? (last x)))
                             (pop (vec x)) ; remove nil/empty options maps.
                             x)))}
    (fn [[_tag _expression-name opts :as expression-ref]]
      (or (= (count expression-ref) 2)
          (seq opts)))]])

(defmethod options-style-method :expression [_tag] ::options-style.last-unless-empty)

(mr/def ::FieldRefOptions
  "Options for an MBQL 4 `:field` ref are the same as MBQL 5, except that `:lib/uuid` is not required and it cannot be
  empty."
  [:maybe
   [:and
    [:merge
     {:decode/normalize (fn [m]
                          (when-let [m (lib.schema.ref/normalize-field-options-map m)]
                            (dissoc m :lib/uuid)))}
     [:ref ::lib.schema.ref/field.options]
     [:map
      [:lib/uuid {:optional true} ::lib.schema.common/uuid]]]
    (lib.schema.common/disallowed-keys {:lib/uuid "MBQL 4 refs should not have :lib/uuid"})
    [:fn
     {:error/message    "MBQL 4 :field ref options should not be empty, use nil instead"
      :decode/normalize perf/not-empty}
     seq]]])

(mr/def ::require-base-type-for-field-name
  "Fields using names rather than integer IDs are required to specify `:base-type`."
  [:fn
   {:error/message ":field clauses using a string field name must specify :base-type."}
   (fn [[_ id-or-name {:keys [base-type]}]]
     (if (string? id-or-name)
       base-type
       true))])

(defmethod options-style-method :field [_tag] ::options-style.last-always)

(defn- normalize-field [x]
  (case (cond
          (pos-int? x)                                   ::raw-int
          (helpers/possibly-unnormalized-mbql-clause? x) (helpers/actual-clause-tag x))
    ::raw-int         [:field x nil]
    :field-id         (let [[_tag id] x]
                        ;; sometimes the old FE code was dumb and passed in `:field-literal` wrapped inside` `:field-id`
                        (if (sequential? id)
                          (normalize-field id)
                          [:field id nil]))
    :field-literal    (let [[_tag field-name base-type] x]
                        [:field (u/qualified-name field-name) {:base-type (keyword base-type)}])
    :datetime-field   (let [[_tag nested-ref temporal-unit] (if (= (count x) 4)
                                                              ;; handle MBQL 2 (?) `:datetime-field` which had the `:as`
                                                              ;; keyword for "readability" e.g.
                                                              ;;
                                                              ;;    [:datetime-field 20 :as :day]
                                                              (let [[tag nested-ref _as temporal-unit] x]
                                                                [tag nested-ref temporal-unit])
                                                              x)
                            [_tag id-or-name opts]          (normalize-field nested-ref)]
                        [:field id-or-name (assoc opts :temporal-unit (helpers/normalize-keyword temporal-unit))])
    :binning-strategy (let [[_tag nested-ref binning-strategy arg bin-opts] x
                            [_tag id-or-name opts]                          (normalize-field nested-ref)
                            strategy                                        (helpers/normalize-keyword binning-strategy)]
                        [:field id-or-name (assoc opts :binning (cond-> {:strategy strategy}
                                                                  arg      (assoc strategy arg)
                                                                  bin-opts (merge bin-opts)))])
    :joined-field     (let [[_tag join-alias nested-ref] x
                            [_tag id-or-name opts]       (normalize-field nested-ref)]
                        [:field id-or-name (assoc opts :join-alias (u/qualified-name join-alias))])
    :fk->             (let [[_tag source-field dest-field] x
                            [_tag source-field-id _opts]   (normalize-field source-field)
                            [_tag dest-field-id _opts]     (normalize-field dest-field)]
                        [:field dest-field-id {:source-field source-field-id}])
    :field            (let [[_tag id-or-name opts] x]
                        ;; if someone accidentally nests `:field` clauses fix it for them
                        (if (sequential? id-or-name)
                          (let [[_tag id-or-name recursive-opts] (normalize-field id-or-name)]
                            [:field id-or-name (not-empty (merge recursive-opts opts))])
                          [:field id-or-name (not-empty opts)]))
    x))

(defclause* ^{:added "0.39.0"} field
  [:and
   {:decode/normalize #'normalize-field}
   (helpers/clause
    :field
    "id-or-name" [:or ::lib.schema.id/field :string]
    "options"    [:maybe [:ref ::FieldRefOptions]])
   ::require-base-type-for-field-name])

(defn- normalize-raw-positive-int-to-field-ref
  "Treats raw positive integers as Field IDs for backwards compatibility with MBQL 2, e.g.

    [:= 10 20] => [:= [:field 10 nil] 20]"
  [x]
  (if (pos-int? x)
    [:field x nil]
    x))

(mr/def ::FieldOrExpressionRef
  [:schema
   {:decode/normalize #'normalize-raw-positive-int-to-field-ref}
   (one-of expression field)])

;; aggregate field reference refers to an aggregation, e.g.
;;
;;    {:aggregation [[:count]]
;;     :order-by    [[:asc [:aggregation 0]]]} ;; refers to the 0th aggregation, `:count`
;;
;; Currently aggregate Field references can only be used inside order-by clauses. In the future once we support SQL
;; `HAVING` we can allow them in filter clauses too
;;
;; TODO - it would be nice if we could check that there's actually an aggregation with the corresponding index,
;; wouldn't it
;;
;; As of 0.42.0 `:aggregation` references can have an optional options map.
(mr/def ::AggregationRefOptions
  [:map
   {:decode/normalize (fn [m]
                        (when-let [m (lib.schema.ref/normalize-aggregation-ref-options m)]
                          (not-empty (dissoc m :lib/uuid))))}
   [:name           {:optional true} ::lib.schema.common/non-blank-string]
   [:display-name   {:optional true} ::lib.schema.common/non-blank-string]
   [:base-type      {:optional true} [:maybe ::lib.schema.common/base-type]]
   [:effective-type {:optional true} [:maybe ::lib.schema.common/base-type]]])

(defclause* aggregation
  [:and
   (helpers/clause
    :aggregation
    "aggregation-clause-index" :int
    "options"                  [:optional [:ref ::AggregationRefOptions]])
   [:fn
    {:error/message    ":aggregation should not have empty opts"
     :decode/normalize (fn [x]
                         (when (helpers/possibly-unnormalized-mbql-clause? x)
                           (if (and (= (count x) 3)
                                    (empty? (last x)))
                             (pop (vec x)) ; remove nil/empty options maps.
                             x)))}
    (fn [[_tag _aggregation-index opts :as expression-ref]]
      (or (= (count expression-ref) 2)
          (seq opts)))]])

(defmethod options-style-method :aggregation [_tag] ::options-style.last-unless-empty)

(mr/def ::Reference
  "Schema for any type of valid Field clause, or for an indexed reference to an aggregation clause."
  (one-of aggregation expression field))

(defclause ^{:added "0.50.0"} offset
  opts [:ref ::lib.schema.common/options]
  expr [:or [:ref ::FieldOrExpressionDef] [:ref ::Aggregation]]
  n    ::lib.schema.expression.window/offset.n)

(defmethod options-style-method :offset [_tag] ::options-style.mbql5)

;; Expressions are "calculated column" definitions, defined once and then used elsewhere in the MBQL query.

(def string-functions
  "Functions that return string values. Should match [[StringExpression]]."
  #{:substring :trim :rtrim :ltrim :upper :lower :replace :concat :regex-match-first :coalesce :case :if
    :host :domain :subdomain :path :month-name :quarter-name :day-name :text :split-part :collate})

(mr/def ::StringExpressionArg
  [:multi
   {:dispatch (fn [x]
                (cond
                  (string? x)                     :string
                  (is-clause? string-functions x) :string-expression
                  (is-clause? :value x)           :value
                  :else                           :else))}
   [:string            :string]
   [:string-expression [:ref ::StringExpression]]
   [:value             [:ref ::value]]
   [:else              [:ref ::FieldOrExpressionRef]]])

(def numeric-functions
  "Functions that return numeric values. Should match `::NumericExpression`."
  #{:+ :- :/ :* :coalesce :length :round :ceil :floor :abs :power :sqrt :log :exp :case :if :datetime-diff :integer :float
    ;; extraction functions (get some component of a given temporal value/column)
    :temporal-extract
    ;; SUGAR drivers do not need to implement
    :get-year :get-quarter :get-month :get-week :get-day :get-day-of-week :get-hour :get-minute :get-second})

(def boolean-functions
  "Functions that return boolean values. Should match `::BooleanExpression`."
  #{:and :or :not :< :<= :> :>= := :!= :in :not-in :between :starts-with :ends-with :contains
    :does-not-contain :inside :is-empty :not-empty :is-null :not-null :relative-time-interval :time-interval :during})

;; TODO (Tamas 2026-01-05): Remove :measure from this set once FE tests switch to using MBQL5
(def ^:private aggregations
  #{:sum :avg :stddev :var :median :percentile :min :max :cum-count :cum-sum :count-where :sum-where :share :distinct
    :distinct-where :metric :measure :aggregation-options :count :offset})

(def ^:private datetime-functions
  "Functions that return Date or DateTime values. Should match `::DatetimeExpression`."
  #{:+ :datetime-add :datetime-subtract :convert-timezone :now :date :datetime :today :coalesce :case :if})

(mr/def ::NumericExpressionArg
  [:multi
   {:error/message "numeric expression argument"
    :dispatch      (fn [x]
                     (cond
                       (number? x)                      :number
                       (is-clause? numeric-functions x) :numeric-expression
                       (is-clause? aggregations x)      :aggregation
                       (is-clause? :value x)            :value
                       :else                            :field))}
   [:number             number?]
   [:numeric-expression [:ref ::NumericExpression]]
   [:aggregation        [:ref ::Aggregation]]
   [:value              [:ref ::value]]
   [:field              [:ref ::Reference]]])

(mr/def ::DateTimeExpressionArg
  [:multi
   {:error/message "datetime expression argument"
    :dispatch      (fn [x]
                     (cond
                       (is-clause? aggregations x)       :aggregation
                       (is-clause? :value x)             :value
                       (is-clause? datetime-functions x) :datetime-expression
                       :else                             :else))}
   [:aggregation         [:ref ::Aggregation]]
   [:value               [:ref ::value]]
   [:datetime-expression [:ref ::DatetimeExpression]]
   [:else                [:or
                          [:ref ::DateOrDatetimeLiteral]
                          [:ref ::FieldOrExpressionRef]]]])

(mr/def ::ExpressionArg
  [:multi
   {:error/message "expression argument"
    :dispatch      (fn [x]
                     (cond
                       (number? x)                       :number
                       (boolean? x)                      :boolean
                       (is-clause? boolean-functions x)  :boolean-expression
                       (is-clause? numeric-functions x)  :numeric-expression
                       (is-clause? datetime-functions x) :datetime-expression
                       (is-clause? aggregations x)       :aggregation
                       (is-clause? :aggregation x)       :aggregation-ref
                       (string? x)                       :string
                       (is-clause? string-functions x)   :string-expression
                       (is-clause? :value x)             :value
                       :else                             :else))}
   [:number               number?]
   [:boolean              :boolean]
   [:boolean-expression   [:ref ::BooleanExpression]]
   [:numeric-expression   [:ref ::NumericExpression]]
   [:datetime-expression  [:ref ::DatetimeExpression]]
   [:aggregation          [:ref ::Aggregation]]
   [:aggregation-ref      [:ref ::aggregation]]
   [:string               :string]
   [:string-expression    [:ref ::StringExpression]]
   [:value                [:ref ::value]]
   [:else                 [:ref ::FieldOrExpressionRef]]])

(mr/def ::Addable
  [:or
   {:error/message "numeric expression arg or interval"}
   [:ref ::NumericExpressionArg]
   [:ref ::DateTimeExpressionArg]
   (one-of interval segment)])

(mr/def ::IntGreaterThanZeroOrNumericExpression
  [:multi
   {:error/message "int greater than zero or numeric expression"
    :dispatch      (fn [x]
                     (if (number? x)
                       :number
                       :else))}
   [:number [:schema
             {:decode/normalize (fn [n]
                                  (let [n (long n)]
                                    (if (pos-int? n)
                                      n
                                      1)))}
             pos-int?]]
   [:else   [:ref ::NumericExpression]]])

(defclause coalesce
  a    [:ref ::ExpressionArg]
  b    [:ref ::ExpressionArg]
  more (rest [:ref ::ExpressionArg]))

(defclause substring
  s      [:ref ::StringExpressionArg]
  start  [:ref ::IntGreaterThanZeroOrNumericExpression]
  length (optional [:ref ::NumericExpressionArg]))

(defclause split-part
  text      [:ref ::StringExpressionArg]
  delimiter [:string {:min 1}]
  position  [:ref ::IntGreaterThanZeroOrNumericExpression])

(defclause collate
  s [:ref ::StringExpressionArg]
  collation :string)

(defclause length
  s [:ref ::StringExpressionArg])

(defclause trim
  s [:ref ::StringExpressionArg])

(defclause rtrim
  s [:ref ::StringExpressionArg])

(defclause ltrim
  s [:ref ::StringExpressionArg])

(defclause upper
  s [:ref ::StringExpressionArg])

(defclause lower
  s [:ref ::StringExpressionArg])

(defclause replace
  s           [:ref ::StringExpressionArg]
  match       :string
  replacement :string)

(defclause text
  x [:ref ::ExpressionArg])

;; Relax the arg types to ExpressionArg for concat since many DBs allow to concatenate non-string types. This also
;; aligns with the corresponding MLv2 schema and with the reference docs we publish.
(defclause concat
  a    [:ref ::ExpressionArg]
  b    [:ref ::ExpressionArg]
  more (rest [:ref ::ExpressionArg]))

(defclause regex-match-first
  s       [:ref ::StringExpressionArg]
  pattern :string)

(defclause host
  s [:ref ::StringExpressionArg])

(defclause domain
  s [:ref ::StringExpressionArg])

(defclause subdomain
  s [:ref ::StringExpressionArg])

(defclause path
  s [:ref ::StringExpressionArg])

(defclause month-name
  n [:ref ::NumericExpressionArg])

(defclause quarter-name
  n [:ref ::NumericExpressionArg])

(defclause day-name
  n [:ref ::NumericExpressionArg])

(defclause +
  x    [:ref ::Addable]
  y    [:ref ::Addable]
  more (rest [:ref ::Addable]))

(defclause -
  x    [:ref ::Addable]
  y    [:ref ::Addable]
  more (rest [:ref ::Addable]))

(defclause /
  x    [:ref ::NumericExpressionArg]
  y    [:ref ::NumericExpressionArg]
  more (rest [:ref ::NumericExpressionArg]))

(defclause *
  x    [:ref ::NumericExpressionArg]
  y    [:ref ::NumericExpressionArg]
  more (rest [:ref ::NumericExpressionArg]))

(defclause floor
  x [:ref ::NumericExpressionArg])

(defclause ceil
  x [:ref ::NumericExpressionArg])

(defclause round
  x [:ref ::NumericExpressionArg])

(defclause abs
  x [:ref ::NumericExpressionArg])

(defclause power
  x [:ref ::NumericExpressionArg]
  y [:ref ::NumericExpressionArg])

(defclause sqrt
  x [:ref ::NumericExpressionArg])

(defclause exp
  x [:ref ::NumericExpressionArg])

(defclause log
  x [:ref ::NumericExpressionArg])

(defclause integer
  x [:or [:ref ::NumericExpressionArg] [:ref ::StringExpressionArg]])

(defclause float
  x [:ref ::StringExpressionArg])

;; The result is positive if x <= y, and negative otherwise.
;;
;; Days, weeks, months, and years are only counted if they are whole to the "day".
;; For example, `datetimeDiff("2022-01-30", "2022-02-28", "month")` returns 0 months.
;;
;; If the values are datetimes, the time doesn't matter for these units. For example,
;; `datetimeDiff("2022-01-01T09:00:00", "2022-01-02T08:00:00", "day")` returns 1 day even though it is less than 24
;; hours.
;;
;; Hours, minutes, and seconds are only counted if they are whole.
;; For example, datetimeDiff("2022-01-01T01:00:30", "2022-01-01T02:00:29", "hour") returns 0 hours.
(defclause datetime-diff
  datetime-x [:ref ::DateTimeExpressionArg]
  datetime-y [:ref ::DateTimeExpressionArg]
  unit       [:ref ::DatetimeDiffUnit])

(defclause temporal-extract
  datetime [:ref ::DateTimeExpressionArg]
  unit     [:ref ::TemporalExtractUnit]
  mode     (optional [:ref ::ExtractWeekMode])) ;; only for get-week and get-day-of-week

;; SUGAR CLAUSE: get-year, get-month... clauses are all sugars clause that will be rewritten as
;;
;;    [:temporal-extract column :year]
(defclause get-year
  date [:ref ::DateTimeExpressionArg])

(defclause get-quarter
  date [:ref ::DateTimeExpressionArg])

(defclause get-month
  date [:ref ::DateTimeExpressionArg])

(defclause get-week
  date [:ref ::DateTimeExpressionArg]
  mode (optional [:ref ::ExtractWeekMode]))

(defclause get-day
  date [:ref ::DateTimeExpressionArg])

(defclause get-day-of-week
  date [:ref ::DateTimeExpressionArg]
  mode (optional [:ref ::ExtractWeekMode]))

(defclause get-hour
  datetime [:ref ::DateTimeExpressionArg])

(defclause get-minute
  datetime [:ref ::DateTimeExpressionArg])

(defclause get-second
  datetime [:ref ::DateTimeExpressionArg])

(defclause convert-timezone
  datetime [:ref ::DateTimeExpressionArg]
  to       [:ref ::lib.schema.expression.temporal/timezone-id]
  from     (optional [:ref ::lib.schema.expression.temporal/timezone-id]))

(mr/def ::ArithmeticDateTimeUnit
  [:enum {:error/message "datetime arithmetic unit", :decode/normalize keyword}
   :millisecond :second :minute :hour :day :week :month :quarter :year])

(defclause datetime-add
  datetime [:ref ::DateTimeExpressionArg]
  amount   [:ref ::NumericExpressionArg]
  unit     [:ref ::ArithmeticDateTimeUnit])

(defclause now)

(defclause datetime-subtract
  datetime [:ref ::DateTimeExpressionArg]
  amount   [:ref ::NumericExpressionArg]
  unit     [:ref ::ArithmeticDateTimeUnit])

(defclause date
  string [:or
          [:ref ::StringExpressionArg]
          [:ref ::DateTimeExpressionArg]])

(defclause today)

(mr/def ::DatetimeOptionsMode
  (into [:enum {:error/message "datetime mode string", :decode/normalize lib.schema.expression.temporal/normalize-datetime-mode}]
        lib.schema.expression.temporal/datetime-modes))

(mr/def ::DatetimeOptions
  [:map {:decode/normalize lib.schema.common/normalize-map}
   [:mode {:optional true} [:ref ::DatetimeOptionsMode]]])

(defclause datetime
  value   [:ref ::ExpressionArg]
  options (optional [:ref ::DatetimeOptions]))

(defmethod options-style-method :datetime [_tag] ::options-style.last-unless-empty)

(mr/def ::DatetimeExpression
  "Schema for the definition of a date function expression."
  (one-of + datetime-add datetime-subtract convert-timezone now date datetime today coalesce case if))

(defn- compound-filter-schema [tag]
  [:multi
   {:decode/normalize (fn [x]
                        (when (sequential? x)
                          (let [[_tag & subclauses] x]
                            (if (= (count subclauses) 1)
                              (first subclauses)
                              x))))
    :dispatch         helpers/effective-clause-tag}
   [tag [:and
         (helpers/clause
          tag
          "first-clause"  [:ref ::Filter]
          "second-clause" [:ref ::Filter]
          "other-clauses" [:rest [:ref ::Filter]])
         ;; flatten nested compound filters of the same type, e.g. `[:and x [:and y z]]` => `[:and x y z]`
         [:schema
          {:decode/normalize (fn [[tag & subclauses]]
                               (into [tag]
                                     (mapcat (fn [subclause]
                                               (if (= (helpers/actual-clause-tag subclause) tag)
                                                 (rest subclause)
                                                 [subclause])))
                                     subclauses))}
          :any]]]
   [::mc/default [:ref ::Filter]]])

(defclause* and
  (compound-filter-schema :and))

(defclause* or
  (compound-filter-schema :or))

(defn- normalize-not
  "`not` inside of a `not` should get elimated entirely."
  [[_tag subclause-1 :as clause]]
  (or (when (= (helpers/actual-clause-tag subclause-1) :not)
        (let [[_tag subclause-2] subclause-1]
          subclause-2))
      clause))

(defclause* not
  [:and
   (helpers/clause
    :not
    "clause" [:ref :metabase.legacy-mbql.schema/Filter])
   [:schema
    {:decode/normalize #'normalize-not}
    :any]])

(mr/def ::FieldOrExpressionRefOrRelativeDatetime
  [:multi
   {:error/message ":field or :expression reference or :relative-datetime"
    :error/fn      (constantly ":field or :expression reference or :relative-datetime")
    :dispatch      (fn [x]
                     (if (is-clause? :relative-datetime x)
                       :relative-datetime
                       :else))}
   [:relative-datetime [:ref ::relative-datetime]]
   [:else              [:ref ::FieldOrExpressionRef]]])

(mr/def ::EqualityComparable
  "Schema for things that make sense in a `=` or `!=` filter, i.e. things that can be compared for equality."
  [:maybe
   {:error/message "equality comparable"}
   [:or
    :boolean
    number?
    :string
    [:ref ::TemporalLiteral]
    [:ref ::FieldOrExpressionRefOrRelativeDatetime]
    [:ref ::ExpressionArg]
    [:ref ::value]]])

(mr/def ::OrderComparable
  "Schema for things that make sense in a filter like `>` or `<`, i.e. things that can be sorted."
  [:multi
   {:error/message "order comparable"
    :dispatch      (fn [x]
                     (if (is-clause? :value x)
                       :value
                       :else))}
   [:value [:ref ::value]]
   [:else [:or
           number?
           :string
           [:ref ::TemporalLiteral]
           [:ref ::ExpressionArg]
           [:ref ::aggregation]
           [:ref ::FieldOrExpressionRefOrRelativeDatetime]]]])

;; For all of the non-compound Filter clauses below the first arg is an implicit Field ID

;; These are SORT OF SUGARY, because extra values will automatically be converted a compound clauses. Driver
;; implementations only need to handle the 2-arg forms.
;;
;; `=` works like SQL `IN` with more than 2 args
;;
;;    [:= [:field 1 nil] 2 3] --[DESUGAR]--> [:or [:= [:field 1 nil] 2] [:= [:field 1 nil] 3]]
;;
;; `!=` works like SQL `NOT IN` with more than 2 args
;;
;;    [:!= [:field 1 nil] 2 3] --[DESUGAR]--> [:and [:!= [:field 1 nil] 2] [:!= [:field 1 nil] 3]]

(mr/def ::EqualityFilterFieldArg
  "Schema for the first arg to `=`, `!=`, and friends."
  [:schema
   {:decode/normalize #'normalize-raw-positive-int-to-field-ref}
   [:ref ::EqualityComparable]])

(defclause =
  field                 [:ref ::EqualityFilterFieldArg]
  value-or-field        [:ref ::EqualityComparable]
  more-values-or-fields (rest [:ref ::EqualityComparable]))

(defn- replace-exclude-date-filters
  "Replaces legacy exclude date filter clauses that rely on temporal bucketing with `:temporal-extract` function calls."
  [filter-clause]
  (lib.util.match/replace filter-clause
    [:!=
     [:field id-or-name (opts :guard #(= (:temporal-unit %) :hour-of-day))]
     & (args :guard #(every? number? %))]
    (into [:!= [:get-hour [:field id-or-name (not-empty (dissoc opts :temporal-unit))]]] args)

    [:!=
     [:field id-or-name (opts :guard #(#{:day-of-week :month-of-year :quarter-of-year} (:temporal-unit %)))]
     & (args :guard #(every? u.time/timestamp-coercible? %))]
    (let [args (mapv u.time/coerce-to-timestamp args)]
      (if (every? u.time/valid? args)
        (let [unit         (:temporal-unit opts)
              field        [:field id-or-name (not-empty (dissoc opts :temporal-unit))]
              extract-expr (case unit
                             :day-of-week     [:get-day-of-week field :iso]
                             :month-of-year   [:get-month field]
                             :quarter-of-year [:get-quarter field])
              extract-unit (if (= unit :day-of-week) :day-of-week-iso unit)]
          (into [:!= extract-expr]
                (map #(u.time/extract % extract-unit))
                args))
        &match))))

(defclause* !=
  [:and
   (helpers/clause
    :!=
    "field"                 [:ref ::EqualityFilterFieldArg]
    "value-or-field"        [:ref ::EqualityComparable]
    "more-values-or-fields" [:rest [:ref ::EqualityComparable]])
   [:schema
    {:decode/normalize #'replace-exclude-date-filters}
    :any]])

;; aliases for `:=` and `:!=`
(defclause in
  field                 [:ref ::EqualityFilterFieldArg]
  value-or-field        [:ref ::EqualityComparable]
  more-values-or-fields (rest [:ref ::EqualityComparable]))

(defclause not-in
  field                 [:ref ::EqualityFilterFieldArg]
  value-or-field        [:ref ::EqualityComparable]
  more-values-or-fields (rest [:ref ::EqualityComparable]))

(mr/def ::OrderedFilterFieldArg
  [:schema
   {:decode/normalize #'normalize-raw-positive-int-to-field-ref}
   [:ref ::OrderComparable]])

(defclause <,  field [:ref ::OrderedFilterFieldArg], value-or-field [:ref ::OrderComparable])
(defclause >,  field [:ref ::OrderedFilterFieldArg], value-or-field [:ref ::OrderComparable])
(defclause <=, field [:ref ::OrderedFilterFieldArg], value-or-field [:ref ::OrderComparable])
(defclause >=, field [:ref ::OrderedFilterFieldArg], value-or-field [:ref ::OrderComparable])

(defn- replace-relative-date-filters
  "Replaces broken relative date filter clauses with `:relative-time-interval` calls.

  Previously we generated a complex expression for relative date filters with an offset on the FE. It turned out that
  the expression was wrong by 1 offset unit, e.g. if the offset was by months, it was wrong by 1 month. To fix the issue
  we introduced a new `:relative-time-interval` function that served several purposes. It captured the user intent
  clearly while hiding the implementation details; it also fixed the underlying expression. Here we match the old
  expression and convert it to a `:relative-time-interval` call, honoring the original user intent. See #46211 and
  #46438 for details."
  [clause]
  (lib.util.match/replace clause
    [:between
     [:+
      field
      [:interval (offset-value :guard integer?) (offset-unit :guard keyword?)]]
     [:relative-datetime
      (start-value :guard integer?)
      (start-unit :guard keyword?)]
     [:relative-datetime
      (end-value :guard integer?)
      (end-unit :guard keyword?)]]
    (let [offset-value (- offset-value)]
      (if (and (= start-unit end-unit)
               (or (and (pos? offset-value) (zero? start-value) (pos? end-value))
                   (and (neg? offset-value) (neg? start-value) (zero? end-value))))
        [:relative-time-interval
         field
         (if (neg? offset-value) start-value end-value)
         start-unit
         offset-value
         offset-unit]
        &match))))

;; :between is INCLUSIVE just like SQL !!!
(defclause* between
  [:and
   (helpers/clause
    :between
    "field" [:ref ::OrderedFilterFieldArg]
    "min"   [:ref ::OrderComparable]
    "max"   [:ref ::OrderComparable])
   [:schema
    {:decode/normalize #'replace-relative-date-filters}
    :any]])

;; SUGAR CLAUSE: This is automatically written as a pair of `:between` clauses by the `:desugar` middleware.
(defclause inside
  lat-field [:ref ::OrderedFilterFieldArg]
  lon-field [:ref ::OrderedFilterFieldArg]
  lat-max   [:ref ::OrderComparable]
  lon-min   [:ref ::OrderComparable]
  lat-min   [:ref ::OrderComparable]
  lon-max   [:ref ::OrderComparable])

;; SUGAR CLAUSES: These are rewritten as `[:= <field> nil]` and `[:not= <field> nil]` respectively
(defclause is-null,  field [:ref ::FieldOrExpressionDef])
(defclause not-null, field [:ref ::FieldOrExpressionDef])

(mr/def ::Emptyable
  "Schema for a valid is-empty or not-empty argument."
  [:or
   [:ref ::StringExpressionArg]
   [:ref ::FieldOrExpressionRef]])

;; These are rewritten as `[:or [:= <field> nil] [:= <field> ""]]` and
;; `[:and [:not= <field> nil] [:not= <field> ""]]`
(defclause is-empty  field [:ref ::Emptyable])
(defclause not-empty field [:ref ::Emptyable])

(mr/def ::StringFilterOptions
  [:map
   {:decode/normalize lib.schema.common/normalize-map}
   ;; default true
   [:case-sensitive {:optional true} :boolean]])

(doseq [clause-keyword [::starts-with ::ends-with ::contains ::does-not-contain]]
  (defmethod options-style-method (keyword (name clause-keyword)) [_tag] ::options-style.𝕨𝕚𝕝𝕕)
  (helpers/defclause clause-keyword
    [:or
     ;; Binary form
     (helpers/clause (keyword (name clause-keyword))
                     "field"           [:ref ::StringExpressionArg]
                     "string-or-field" [:ref ::StringExpressionArg]
                     "options"         [:optional [:ref ::StringFilterOptions]])
     ;; Multi-arg form
     (helpers/clause (keyword (name clause-keyword))
                     "options"                [:maybe [:ref ::StringFilterOptions]]
                     "field"                  [:ref ::StringExpressionArg]
                     "string-or-field"        [:ref ::StringExpressionArg]
                     "second-string-or-field" [:ref ::StringExpressionArg]
                     "more-strings-or-fields" [:rest [:ref ::StringExpressionArg]])]))

(mr/def ::TimeIntervalOptions
  [:map
   {:decode/normalize lib.schema.common/normalize-map}
   ;; Should we include partial results for the current day/month/etc? Defaults to `false`; set this to `true` to
   ;; include them.
   [:include-current {:optional true} :boolean]])

;; Filter subclause. Syntactic sugar for specifying a specific time interval.
;;
;; Return rows where datetime Field 100's value is in the current month
;;
;;    [:time-interval [:field 100 nil] :current :month]
;;
;; Return rows where datetime Field 100's value is in the current month, including partial results for the
;; current day
;;
;;    [:time-interval [:field 100 nil] :current :month {:include-current true}]
;;
;; SUGAR: This is automatically rewritten as a filter clause with a relative-datetime value
(defn- normalize-time-interval
  "If you specify a `:temporal-unit` for the Field inside a `:time-interval`, remove it. The unit in `:time-interval`
  takes precedence."
  [[_tag field :as clause]]
  (or (when (= (helpers/actual-clause-tag field) :field)
        (let [[_tag id-or-name field-opts] field]
          (when (:temporal-unit field-opts)
            (assoc clause 1 [:field id-or-name (not-empty (dissoc field-opts :temporal-unit))]))))
      clause))

(defclause* time-interval
  [:and
   (helpers/clause
    :time-interval
    "field"   [:ref ::FieldOrExpressionRef]
    "n"       [:or :int [:enum #:decode{:normalize #(cond-> % (string? %) keyword)} :current :last :next]]
    "unit"    [:ref ::RelativeDatetimeUnit]
    "options" [:optional [:ref ::TimeIntervalOptions]])
   [:schema
    {:decode/normalize #'normalize-time-interval}
    :any]])

(defmethod options-style-method :time-interval [_tag] ::options-style.last-unless-empty)

(defclause during
  field   [:ref ::FieldOrExpressionRef]
  value   [:or ::lib.schema.literal/date ::lib.schema.literal/datetime]
  unit    ::DateTimeUnit)

(defclause relative-time-interval
  col           [:ref ::FieldOrExpressionRef]
  value         :int
  bucket        [:ref ::RelativeDatetimeUnit]
  offset-value  :int
  offset-bucket [:ref ::RelativeDatetimeUnit])

;; A segment is a special `macro` that saves some pre-definied filter clause, e.g. [:segment 1]
;; this gets replaced by a normal Filter clause in MBQL macroexpansion
;;
;; It can also be used for GA, which looks something like `[:segment "gaid::-11"]`. GA segments aren't actually MBQL
;; segments and pass-thru to GA.
(defclause segment
  segment-id [:or ::lib.schema.id/segment ::lib.schema.common/non-blank-string])

(mr/def ::BooleanExpression
  (one-of
   ;; filters drivers must implement
   and or not = != < > <= >= between starts-with ends-with contains
    ;; SUGAR filters drivers do not need to implement
   in not-in does-not-contain inside is-empty not-empty is-null not-null relative-time-interval time-interval during))

(mr/def ::Filter
  "Schema for a valid MBQL `:filter` clause."
  [:multi
   {:error/message "valid filter expression"
    :dispatch      (fn [x]
                     (cond
                       (is-clause? datetime-functions x) :datetime
                       (is-clause? numeric-functions x)  :numeric
                       (is-clause? string-functions x)   :string
                       (is-clause? boolean-functions x)  :boolean
                       (is-clause? :value x)             :value
                       (is-clause? :segment x)           :segment
                       :else                             :else))}
   [:datetime [:ref ::DatetimeExpression]]
   [:numeric  [:ref ::NumericExpression]]
   [:string   [:ref ::StringExpression]]
   [:boolean  [:ref ::BooleanExpression]]
   [:value    [:ref ::value]]
   [:segment  [:ref ::segment]]
   [:else     [:ref ::FieldOrExpressionRef]]])

(mr/def ::CaseSubclause
  [:tuple {:error/message ":case subclause"
           :decode/normalize (fn [x]
                               (when (sequential? x)
                                 ;; in some of the weird FE e2e tests `:case` has an empty third arg (unsure why), if
                                 ;; we see extra args just drop them.
                                 (into [] (take 2) x)))}
   [:ref ::Filter]
   [:ref ::ExpressionArg]])

(mr/def ::CaseSubclauses
  [:sequential {:min 1} ::CaseSubclause])

(mr/def ::CaseOptions
  [:map
   {:decode/normalize lib.schema.common/normalize-map
    :error/message    ":case options"}
   [:default {:optional true} [:ref ::ExpressionArg]]])

(defclause case
  clauses [:ref ::CaseSubclauses], options (optional [:ref ::CaseOptions]))

(defmethod options-style-method :case [_tag] ::options-style.last-unless-empty)

;; `:if` is just an alias for `:case`
(defclause if
  clauses [:ref ::CaseSubclauses], options (optional [:ref ::CaseOptions]))

(defmethod options-style-method :if [_tag] ::options-style.last-unless-empty)

(mr/def ::NumericExpression
  "Schema for the definition of a numeric expression. All numeric expressions evaluate to numeric values."
  (one-of + - / * coalesce length floor ceil round abs power sqrt exp log case if datetime-diff integer float
          temporal-extract get-year get-quarter get-month get-week get-day get-day-of-week
          get-hour get-minute get-second
          aggregation))

(mr/def ::StringExpression
  (one-of substring trim ltrim rtrim replace lower upper concat regex-match-first coalesce case if host domain
          subdomain path month-name quarter-name day-name text split-part collate))

(mr/def ::FieldOrExpressionDef
  "Schema for anything that is accepted as a top-level expression definition, either an arithmetic expression such as a
  `:+` clause or a `:field` or `:value` clause."
  [:multi
   {:error/message ":field or :expression reference or expression"
    :dispatch      (fn [x]
                     (cond
                       (is-clause? numeric-functions x)                   :numeric
                       (number? x)                                        :number-literal
                       (is-clause? string-functions x)                    :string
                       (string? x)                                        :string-literal
                       (is-clause? boolean-functions x)                   :boolean
                       (boolean? x)                                       :boolean-literal
                       (is-clause? datetime-functions x)                  :datetime
                       #?(:clj (instance? java.time.temporal.Temporal x)) #?(:clj :temporal-literal)
                       (is-clause? :case x)                               :case
                       (is-clause? :if   x)                               :if
                       (is-clause? :offset x)                             :offset
                       (is-clause? :value x)                              :value
                       :else                                              :else))}
   [:numeric         [:ref ::NumericExpression]]
   [:number-literal  number?]
   [:string          [:ref ::StringExpression]]
   [:string-literal  string?]
   [:boolean         [:ref ::BooleanExpression]]
   [:boolean-literal boolean?]
   [:datetime        [:ref ::DatetimeExpression]]
   #?(:clj
      [:temporal-literal (lib.schema.common/instance-of-class java.time.temporal.Temporal)])
   [:case            [:ref ::case]]
   [:if              [:ref ::if]]
   [:offset          [:ref ::offset]]
   [:value           [:ref ::value]]
   [:else            [:ref ::FieldOrExpressionRef]]])

(mr/def ::AggregationArg
  "Schema for the argument to an aggregation clause like `:sum`.

  Nested aggregations are not allowed here, so we can't use `::ExpressionArg` directly. (#66199)

  Unlike `::FieldOrExpressionDef`, raw integers are treated as unwrapped `:field` clauses for backwards compatibility
  with MBQL 1 and 2, e.g.

    [:sum 1] => [:sum [:field 1 nil]]"
  [:and
   [:ref ::FieldOrExpressionDef]
   [:any
    {:decode/normalize (fn [x]
                         (if (pos-int? x)
                           [:field x nil]
                           x))}]])

;; For all of the 'normal' Aggregations below (excluding Metrics) fields are implicit Field IDs

;; cum-sum and cum-count are SUGAR because they're implemented in middleware. The clauses are swapped out with
;; `count` and `sum` aggregations respectively and summation is done in Clojure-land
(defclause count,     field (optional [:ref ::AggregationArg]))
(defclause cum-count, field (optional [:ref ::AggregationArg]))

;; technically aggregations besides count can also accept expressions as args, e.g.
;;
;;    [[:sum [:+ [:field 1 nil] [:field 2 nil]]]]
;;
;; Which is equivalent to SQL:
;;
;;    SUM(field_1 + field_2)

(defclause avg,      field-or-expression [:ref ::AggregationArg])
(defclause cum-sum,  field-or-expression [:ref ::AggregationArg])
(defclause distinct, field-or-expression [:ref ::AggregationArg])
(defclause sum,      field-or-expression [:ref ::AggregationArg])
(defclause min,      field-or-expression [:ref ::AggregationArg])
(defclause max,      field-or-expression [:ref ::AggregationArg])

(defclause distinct-where
  field-or-expression [:ref ::AggregationArg], pred [:ref ::Filter])

(defclause sum-where
  field-or-expression [:ref ::AggregationArg], pred [:ref ::Filter])

(defclause count-where
  pred [:ref ::Filter])

(defclause share
  pred [:ref ::Filter])

(defclause stddev
  field-or-expression [:ref ::AggregationArg])

(defclause var
  field-or-expression [:ref ::AggregationArg])

(defclause median
  field-or-expression [:ref ::AggregationArg])

(defclause percentile
  field-or-expression [:ref ::AggregationArg], percentile [:ref ::NumericExpressionArg])

;;; V1 (Legacy) Metrics (which lived in their own table) do not exist anymore! A V2 Metric is just a subtype of a Card.
(defclause metric
  metric-id ::lib.schema.id/card)

;; TODO (Tamas 2026-01-05): Remove this defclause once FE tests switch to using MBQL5
(defclause measure
  measure-id ::lib.schema.id/measure)

;; the following are definitions for expression aggregations, e.g.
;;
;;    [:+ [:sum [:field 10 nil]] [:sum [:field 20 nil]]]

(defn- aggregation-expression?
  "A clause is a valid aggregation if it is an aggregation clause, or it is an expression that transitively contains
  a single aggregation clause.

  (This is mostly copied from [[metabase.lib.schema.aggregation/aggregation-expression?]])"
  [x]
  (when (helpers/normalized-mbql-clause? x)
    (when-let [[tag & args] x]
      (or (lib.hierarchy/isa? tag ::lib.schema.aggregation/aggregation-clause-tag)
          ;; `:case` has the following shape [:case [[cond expr]...] default-expr?]
          ;;
          ;; `:if` is an alias for `:case`
          (if (#{:if :case} tag)
            (or (some aggregation-expression? (ffirst args))
                (some aggregation-expression? (fnext args)))
            (some aggregation-expression? args))))))

(mr/def ::UnnamedAggregation
  [:and
   [:ref ::AnyMBQLClause]
   [:fn
    {:error/message "Aggregations should contain at least one aggregation function."}
    aggregation-expression?]])

(mr/def ::AggregationOptionsOptions
  "Additional options for any aggregation clause when wrapping it in `:aggregation-options`."
  [:map
   {:error/message    ":aggregation-options options"
    :decode/normalize (fn [m]
                        (let [m (if (nil? m)
                                  {}
                                  m)]
                          (lib.schema.common/normalize-map m)))}
   ;; name to use for this aggregation in the native query instead of the default name (e.g. `count`)
   [:name         {:optional true} ::lib.schema.common/non-blank-string]
   ;; user-facing display name for this aggregation instead of the default one
   [:display-name {:optional true} ::lib.schema.common/non-blank-string]])

(defclause* aggregation-options
  [:and
   ;; this schema normalizes the MBQL 3 (?) `:named` clause to `:aggregation-options`
   [:schema
    {:decode/normalize (fn [x]
                         ;; [:named <subclase> <name>] was the MBQL 3 (?) version of `:aggregation-options`
                         ;;
                         ;; [:named <subclause> <name> {:use-as-display-name? false}] means set `:name` instead of
                         ;; `:display-name`
                         (if (= (helpers/actual-clause-tag x) :named)
                           (let [[_tag subclause display-name {:keys [use-as-display-name?], :or {use-as-display-name? true}}] x]
                             [:aggregation-options subclause {(if use-as-display-name? :display-name :name) display-name}])
                           x))}
    :any]
   ;; this schema is the schema for `:aggregation-options` itself
   (helpers/clause
    :aggregation-options
    "aggregation" [:ref ::UnnamedAggregation]
    "options"     [:ref ::AggregationOptionsOptions])])

(defmethod options-style-method :aggregation-options [_tag] ::options-style.last-always)

(mr/def ::Aggregation
  "Schema for anything that is a valid `:aggregation` clause."
  [:and
   [:multi
    {:error/message "aggregation clause or numeric expression"
     :dispatch      (fn [x]
                      (if (is-clause? #{:aggregation-options :named} x)
                        :aggregation-options
                        :unnamed-aggregation))}
    [:aggregation-options [:ref ::aggregation-options]]
    [:unnamed-aggregation [:ref ::UnnamedAggregation]]]
   [:any
    {:description      "Normalization should automatically unwrap :aggregation-options with an empty options map"
     :decode/normalize (fn [x]
                         (or (when (is-clause? :aggregation-options x)
                               (let [[_tag wrapped options] x]
                                 (when (empty? options)
                                   wrapped)))
                             x))}]])

(defn- normalize-aggregations [x]
  (let [xs (cond
             ;; handle MBQL 1/2 :aggregation which could be just a single string or keyword like
             ;;
             ;;    {:aggregation "COUNT"}
             ((some-fn simple-keyword? string?) x)
             [[x]]

             ;; anything else that is not sequential is invalid at this point.
             (not (sequential? x))
             nil

             (empty? x)
             nil

             ;; handle really messed up stuff like [:count :count] or [:rows :count]
             (and (not (sequential? (first x)))
                  (every? (some-fn simple-keyword? string?) x))
             (into []
                   (map (fn [subclause]
                          [subclause]))
                   x)

             ;; handle MBQL 2 aggregations when they are a single aggregation that is a vector, e.g.
             ;;
             ;;    {:aggregation [:sum 10]} => {:aggregation [[:sum [:field 10 nil]]]}
             (and (not (sequential? (first x)))
                  ((some-fn simple-keyword? string?) (first x)))
             [x]

             :else
             x)]
    ;; {:aggregation "ROWS"} was the default in MBQL 1 + 2 for when we had no aggregations... I (Cam) removed it in
    ;; MBQL 3. Strip these out.
    (not-empty
     (remove
      #(= (helpers/actual-clause-tag %) :rows)
      xs))))

(mr/def ::Aggregations
  [:sequential
   {:min              1
    :decode/normalize #'normalize-aggregations}
   [:ref ::Aggregation]])

;; order-by is just a series of `[<direction> <field>]` clauses like
;;
;;    {:order-by [[:asc [:field 1 nil]], [:desc [:field 2 nil]]]}
;;
;; Field ID is implicit in these clauses

(defclause asc,  field [:ref ::Reference])
(defclause desc, field [:ref ::Reference])

(mr/def ::OrderBy
  "Schema for an `order-by` clause subclause."
  [:schema
   {:decode/normalize (fn [subclause]
                        ;; handle MBQL 2 clauses which looked like [10 "desc"] or [10 "descending"]
                        (when (sequential? subclause)
                          (let [[x y] subclause
                                [x y] (if (and ((some-fn simple-keyword? string?) y)
                                               (#{:asc :desc :ascending :descending} (helpers/normalize-keyword y)))
                                        [(case (helpers/normalize-keyword y)
                                           (:asc :ascending) :asc
                                           (:desc :descending) :desc)
                                         x]
                                        [x y])]
                            ;; handle unwrapped raw Field IDs
                            [x (if (pos-int? y)
                                 [:field y nil]
                                 y)])))}
   (one-of asc desc)])

(mr/def ::TemplateTagType
  "Schema for valid values of template tag `:type`."
  [:enum {:decode/normalize keyword} :snippet :card :dimension :number :text :date :table])

(mr/def ::TemplateTag.Common
  "Things required by all template tag types."
  [:map
   {:decode/normalize lib.schema.common/normalize-map}
   [:type         [:ref ::TemplateTagType]]
   [:name         ::lib.schema.common/non-blank-string]
   [:display-name ::lib.schema.common/non-blank-string]
   ;; TODO -- `:id` is actually 100% required but we have a lot of tests that don't specify it because this constraint
   ;; wasn't previously enforced; we need to go in and fix those tests and make this non-optional
   [:id {:optional true} [:ref ::lib.schema.template-tag/id]]])

;; Example:
;;
;;    {:id           "c2fc7310-44eb-4f21-c3a0-63806ffb7ddd"
;;     :name         "snippet: select"
;;     :display-name "Snippet: select"
;;     :type         :snippet
;;     :snippet-name "select"
;;     :snippet-id   1}
(mr/def ::TemplateTag.Snippet
  "Schema for a native query snippet template tag."
  [:merge
   ::TemplateTag.Common
   [:map
    [:type         [:= {:decode/normalize helpers/normalize-keyword} :snippet]]
    [:snippet-name ::lib.schema.common/non-blank-string]
    [:snippet-id   ::lib.schema.id/snippet]
    ;; database to which this Snippet belongs. Doesn't always seen to be specified.
    [:database {:optional true} ::lib.schema.id/database]]])

;; Example:
;;
;;    {:id           "fc5e14d9-7d14-67af-66b2-b2a6e25afeaf"
;;     :name         "#1635"
;;     :display-name "#1635"
;;     :type         :card
;;     :card-id      1635}
(mr/def ::TemplateTag.SourceQuery
  "Schema for a source query template tag."
  [:merge
   ::TemplateTag.Common
   [:map
    [:type    [:= {:decode/normalize helpers/normalize-keyword} :card]]
    [:card-id ::lib.schema.id/card]]])

;; Example:
;;
;;    {:id           "fc5e14d9-7d14-67af-66b2-b2a6e25afeaf"
;;     :name         "#1635"
;;     :display-name "#1635"
;;     :type         :table
;;     :table-id     2}
(mr/def ::TemplateTag.SourceTable
  "Schema for a source query template tag."
  [:and
   [:merge
    ::TemplateTag.Common
    [:map
     [:type                  [:= {:decode/normalize helpers/normalize-keyword} :table]]
     [:table-id              {:optional true} ::lib.schema.id/table]
     [:alias                 {:optional true} :string]
     [:partition-field-id    {:optional true} ::lib.schema.id/field]
     [:partition-field-name  {:optional true} :string]
     [:partition-field-type  {:optional true} [:enum :type/Number :type/Date :type/DateTime]]
     [:partition-field-start {:optional true} :any]
     [:partition-field-stop  {:optional true} :any]]]
   [:fn
    {:error/message ":table template tags must have either a :table-id or an :alias"}
    (fn [m]
      (or (:table-id m)
          (:alias m)))]])

(mr/def ::TemplateTag.Value.Common
  "Stuff shared between the Field filter and raw value template tag schemas."
  [:merge
   ::TemplateTag.Common
   [:map
    ;; default value for this parameter
    [:default  {:optional true} :any]
    ;; whether or not a value for this parameter is required in order to run the query
    [:required {:optional true} :boolean]]])

;; Example:
;;
;;    {:id           "c20851c7-8a80-0ffa-8a99-ae636f0e9539"
;;     :name         "date"
;;     :display-name "Date"
;;     :type         :dimension,
;;     :dimension    [:field 4 nil]
;;     :widget-type  :date/all-options}
(mr/def ::TemplateTag.FieldFilter.Options
  [:map-of
   {:decode/normalize (fn [m]
                        (when (map? m)
                          (update-keys m lib.schema.common/normalize-keyword)))}
   :keyword
   :any])

(mr/def ::TemplateTag.FieldFilter
  "Schema for a field filter template tag."
  [:merge
   ::TemplateTag.Value.Common
   [:map
    [:type      [:= {:decode/normalize helpers/normalize-keyword} :dimension]]
    [:dimension [:ref ::field]]
    [:alias     {:optional true} :string]

    [:widget-type
     {:default :category}
     [:ref
      {:description
       "which type of widget the frontend should show for this Field Filter; this also affects which parameter types
  are allowed to be specified for it."}
      ::WidgetType]]

    [:options
     {:optional    true
      :description "optional map to be appended to filter clause"}
     [:maybe [:ref ::TemplateTag.FieldFilter.Options]]]]])

;; Example:
;;
;;   {:id "cd35d6dc-285b-4944-8a83-21e4c38d6584",
;;    :type "temporal-unit",
;;    :name "unit",
;;    :display-name "Unit"}
(mr/def ::TemplateTag.TemporalUnit
  "Schema for a temporal unit template tag."
  [:merge
   ::TemplateTag.Value.Common
   [:map
    [:type      [:= {:decode/normalize helpers/normalize-keyword} :temporal-unit]]
    [:dimension [:ref ::field]]
    [:alias     {:optional true} :string]]])

;; Example:
;;
;;    {:id           "35f1ecd4-d622-6d14-54be-750c498043cb"
;;     :name         "id"
;;     :display-name "Id"
;;     :type         :number
;;     :required     true
;;     :default      "1"}
(mr/def ::TemplateTag.RawValue
  "Schema for a raw value template tag."
  [:merge
   ::TemplateTag.Value.Common
   [:map
    [:type
     [:ref
      {:description
       "`:type` is used be the FE to determine which type of widget to display for the template tag, and to determine
  which types of parameters are allowed to be passed in for this template tag."}]
     ::lib.schema.template-tag/raw-value.type]]])

(mr/def ::TemplateTag
  "Schema for a template tag as specified in a native query. There are four types of template tags, differentiated by
  `:type`.

  Template tags are used to specify {{placeholders}} in native queries that are replaced with some sort of value when
  the query itself runs. There are four basic types of template tag for native queries:

  1. Field filters, which are used like

         SELECT * FROM table WHERE {{field_filter}}

     These reference specific Fields and are replaced with entire conditions, e.g. `some_field > 1000`

  2. Raw values, which are used like

         SELECT * FROM table WHERE my_field = {{x}}

     These are replaced with raw values.

   3. Native query snippets, which might be used like

          SELECT * FROM ({{snippet: orders}}) source

      These are replaced with `NativeQuerySnippet`s from the application database.

   4. Source query Card IDs, which are used like

          SELECT * FROM ({{#123}}) source

      These are replaced with the query from the Card with that ID.

  Field filters and raw values usually have their value specified by `:parameters`."
  [:multi
   {:dispatch (comp keyword (some-fn :type #(get % "type")))}
   [:dimension     [:ref ::TemplateTag.FieldFilter]]
   [:snippet       [:ref ::TemplateTag.Snippet]]
   [:card          [:ref ::TemplateTag.SourceQuery]]
   [:table         [:ref ::TemplateTag.SourceTable]]
   [:temporal-unit [:ref ::TemplateTag.TemporalUnit]]
   [::mc/default   [:ref ::TemplateTag.RawValue]]])

(mr/def ::TemplateTagMap
  "Schema for the `:template-tags` map passed in as part of a native query.

  Map of template tag name -> template tag definition"
  [:and
   [:map-of
    {:decode/normalize (fn [m]
                         (when (and (map? m)
                                    (seq m))
                           (update-keys m (fn [k]
                                            (cond-> k
                                              (keyword? k) u/qualified-name)))))}
    ::lib.schema.common/non-blank-string
    [:ref ::TemplateTag]]
   [:ref ::lib.schema.template-tag/template-tag-map.validate-names]])

(defn- remove-empty-keys [m {:keys [non-empty-keys non-nil-keys]}]
  (when (map? m)
    (reduce-kv
     (fn [m k v]
       (if (or (and (non-empty-keys k)
                    (empty? v))
               (and (non-nil-keys k)
                    (nil? v)))
         (dissoc m k)
         m))
     m
     m)))

(defn- remove-empty-keys-from-native-inner-query [m]
  (when (map? m)
    (let [m (lib.schema.common/normalize-map m)]
      (remove-empty-keys m {:non-empty-keys #{:template-tags}
                            :non-nil-keys   #{:collection}}))))

(mr/def ::NativeQuery.Common
  [:and
   [:map
    [:template-tags {:optional true} [:ref ::TemplateTagMap]]
    ;; collection (table) this query should run against. Needed for MongoDB
    [:collection    {:optional true} [:maybe ::lib.schema.common/non-blank-string]]]
   (lib.schema.common/disallowed-keys
    {:lib/type     "Legacy MBQL inner queries must not have :lib/type"
     :type         "An inner query must not include :type, this will cause us to mix it up with an outer query"
     :source-table ":source-table is only allowed in MBQL inner queries."
     :fields       ":fields is only allowed in MBQL inner queries."})])

(mr/def ::NativeQuery
  "Schema for a valid, normalized native [inner] query."
  [:merge
   {:decode/normalize #'remove-empty-keys-from-native-inner-query}
   ::NativeQuery.Common
   [:map
    [:query :some]]])

(mr/def ::NativeSourceQuery
  [:merge
   {:decode/normalize #'remove-empty-keys-from-native-inner-query}
   ::NativeQuery.Common
   [:map
    [:native :some]]])

(mr/def ::SourceQuery
  "Schema for a valid value for a `:source-query`."
  [:multi
   {:dispatch (fn [x]
                (if ((every-pred map? :native) x)
                  :native
                  :mbql))}
   ;; when using native queries as source queries the schema is exactly the same except use `:native` in place of
   ;; `:query` for reasons I do not fully remember (perhaps to make it easier to differentiate them from MBQL source
   ;; queries).
   [:native [:ref ::NativeSourceQuery]]
   [:mbql   [:ref ::MBQLQuery]]])

(defn- normalize-legacy-column
  "Normalize legacy column metadata when using [[metabase.lib.normalize/normalize]]."
  [m]
  (when (map? m)
    (-> m
        lib.schema.common/normalize-map-no-kebab-case
        ;; remove deprecated `:ident` key.
        (dissoc :ident)
        ;; set `display_name` to `name` if it's unset.
        (as-> $m (cond-> $m
                   (and (:name $m)
                        (not (contains? $m :display_name)))
                   (assoc :display_name (:name $m)))))))

(mr/def ::legacy-column-metadata.binning-info
  [:and
   [:map
    {:decode/normalize (fn [m]
                         (when (map? m)
                           (let [m (lib.schema.common/normalize-map-no-kebab-case m)]
                             (cond-> m
                               (and (:binning_strategy m)
                                    (not (:strategy m)))
                               (assoc :strategy (:binning_strategy m))))))}
    [:strategy         [:ref ::lib.schema.binning/strategy]]
    [:binning_strategy {:optional true} [:ref ::lib.schema.binning/strategy]]
    [:bin_width        {:optional true} [:ref ::lib.schema.binning/bin-width]]
    [:num_bins         {:optional true} [:ref ::lib.schema.binning/num-bins]]]
   [:fn
    {:error/message "bin_width is a required key when strategy is bin-width"}
    (fn [m]
      (if (= (:strategy m) :bin-width)
        (contains? m :bin_width)
        true))]
   [:fn
    {:error/message "num_bins is a required key when strategy is num-bins"}
    (fn [m]
      (if (= (:strategy m) :num-bins)
        (contains? m :num_bins)
        true))]
   [:fn
    {:error/message    "binning_strategy, if present, must be equal to strategy"
     :decode/normalize (fn [m]
                         (cond-> m
                           (:binning_strategy m)
                           (assoc :binning_strategy (:strategy m))))}
    (fn [m]
      (if (:binning_strategy m)
        (= (:binning_strategy m) (:strategy m))
        true))]])

(defn- legacy-column-metadata-qualified-keys-schema
  "In 56+ legacy column metadata can optionally include qualified keys from Lib-style metadata. Walk the Lib column
  metadata schema and build a `:map` schema out of those keys."
  []
  (let [schema          (mr/resolve-schema ::lib.schema.metadata/column)
        find-map-schema (fn find-map-schema [schema]
                          (if (= (mc/type schema) :map)
                            schema
                            (some find-map-schema (mc/children schema))))
        map-schema      (find-map-schema schema)]
    (into [:map]
          (keep (fn [[k opts schema]]
                  (when (qualified-keyword? k)
                    [k (assoc opts :optional true) schema])))
          (mc/children map-schema))))

;;; TODO (Cam 10/20/25) -- it would be nice to come up with a way to automatically rebuild this if
;;; `::lib.schema.metadata/column` changes
(mr/def ::legacy-column-metadata.qualified-keys
  (legacy-column-metadata-qualified-keys-schema))

(mr/def ::legacy-column-metadata
  "Schema for a single legacy metadata column. This is the pre-Lib equivalent of
  `:metabase.lib.schema.metadata/column`."
  [:and
   [:merge
    [:map
     ;; this schema is allowed for Card `result_metadata` in Lib so `:decode/normalize` is used for those Lib use cases.
     {:decode/normalize #'normalize-legacy-column}
     [:base_type          {:default :type/*} ::lib.schema.common/base-type]
     [:display_name       :string]
     [:name               :string]
     [:description        {:optional true} [:maybe :string]]
     [:binning_info       {:optional true} [:maybe [:ref ::legacy-column-metadata.binning-info]]]
     [:effective_type     {:optional true} ::lib.schema.common/base-type]
     [:converted_timezone {:optional true} [:maybe [:ref ::lib.schema.expression.temporal/timezone-id]]]
     [:field_ref          {:optional true} [:maybe [:ref ::Reference]]]
     ;; Fingerprint is required in order to use BINNING
     [:fingerprint        {:optional true} [:maybe [:ref ::lib.schema.metadata.fingerprint/fingerprint]]]
     [:id                 {:optional true} [:maybe ::lib.schema.id/field]]
     ;; name is allowed to be empty in some databases like SQL Server.
     [:semantic_type      {:optional true} [:maybe ::lib.schema.common/semantic-or-relation-type]]
     [:source             {:optional true} [:maybe [:ref ::lib.schema.metadata/column.legacy-source]]]
     [:unit               {:optional true} [:maybe [:ref ::lib.schema.temporal-bucketing/unit]]]
     [:visibility_type    {:optional true} [:maybe [:ref ::lib.schema.metadata/column.visibility-type]]]]
    [:ref ::legacy-column-metadata.qualified-keys]]
   (lib.schema.common/disallowed-keys
    {:lib/type          "Legacy results metadata should not have :lib/type, use :metabase.lib.schema.metadata/column for Lib metadata"
     :model/inner_ident ":model/inner_ident is deprecated"})
   (letfn [(disallowed-key? [k]
             (or (not (keyword? k))
                 (let [disallowed-char (if (qualified-keyword? k)
                                         "_"
                                         "-")]
                   (str/includes? (str k) disallowed-char))))]
     [:fn
      {:error/message "legacy source query metadata should use snake_case keys (except for namespaced lib keys, which should use kebab-case)"
       :error/fn      (fn [{m :value} _]
                        (str "legacy source query metadata should use snake_case keys (except for namespaced lib keys, which should use kebab-case), got: "
                             (when (map? m)
                               (into #{} (filter disallowed-key?) (keys m)))))}
      (fn [m]
        (and (map? m)
             (every? (complement disallowed-key?) (keys m))))])])

(def source-table-card-id-regex
  "Pattern that matches `card__id` strings that can be used as the `:source-table` of MBQL queries."
  #"^card__[1-9]\d*$")

(mr/def ::SourceTable
  "Schema for a valid value for the `:source-table` clause of an MBQL query."
  [:or
   ::lib.schema.id/table
   [:re
    {:error/message "'card__<id>' string Table ID"
     :description   "`card__<id>` string Table ID"}
    source-table-card-id-regex]])

(mr/def ::JoinFields
  [:or
   {:error/message "Valid join `:fields`: `:all`, `:none`, or a sequence of `:field` clauses that have `:join-alias`."}
   [:enum {:decode/normalize #(cond-> % (string? %) keyword)} :all :none]
   [:ref ::Fields]])

(mr/def ::Join
  "Perform the equivalent of a SQL `JOIN` with another Table or nested `:source-query`. JOINs are either explicitly
  specified in the incoming query, or implicitly generated when one uses a `:field` clause with `:source-field`.

  In the top-level query, you can reference Fields from the joined table or nested query by including `:source-field`
  in the `:field` options (known as implicit joins); for explicit joins, you *must* specify `:join-alias` yourself; in
  the `:field` options, e.g.

    ;; for joins against other Tables/MBQL source queries
    [:field 1 {:join-alias \"my_join_alias\"}]

    ;; for joins against native queries
    [:field \"my_field\" {:base-type :field/Integer, :join-alias \"my_join_alias\"}]"
  [:and
   [:map
    {:decode/normalize lib.schema.common/normalize-map}
    [:source-table
     {:optional true
      :description "*What* to JOIN. Self-joins can be done by using the same `:source-table` as in the query where
  this is specified. YOU MUST SUPPLY EITHER `:source-table` OR `:source-query`, BUT NOT BOTH!"}
     [:ref ::SourceTable]]

    [:source-query {:optional true} [:ref ::SourceQuery]]

    [:condition
     {:description
      "The condition on which to JOIN. Can be anything that is a valid `:filter` clause. For automatically-generated
  JOINs this is usually something like

    [:= <source-table-fk-field> [:field <dest-table-pk-field> {:join-alias <join-table-alias>}]]"}
     [:ref ::Filter]]

    [:strategy
     {:optional true
      :description "Defaults to `:left-join`; used for all automatically-generated JOINs

  Driver implementations: this is guaranteed to be present after pre-processing."}
     [:ref ::lib.schema.join/strategy]]

    [:fields
     {:optional true
      :description
      "The Fields from this join to include in parent-level results. This can be either `:none`, `:all`, or a sequence
  of `:field` clauses.

  * `:none`: no Fields from the joined table or nested query are included (unless indirectly included by breakouts or
     other clauses). This is the default, and what is used for automatically-generated joins.

  * `:all`: will include all of the Field from the joined table or query

  * a sequence of Field clauses: include only the Fields specified. Valid clauses are the same as the top-level
    `:fields` clause. This should be non-empty and all elements should be distinct. The normalizer will automatically
    remove duplicate fields for you, and replace empty clauses with `:none`.

  Driver implementations: you can ignore this clause. Relevant fields will be added to top-level `:fields` clause with
  appropriate aliases."}
     [:ref ::JoinFields]]

    [:alias
     {:optional true
      :description
      "The name used to alias the joined table or query. This is usually generated automatically and generally looks
  like `table__via__field`. You can specify this yourself if you need to reference a joined field with a `:join-alias`
  in the options.

  Driver implementations: This is guaranteed to be present after pre-processing."}
     ::lib.schema.join/alias]

    [:fk-field-id
     {:optional true
      :description "Mostly used only internally. When a join is implicitly generated via a `:field` clause with
  `:source-field`, the ID of the foreign key field in the source Table will be recorded here. This information is used
  to add `fk_field_id` information to the `:cols` in the query results, and also for drill-thru. When generating
  explicit joins by hand you can usually omit this information, altho it doesn't hurt to include it if you know it.

  Don't set this information yourself. It will have no effect."}
     [:maybe ::lib.schema.id/field]]

    [:source-metadata
     {:optional true
      :description "Metadata about the source query being used, if pulled in from a Card via the
  `:source-table \"card__id\"` syntax. added automatically by the `resolve-card-id-source-tables` middleware."}
     [:maybe [:sequential [:ref ::legacy-column-metadata]]]]]
   ;; additional constraints
   [:fn
    {:error/message "Joins must have either a `source-table` or `source-query`, but not both."}
    (every-pred
     (some-fn :source-table :source-query)
     (complement (every-pred :source-table :source-query)))]
   (lib.schema.common/disallowed-keys
    {:type         "A join should not include :type"
     :filter       "A join should not have top-level 'inner' query keys like :filter"
     :breakout     "A join should not have top-level 'inner' query keys like :breakout"
     :aggregation "A join should not have top-level 'inner' query keys like :aggregation"
     :expressions  "A join should not have top-level 'inner' query keys like :expressions"
     :joins        "A join should not have top-level 'inner' query keys like :joins"
     :ident        ":ident is deprecated and should not be included in joins"})])

(mr/def ::Joins
  "Schema for a valid sequence of `Join`s. Must be a non-empty sequence, and `:alias`, if specified, must be unique."
  [:and
   (helpers/non-empty [:sequential [:ref ::Join]])
   [:fn
    {:error/message "All join aliases must be unique."}
    #(helpers/empty-or-distinct? (filter some? (map :alias %)))]])

(mr/def ::Fields
  [:schema
   {:error/message "Distinct, non-empty sequence of Field clauses"}
   (helpers/distinct [:sequential {:min 1} [:ref ::FieldOrExpressionRef]])])

(mr/def ::OrderBys
  (helpers/distinct [:sequential {:min 1} [:ref ::OrderBy]]))

(mr/def ::Breakouts
  [:sequential
   {:min 1
    :decode/normalize (fn [x]
                        ;; handle MBQL 2 (?) where we had one single breakout e.g.
                        ;;
                        ;;    {:breakout 10}            => {:breakout [[:field 10 nil]]}
                        ;;    {:breakout [:field-id 3]} => {:breakout [[:field 10 nil]]}
                        (cond
                          (pos-int? x)
                          [[:field x nil]]

                          (and (sequential? x)
                               ((some-fn simple-keyword? string?) (first x)))
                          [x]

                          :else
                          x))}
   [:ref ::FieldOrExpressionRef]])

(defn- remove-empty-keys-from-mbql-inner-query [query]
  (remove-empty-keys query {:non-empty-keys #{:aggregation :breakout :expressions :fields :filter :order-by :joins}
                            :non-nil-keys   #{:limit}}))

(mr/def ::Expressions
  [:map-of
   [:ref ::ExpressionName]
   [:ref ::FieldOrExpressionDef]])

(mr/def ::RemoveFieldRefsFromFieldsAlreadyInBreakout
  (letfn [(without-temporal-unit [a-ref]
            (if (= (helpers/actual-clause-tag a-ref) :field)
              (let [[_tag id-or-name opts] a-ref]
                [:field id-or-name (not-empty (dissoc opts :temporal-unit))])
              a-ref))]
    [:fn
     {:error/message    "Fields specified in `:breakout` should not be specified in `:fields`; this is implied."
      :decode/normalize (fn [{:keys [breakout fields], :as query}]
                          (let [breakout-fields (into #{} (map without-temporal-unit) breakout)]
                            (u/assoc-dissoc query :fields (not-empty
                                                           (into []
                                                                 (remove (fn [a-ref]
                                                                           (breakout-fields (without-temporal-unit a-ref))))
                                                                 fields)))))}
     (fn [{:keys [breakout fields]}]
       (empty? (set/intersection
                (into #{} (map without-temporal-unit) breakout)
                (into #{} (map without-temporal-unit) fields))))]))

(mr/def ::MBQLQuery
  [:and
   [:map
    {:decode/normalize lib.schema.common/normalize-map}
    [:source-query {:optional true} [:ref ::SourceQuery]]
    [:source-table {:optional true} [:ref ::SourceTable]]
    [:aggregation  {:optional true} [:ref ::Aggregations]]
    [:breakout     {:optional true} [:ref ::Breakouts]]
    [:expressions  {:optional true} [:ref ::Expressions]]
    [:fields       {:optional true} [:ref ::Fields]]
    [:filter       {:optional true} [:ref ::Filter]]
    [:limit        {:optional true} ::lib.schema.common/int-greater-than-or-equal-to-zero]
    [:order-by     {:optional true} [:ref ::OrderBys]]
    [:page         {:optional true} [:ref :metabase.lib.schema/page]]
    [:joins        {:optional true} [:ref ::Joins]]
    [:source-metadata
     {:optional    true
      :description "Info about the columns of the source query. Added in automatically by middleware. This metadata is
  primarily used to let power things like binning when used with Field Literals instead of normal Fields."}
     [:maybe [:sequential [:ref ::legacy-column-metadata]]]]]
   ;; remove empty query keys; this is done AFTER the map schema above because normalizing things like
   ;; `::Aggregations` will remove things like the `ROWS` aggregation which was removed in MBQL 4.
   ;; e.g. the schema above will normalize
   ;;
   ;;    {:aggregation "ROWS"} => {:aggregation nil}
   ;;
   ;; but not actually remove that key; so we need this second pass to remove it.
   [:schema
    {:decode/normalize #'remove-empty-keys-from-mbql-inner-query}
    :map]
   ;;
   ;; CONSTRAINTS
   ;;
   [:fn
    {:error/message "Query must specify either `:source-table` or `:source-query`, but not both."}
    (fn [query]
      (= 1 (count (select-keys query [:source-query :source-table]))))]
   [:ref ::RemoveFieldRefsFromFieldsAlreadyInBreakout]
   ;; `disallowed-keys` will remove these keys if we see them automatically during normalization.
   (lib.schema.common/disallowed-keys
    {:lib/type           "Legacy MBQL inner queries must not have :lib/type"
     :type               "An inner query must not include :type, this will cause us to mix it up with an outer query"
     :aggregation-idents ":aggregation-idents is deprecated and should not be used"
     :breakout-idents    ":breakout-idents is deprecated and should not be used"
     :expression-idents  ":expression-idents is deprecated and should not be used"})])

(mr/def ::WidgetType
  "Schema for valid values of `:widget-type` for a `::TemplateTag.FieldFilter`."
  [:ref :metabase.lib.schema.parameter/widget-type])

;; this is the reference like [:template-tag <whatever>], not the [[TemplateTag]] schema for when it's declared in
;; `:template-tags`
(defclause template-tag
  tag-name [:or
            ::lib.schema.common/non-blank-string
            [:map
             [:id ::lib.schema.common/non-blank-string]]])

(defclause* dimension
  [:and
   [:fn {:error/message "must be a `:dimension` clause"} (partial helpers/is-clause? :dimension)]
   [:catn
    [:tag [:= :dimension]]
    [:target [:schema [:or [:ref ::FieldOrExpressionRef] [:ref ::template-tag]]]]
    [:options [:? [:maybe [:map {:error/message "dimension options"} [:stage-number {:optional true} :int]]]]]]])

(defmethod options-style-method :dimension [_tag] ::options-style.last-unless-empty)

(defclause variable
  target [:ref ::template-tag])

;; To the reader: yes, this seems sort of hacky, but one of the goals of the Nested Query Initiative™ was to minimize
;; if not completely eliminate any changes to the frontend. After experimenting with several possible ways to do this
;; implementation seemed simplest and best met the goal. Luckily this is the only place this "magic number" is defined
;; and the entire frontend can remain blissfully unaware of its value.

(mr/def ::DatabaseID
  "Schema for a valid `:database` ID, in the top-level 'outer' query. Either a positive integer (referring to an
  actual Database), or the saved questions virtual ID, which is a placeholder used for queries using the
  `:source-table \"card__id\"` shorthand for a source query resolved by middleware (since clients might not know the
  actual DB for that source query.)"
  [:or
   {:error/message "valid Database ID"}
   [:ref ::lib.schema.id/saved-questions-virtual-database]
   [:ref ::lib.schema.id/database]])

;;; Make sure we have the combo of query `:type` and `:native`/`:query`
(mr/def ::CheckKeysForQueryType
  [:and
   [:fn
    {:error/message "Query must specify at most one of `:native` or `:query`, but not both."}
    (every-pred (some-fn :native :query)
                (complement (every-pred :native :query)))]
   [:fn
    {:error/message "Native queries must not specify `:query`; MBQL queries must not specify `:native`."}
    (fn [{native :native, mbql :query, query-type :type}]
      (case query-type
        :native (not mbql)
        :query  (not native)
        false))]])

(mr/def ::CheckQueryDoesNotHaveSourceMetadata
  "`:source-metadata` is added to queries when `card__id` source queries are resolved. It contains info about the
  columns in the source query.

  Where this is added was changed in Metabase 0.33.0 -- previously, when `card__id` source queries were resolved, the
  middleware would add `:source-metadata` to the top-level; to support joins against source queries, this has been
  changed so it is always added at the same level the resolved `:source-query` is added.

  This should automatically be fixed by `normalize`; if we encounter it, it means some middleware is not functioning
  properly."
  [:fn
   {:error/message "`:source-metadata` should be added in the same level as `:source-query` (i.e., the 'inner' MBQL query.)"
    :decode/normalize (fn [m]
                        (when (map? m)
                          (cond-> m
                            (:source-metadata m)
                            (-> (dissoc :source-metadata)
                                (assoc-in [:query :source-metadata] (:source-metadata m))))))}
   (complement :source-metadata)])

(defn- normalize-query [query]
  (when (map? query)
    (let [query (lib.schema.common/normalize-map query)]
      (reduce-kv
       (fn [m k v]
         ;; remove `:parameters` which is not allowed to be nil/empty
         (if (and (= k :parameters)
                  (empty? v))
           (dissoc m :parameters)
           m))
       query
       query))))

(mr/def ::Query
  [:and
   [:map
    {:decode/normalize #'normalize-query}]
   ;; need to move source metadata to the correct location FIRST so it gets normalized by the schema below
   [:ref ::CheckQueryDoesNotHaveSourceMetadata]
   [:map
    [:database   {:optional true} ::DatabaseID]

    [:type
     [:enum
      {:decode/normalize helpers/normalize-keyword
       :description "Type of query. `:query` = MBQL; `:native` = native."}
      :query :native]]

    [:native     {:optional true} [:ref ::NativeQuery]]
    [:query      {:optional true} [:ref ::MBQLQuery]]
    [:parameters {:optional true} [:maybe [:ref ::lib.schema.parameter/parameters]]]
    ;;
    ;; OPTIONS
    ;;
    ;; These keys are used to tweak behavior of the Query Processor.
    ;;
    [:settings    {:optional true} [:maybe [:ref ::lib.schema.settings/settings]]]
    [:constraints {:optional true} [:maybe [:ref ::lib.schema.constraints/constraints]]]
    [:middleware  {:optional true} [:maybe [:ref ::lib.schema.middleware-options/middleware-options]]]
    ;;
    ;; INFO
    ;;
    [:info
     {:optional true
      :description "Used when recording info about this run in the QueryExecution log; things like context query was
  ran in and User who ran it."}
     [:maybe [:ref ::lib.schema.info/info]]]
    ;;
    ;; ACTIONS
    ;;
    ;; This stuff is only used for Actions.
    [:create-row {:optional true} [:maybe [:ref ::lib.schema.actions/row]]]
    [:update-row {:optional true} [:maybe [:ref ::lib.schema.actions/row]]]]
   ;;
   ;; CONSTRAINTS
   [:ref ::CheckKeysForQueryType]
   (lib.schema.common/disallowed-keys
    {:lib/type     "Legacy MBQL queries must not have :lib/type"
     :source-table "An outer query must not include inner-query keys like :source-table; this might cause us to confuse it with an inner query"
     :source-query "An outer query must not include inner-query keys like :source-query; this might cause us to confuse it with an inner query"
     :stages       "Legacy MBQL queries cannot have :stages; use :query or :native instead"})])
