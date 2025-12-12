(ns metabase.query-processor.parameters.operators
  "This namespace handles parameters that are operators.

    {:type :number/between
     :target [:dimension
              [:field
               26
               {:source-field 5}]]
     :value [3 5]}

  TODO (Cam 8/8/25) -- move this into `lib` since there's nothing particularly QP about it except
  for [[qp.error-type]], which maybe belongs in Lib too!"
  (:refer-clojure :exclude [get-in])
  (:require
   [metabase.lib.core :as lib]
   [metabase.lib.schema.expression :as lib.schema.expression]
   [metabase.lib.schema.parameter :as lib.schema.parameter]
   [metabase.lib.util.match :as lib.util.match]
   [metabase.query-processor.error-type :as qp.error-type]
   [metabase.util.i18n :refer [tru]]
   [metabase.util.malli :as mu]
   [metabase.util.performance :refer [get-in]]))

(mu/defn- operator-arity :- [:maybe [:enum :unary :binary :variadic]]
  [param-type]
  (get-in lib.schema.parameter/types [param-type :operator]))

(defn operator?
  "Returns whether param-type is an \"operator\" type."
  [param-type]
  (boolean (operator-arity param-type)))

(mu/defn- verify-type-and-arity
  [field       :- [:or :mbql.clause/field :mbql.clause/expression]
   param-type
   param-value]
  (letfn [(maybe-arity-error [n]
            (when (not= n (count param-value))
              (throw (ex-info (format "Operations Invalid arity: expected %s but received %s"
                                      n (count param-value))
                              {:param-type  param-type
                               :param-value param-value
                               :field-id    (last field)
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
                         :field-id    (last field)
                         :type        qp.error-type/invalid-parameter})))

      (throw (ex-info (tru "Unrecognized operation: {0}" param-type)
                      {:param-type  param-type
                       :param-value param-value
                       :field-id    (last field)
                       :type        qp.error-type/invalid-parameter})))))

;;; TODO (Cam 7/23/25) -- we should probably move this logic into [[metabase.lib.schema.parameter]] as normal
;;; `:decode/normalize` logic
(defn- normalize-param
  [param]
  (case (keyword (:type param))
    :number/between
    (let [[l u] (:value param)]
      (cond-> param
        (nil? u) (assoc :type :number/>=, :value [l])
        (nil? l) (assoc :type :number/<=, :value [u])))
    param))

(mu/defn to-clause :- ::lib.schema.expression/boolean
  "Convert an operator style parameter into an mbql clause. Will also do arity checks and throws an ex-info with
  `:type qp.error-type/invalid-parameter` if arity is incorrect."
  [param]
  (let [{param-type :type, [a b :as param-value] :value, target :target, options :options} (normalize-param param)
        field-ref (or (lib.util.match/match-one target
                        #{:field :expression}
                        (lib/->pMBQL &match))
                      (throw (ex-info (format "Invalid target: expected :field ref, got: %s" (pr-str target))
                                      {:target target, :type qp.error-type/invalid-parameter})))
        options   (or options {})]
    (verify-type-and-arity field-ref param-type param-value)
    (-> (case (operator-arity param-type)
          :binary   [(keyword (name param-type)) options field-ref a b]
          :unary    [(keyword (name param-type)) options field-ref a]
          :variadic (into [(keyword (name param-type)) options field-ref] param-value)
          #_else
          (throw (ex-info (format "Unrecognized operator: %s" param-type)
                          {:param-type  param-type
                           :param-value param-value
                           :field-id    (last field-ref)
                           :type        qp.error-type/invalid-parameter})))
        lib/normalize)))
