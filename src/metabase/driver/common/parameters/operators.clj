(ns metabase.driver.common.parameters.operators
  "This namespace handles parameters that are operators.

    {:type :number/between
     :target [:dimension
              [:field
               26
               {:source-field 5}]]
     :value [3 5]}"
  (:require
   [metabase.lib.schema.parameter :as lib.schema.parameter]
   [metabase.mbql.schema :as mbql.s]
   [metabase.models.params :as params]
   [metabase.query-processor.error-type :as qp.error-type]
   [metabase.util.i18n :refer [tru]]
   [metabase.util.malli :as mu]
   [schema.core :as s]))

(s/defn ^:private operator-arity :- (s/maybe (s/enum :unary :binary :variadic))
  [param-type]
  (get-in lib.schema.parameter/types [param-type :operator]))

(defn operator?
  "Returns whether param-type is an \"operator\" type."
  [param-type]
  (boolean (operator-arity param-type)))

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
    (condp = (operator-arity param-type)
      :unary
      (maybe-arity-error 1)

      :binary
      (maybe-arity-error 2)

      :variadic
      (when-not (sequential? param-value)
        (throw (ex-info (tru "Invalid values provided for operator: {0}" param-type)
                        {:param-type  param-type
                         :param-value param-value
                         :field-id    (second field)
                         :type        qp.error-type/invalid-parameter})))

      (throw (ex-info (tru "Unrecognized operation: {0}" param-type)
                      {:param-type  param-type
                       :param-value param-value
                       :field-id    (second field)
                       :type        qp.error-type/invalid-parameter})))))

(mu/defn to-clause :- mbql.s/Filter
  "Convert an operator style parameter into an mbql clause. Will also do arity checks and throws an ex-info with
  `:type qp.error-type/invalid-parameter` if arity is incorrect."
  [{param-type :type [a b :as param-value] :value [_ field :as _target] :target options :options :as _param}]
  (verify-type-and-arity field param-type param-value)
  (let [field' (params/wrap-field-id-if-needed field)]
    (condp = (operator-arity param-type)
      :binary
      (cond-> [(keyword (name param-type)) field' a b]
        (boolean options) (conj options))

      :unary
      (cond-> [(keyword (name param-type)) field' a]
        (boolean options) (conj options))

      :variadic
      (cond-> (into [(keyword (name param-type)) field'] param-value)
        (boolean options) (conj options))

      (throw (ex-info (format "Unrecognized operator: %s" param-type)
                      {:param-type param-type
                       :param-value param-value
                       :field-id    (second field)
                       :type        qp.error-type/invalid-parameter})))))
