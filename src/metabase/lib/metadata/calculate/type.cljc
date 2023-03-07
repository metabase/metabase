(ns metabase.lib.metadata.calculate.type
  "Logic for inferring the base type of an MBQL expression."
  (:require
   [malli.core :as mc]
   [metabase.lib.dispatch :as lib.dispatch]
   [metabase.lib.metadata.calculate.resolve :as calculate.resolve]
   [metabase.lib.schema :as lib.schema]
   [metabase.lib.schema.expression :as lib.schema.expression]
   [metabase.lib.schema.ref :as lib.schema.ref]
   [metabase.shared.util.i18n :as i18n]
   [metabase.types]
   [metabase.util.malli :as mu]))

(comment metabase.types/keep-me)

(defmulti ^:private base-type*
  {:arglists '([query stage-number expr])}
  (fn [_query _stage-number expr]
    (lib.dispatch/dispatch-value expr)))

(defmethod base-type* :default
  [_query _stage-number expr]
  (or (some (fn [[expression-type-schema base-type]]
              (when (mc/validate expression-type-schema expr)
                base-type))
            [[::lib.schema.expression/boolean   :type/Boolean]
             [::lib.schema.expression/string    :type/Text]
             [::lib.schema.expression/integer   :type/Integer]
             [::lib.schema.expression/decimal   :type/Float]
             [::lib.schema.expression/number    :type/Number]
             [::lib.schema.expression/date      :type/Date]
             [::lib.schema.expression/time      :type/Time]
             [::lib.schema.expression/date-time :type/DateTime]
             [::lib.schema.expression/temporal  :type/Temporal]])
      :type/*))

(mu/defn base-type :- ::lib.schema.ref/base-type
  "Calculate the base type of a pMBQL expression."
  [query        :- ::lib.schema/query
   stage-number :- :int
   expr]
  (or
   ;; MBQL clause with a base-type in the options: return the base type directly.
   (when (and (vector? expr)
              (keyword? (first expr))
              (map? (second expr)))
     (:base-type (second expr)))
   ;; otherwise calculate the base type.
   (try
     (base-type* query stage-number expr)
     (catch #?(:clj Throwable :cljs js/Error) e
       (throw (ex-info (i18n/tru "Error calculating type of {0}: {1}" (pr-str expr) (ex-message e))
                       {:expr         expr
                        :query        query
                        :stage-number stage-number}
                       e))))))

(defmethod base-type* :metadata/field
  [_query _stage-number field-metadata]
  (:base_type field-metadata))

(defmethod base-type* :field
  [query stage-number field-ref]
  (base-type query stage-number (calculate.resolve/field-metadata query stage-number field-ref)))

(defmethod base-type* :expression
  [query stage-number [_expression _opts expression-name]]
  (base-type query stage-number (calculate.resolve/expression query stage-number expression-name)))

;;;; arithmetic expressions

(defn- infer-arithmetic-expression-base-type [query stage-number args]
  (let [base-types (mapv (partial base-type query stage-number) args)]
    (cond
      ;; if you add/subtract/multiple only integers together, you'll get an integer. If one of the args is
      ;; non-integer, you get a non-integer result.
      (every? #(isa? % :type/Integer) base-types)
      :type/Integer

      ;; if everything is a number, but not everything is an integer, this will return a non-integer real number result.
      ;; e.g. 1 + 1.5 = 2.5
      (every? #(isa? % :type/Number) base-types)
      :type/Float

      ;; if any of the args are temporal e.g. DateTime + Interval, then the result is some sort of temporal type; just
      ;; assume the result is of the same type as the first arg.
      (some #(isa? % :type/Temporal) base-types)
      (first base-types)

      ;; otherwise we don't know what type the expression is, fall back to `:type/*`
      :else
      :type/*)))

(defmethod base-type* :+
  [query stage-number [_plus _opts & args]]
  (infer-arithmetic-expression-base-type query stage-number args))

(defmethod base-type* :-
  [query stage-number [_minus _opts & args]]
  (infer-arithmetic-expression-base-type query stage-number args))

;;; we always do decimal division, even if all the args are integers, since that's how average people would expect it
;;; to work.
(defmethod base-type* :/
  [_query _stage-number _clause]
  :type/Float)

(defmethod base-type* :*
  [query stage-number [_times _opts & args]]
  (infer-arithmetic-expression-base-type query stage-number args))

;;;; aggregations

(defmethod base-type* :count
  [_query _stage-number _clause]
  :type/Integer)

(defmethod base-type* :distinct
  [_query _stage-number _clause]
  :type/Integer)

(defmethod base-type* :cum-count
  [_query _stage-number _clause]
  :type/Integer)

(defmethod base-type* :avg
  [_query _stage-number _clause]
  :type/Float)

(defmethod base-type* :sum
  [query stage-number [_clause _opts expr]]
  ;; sum of an integer will be an integer; sum of a non-integer will be a non-integer, etc.
  (base-type query stage-number expr))

(defmethod base-type* :cum-sum
  [query stage-number [_clause _opts expr]]
  (base-type query stage-number expr))

(defmethod base-type* :stddev
  [_query _stage-number _clause]
  :type/Float)

(defmethod base-type* :min
  [query stage-number [_clause _opts expr]]
  (base-type query stage-number expr))

(defmethod base-type* :max
  [query stage-number [_clause _opts expr]]
  (base-type query stage-number expr))

(defmethod base-type* :var
  [_query _stage-number _clause]
  :type/Float)

(defmethod base-type* :median
  [query stage-number [_clause _opts expr]]
  (base-type query stage-number expr))

(defmethod base-type* :percentile
  [_query _stage-number _clause]
  :type/Float)

(defmethod base-type* :share
  [_query _stage-number _clause]
  :type/Float)

(defmethod base-type* :sum-where
  [query stage-number [_clause _opts expr]]
  (base-type query stage-number expr))

(defmethod base-type* :count-where
  [_query _stage-number _clause]
  :type/Integer)

;;;; string extract expressions

;;; the type of a `:coalesce` expression is the same as the type of its first arg.
(defmethod base-type* :coalesce
  [query stage-number [_coalesce _opts expr _null-expr]]
  (base-type query stage-number expr))

(defmethod base-type* :trim
  [_query _stage-number _clause]
  :type/Text)

(defmethod base-type* :ltrim
  [_query _stage-number _clause]
  :type/Text)

(defmethod base-type* :rtrim
  [_query _stage-number _clause]
  :type/Text)

(defmethod base-type* :length
  [_query _stage-number _clause]
  :type/Integer)

(defmethod base-type* :upper
  [_query _stage-number _clause]
  :type/Text)

(defmethod base-type* :lower
  [_query _stage-number _clause]
  :type/Text)

(defmethod base-type* :substring
  [_query _stage-number _clause]
  :type/Text)

(defmethod base-type* :replace
  [_query _stage-number _clause]
  :type/Text)

(defmethod base-type* :regex-match-first
  [_query _stage-number _clause]
  :type/Text)

(defmethod base-type* :concat
  [_query _stage-number _clause]
  :type/Text)

;;;; other misc expressions

;;; the base type of a case statement is just the same as any of its constituent expressions. Ignore any `nil` values.
(defmethod base-type* :case
  [query stage-number [_case _opts pred-expr-pairs]]
  (let [exprs (filter some? (map second pred-expr-pairs))]
    (some
     (fn [expr]
       (base-type query stage-number expr))
     exprs)))

;;; base type of a datetime-add expression is the same as the base type of the expression you're adding or subtracting
;;; from
(defmethod base-type* :datetime-add
  [query stage-number [_datetime-add _opts expr _amount _unit]]
  (base-type query stage-number expr))
