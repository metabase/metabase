(ns metabase.mbql.generate.expressions
  (:require
   [clojure.spec.gen.alpha :as gen]
   [clojure.test.check.generators :as gens]
   [metabase.mbql.generate.data :as gen.data]))

(defn unary-expression-generator
  [operator arg-generator]
  (gens/let [arg arg-generator]
    [operator arg]))

(defn binary-expression-generator
  [operator lhs-generator rhs-generator]
  (gens/let [lhs lhs-generator
             rhs rhs-generator]
    [operator lhs rhs]))

(defn n-ary-expression-generator
  ([operator arg-generator]
   (n-ary-expression-generator operator arg-generator 1))
  ([operator arg-generator min-card]
  (gens/let [members (gen/vector arg-generator min-card 5)]
    (vec (concat [operator] members)))))

(defn comparison-generator
  [comparand-generator]
  (gens/let [comparison       (gen/elements [:< :> :<= :>= :=])
             first-comparand  comparand-generator
             second-comparand comparand-generator]
    [comparison first-comparand second-comparand]))

(defn case-expression-generator
  [comparand-generator value-generator]
  (let [case-pair-gen (gens/let [comparison (comparison-generator comparand-generator)
                                 value value-generator]
                        [comparison value])]
    (gens/let [case-pairs (gens/vector case-pair-gen 2 10)]
      [:case case-pairs])))

(defn numeric-expression-generator [arg-generator]
  (let [arg-generator (gens/one-of [arg-generator
                                    gens/int
                                    (gens/double* {:infinite? false, :NaN? false})
                                    ;; TODO -- BigInteger or BigDecimal?
                                    ;; TODO -- Use the proper shrinking recursion gen instead of the gen/delay
                                    (gen/delay (numeric-expression-generator arg-generator))])]
    (gens/one-of [
                  (n-ary-expression-generator :+ arg-generator 2)
                  (n-ary-expression-generator :- arg-generator 2)
                  (n-ary-expression-generator :/ arg-generator 2)
                  (n-ary-expression-generator :* arg-generator 2)
                  (unary-expression-generator :floor arg-generator)
                  (unary-expression-generator :ceil arg-generator)
                  (unary-expression-generator :round arg-generator)
                  (unary-expression-generator :abs arg-generator)
                  ;; `:advanced-math-expressions`
                  (binary-expression-generator :power arg-generator arg-generator)
                  (unary-expression-generator :sqrt arg-generator)
                  (unary-expression-generator :exp arg-generator)
                  (unary-expression-generator :log arg-generator)
                  (n-ary-expression-generator :coalesce arg-generator)
                  (case-expression-generator arg-generator arg-generator)])))

(defn string-expression-generator []
  (gens/one-of [(unary-expression-generator :trim gens/string)
                (unary-expression-generator :ltrim gens/string)
                (unary-expression-generator :rtrim gens/string)
                (unary-expression-generator :upper gens/string)
                (unary-expression-generator :lower gens/string)
                (n-ary-expression-generator :coalesce gens/string)
                ;; TODO -- replace
                (n-ary-expression-generator :concat gens/string)
                ;; TODO -- substring
                (unary-expression-generator :length gens/string)]))

(defn expressions-map-generator [field-generator]
  (let [numeric-field-generator      (gen.data/numeric-field-generator field-generator)
        numeric-expression-generator (numeric-expression-generator numeric-field-generator)]
    (gens/map (gens/such-that seq gens/string 1000) numeric-expression-generator)))
