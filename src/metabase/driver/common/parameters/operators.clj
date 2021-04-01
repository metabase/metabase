(ns metabase.driver.common.parameters.operators
  "This namespace handles parameters that are operators.

  {:type :number/between
   :target [:dimension
            [:field
             26
             {:source-field 5}]]
   :value [3 5]}"
  (:require [metabase.mbql.schema :as mbql.s]
            [metabase.models.params :as params]
            [metabase.query-processor.error-type :as qp.error-type]
            [schema.core :as s]))

(def ^:private unary {:string/starts-with      :starts-with
                      :string/ends-with        :ends-with
                      :string/contains         :contains
                      :string/does-not-contain :does-not-contain
                      :number/>=               :>=
                      :number/<=               :<=})

(def ^:private binary {:number/between :between})

(def ^:private variadic {:string/=  :=
                         :string/!= :!=
                         :number/=  :=
                         :number/!= :!=})

(def ^:private all-ops (into #{} (mapcat keys [unary binary variadic])))

(s/defn operator? :- s/Bool
  "Returns whether param-type is an \"operator\" type."
  [param-type]
  (contains? all-ops param-type))

(s/defn ^:private verify-type-and-arity
  [field param-type param-value]
  (letfn [(maybe-arity-error [n]
            (when (not= n (count param-value))
              (throw (ex-info (format "Operations Invalid arity: expected %s but received %s"
                                      n (count param-value))
                              {:param-type  param-type
                               :param-value param-value
                               :field-id    (second field)
                               :type        qp.error-type/invalid-parameter}))))]
    (cond (contains? unary param-type)    (maybe-arity-error 1)
          (contains? binary param-type)   (maybe-arity-error 2)
          (contains? variadic param-type) (when-not (seq param-value)
                                            (throw (ex-info (format "No values provided for operator: %s" param-type)
                                                            {:param-type  param-type
                                                             :param-value param-value
                                                             :field-id    (second field)
                                                             :type        qp.error-type/invalid-parameter})))
          :else                           (throw (ex-info (format "Unrecognized operation: %s" param-type)
                                                          {:param-type  param-type
                                                           :param-value param-value
                                                           :field-id    (second field)
                                                           :type        qp.error-type/invalid-parameter})))))

(s/defn to-clause :- mbql.s/Filter
  "Convert an operator style parameter into an mbql clause. Will also do arity checks and throws an ex-info with
  `:type qp.error-type/invalid-parameter` if arity is incorrect."
  [{param-type :type [a b :as param-value] :value [_ field :as _target] :target :as param}]
  (verify-type-and-arity field param-type param-value)
  (let [field' (params/wrap-field-id-if-needed field)]
    (cond (contains? binary param-type)
          [(binary param-type) field' a b]

          (contains? unary param-type)
          [(unary param-type) field' a]

          (contains? variadic param-type)
          (into [(variadic param-type) field'] param-value)

          :else (throw (ex-info (format "Unrecognized operator: %s" param-type)
                                {:param-type param-type
                                 :param-value param-value
                                 :field-id    (second field)
                                 :type        qp.error-type/invalid-parameter})))))
