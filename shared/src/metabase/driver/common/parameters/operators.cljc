(ns metabase.driver.common.parameters.operators
  "This namespace handles parameters that are operators.

  {:type :number/between
   :target [:dimension
            [:field
             26
             {:source-field 5}]]
   :value [3 5]}"
  (:require [clojure.string :as str]
            [medley.core :as m]
            [metabase.mbql.schema :as mbql.s]
            [metabase.mbql.util :as mbql.u]
            [metabase.query-processor.error-type :as qp.error-type]
            [metabase.shared.util.i18n :as i18n :refer [tru]]
            [schema.core :as s]))

(def operators
  "Operator information source of truth for frontend and backend. This is annotated and changed and used on the frontend
  and collapsed and used on the backend. Ideally all information about an operator can go in this map so that the
  frontend and backend can have the exact same information."
  {:number [{:operator      :number/=
             :arity         :variadic
             :mbql-operator :=
             :name          (trs "Equal to")}
            {:operator      :number/!=
             :arity         :variadic
             :mbql-operator :!=
             :name          (trs "Not equal to")}
            {:operator      :number/between
             :arity         :two
             :mbql-operator :between
             :name          (trs "Between")}
            {:operator      :number/>=
             :arity         :one
             :mbql-operator :>=
             :name          (trs "Greater than or equal to")}
            {:operator      :number/<=
             :arity         :one
             :mbql-operator :<=
             :name          (trs "Less than or equal to")}]
   :string [{:operator      :string/=
             :arity         :variadic
             :mbql-operator :=
             :name          (trs "Equals")
             :description   (trs "Equals a specific value.")}
            {:operator      :string/!=
             :arity         :variadic
             :mbql-operator :!=
             :name          (trs "Is not")
             :description   (trs "Exclude one or more values.")}
            {:operator      :string/contains
             :arity         :one
             :mbql-operator :contains
             :name          (trs "Contains")
             :description   (trs "Match values that contain the entered text.")}
            {:operator      :string/does-not-contain
             :arity         :one
             :mbql-operator :does-not-contain
             :name          (trs "Does not contain")
             :description   (trs "Filter out values that contain the entered text.")}
            {:operator      :string/starts-with
             :arity         :one
             :mbql-operator :starts-with
             :name          (trs "Starts with")
             :description   (trs "Match values that begin with the entered text.")}
            {:operator      :string/ends-with
             :arity         :one
             :mbql-operator :ends-with
             :name          (trs "Ends with")
             :description   (trs "Match values that end with the entered text.")}]})

#?(:cljs
   (def ^:export PARAMETER_OPERATOR_TYPES
     "Operators for the frontend
  {\"number\": {\"name\": \"string/=\" ...}}"
     (clj->js (m/map-vals (fn [ops]
                            (into [] (map (fn [{:keys [operator] :as op}]
                                            (let [stringed (str (namespace operator) "/" (name operator))]
                                              (assoc op
                                                     :operator stringed
                                                     :type stringed))))
                                  ops))
                          operators))))

(def ^:private unary (into {}
                           (comp cat
                                 (filter (comp #{:one} :arity))
                                 (map (juxt :operator :mbql-operator)))
                           (-> operators vals)))



(def ^:private binary (into {}
                            (comp cat
                                  (filter (comp #{:two} :arity))
                                  (map (juxt :operator :mbql-operator)))
                            (-> operators vals)))

(def ^:private variadic (into {}
                              (comp cat
                                    (filter (comp #{:variadic} :arity))
                                    (map (juxt :operator :mbql-operator)))
                              (-> operators vals)))

(def ^:private all-ops (into #{} (comp cat (map :operator)) (->> operators vals)))

(s/defn operator? :- s/Bool
  "Returns whether param-type is an \"operator\" type."
  [param-type]
  (contains? all-ops param-type))

(s/defn ^:private verify-type-and-arity
  [field param-type param-value]
  (letfn [(maybe-arity-error [n]
            (when (not= n (count param-value))
              (throw (ex-info (tru "Operations Invalid arity: expected {0} but received {1}"
                                      n (count param-value))
                              {:param-type  param-type
                               :param-value param-value
                               :field-id    (second field)
                               :type        qp.error-type/invalid-parameter}))))]
    (cond (contains? unary param-type)    (maybe-arity-error 1)
          (contains? binary param-type)   (maybe-arity-error 2)
          (contains? variadic param-type) (when-not (seq param-value)
                                            (throw (ex-info (tru "No values provided for operator: {0}" param-type)
                                                            {:param-type  param-type
                                                             :param-value param-value
                                                             :field-id    (second field)
                                                             :type        qp.error-type/invalid-parameter})))
          :else                           (throw (ex-info (tru "Unrecognized operation: {0}" param-type)
                                                          {:param-type  param-type
                                                           :param-value param-value
                                                           :field-id    (second field)
                                                           :type        qp.error-type/invalid-parameter})))))

(s/defn to-clause :- mbql.s/Filter
  "Convert an operator style parameter into an mbql clause. Will also do arity checks and throws an ex-info with
  `:type qp.error-type/invalid-parameter` if arity is incorrect."
  [{param-type :type [a b :as param-value] :value [_ field :as _target] :target :as param}]
  (verify-type-and-arity field param-type param-value)
  (let [field' (mbql.u/wrap-field-id-if-needed field)]
    (cond (contains? binary param-type)
          [(binary param-type) field' a b]

          (contains? unary param-type)
          [(unary param-type) field' a]

          (contains? variadic param-type)
          (into [(variadic param-type) field'] param-value)

          :else (throw (ex-info (tru "Unrecognized operator: {0}" param-type)
                                {:param-type param-type
                                 :param-value param-value
                                 :field-id    (second field)
                                 :type        qp.error-type/invalid-parameter})))))
