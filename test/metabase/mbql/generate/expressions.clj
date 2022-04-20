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

(defn numeric-expression-generator [arg-generator]
  (let [arg-generator (gens/one-of [arg-generator
                                    gens/int
                                    (gens/double* {:infinite? false, :NaN? false})
                                    ;; TODO -- BigInteger or BigDecimal?
                                    (gen/delay (numeric-expression-generator arg-generator))])]
    (gens/one-of [
                  ;; TODO -- these are all actually 2 or more args
                  (binary-expression-generator :+ arg-generator arg-generator)
                  (binary-expression-generator :- arg-generator arg-generator)
                  (binary-expression-generator :/ arg-generator arg-generator)
                  (binary-expression-generator :* arg-generator arg-generator)
                  (unary-expression-generator :floor arg-generator)
                  (unary-expression-generator :ceil arg-generator)
                  (unary-expression-generator :round arg-generator)
                  (unary-expression-generator :abs arg-generator)
                  ;; `:advanced-math-expressions`
                  (binary-expression-generator :power arg-generator arg-generator)
                  (unary-expression-generator :sqrt arg-generator)
                  (unary-expression-generator :exp arg-generator)
                  (unary-expression-generator :log arg-generator)
                  ;; TODO
                  #_coalesce
                  #_case])))

;; TODO -- string expressions.

(defn expressions-map-generator [field-generator]
  (let [numeric-field-generator      (gen.data/numeric-field-generator field-generator)
        numeric-expression-generator (numeric-expression-generator numeric-field-generator)]
    (gens/map (gens/such-that seq gens/string 1000) numeric-expression-generator)))
