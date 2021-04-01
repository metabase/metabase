(ns metabase.driver.common.parameters.operators
  "This namespace handles parameters that are operators.

  {:type :number/between
   :target [:dimension
            [:field
             26
             {:source-field 5}]]
   :value [3 5]}"
  (:require [medley.core :as m]
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
             :mbql-operator :=}
            {:operator      :number/!=
             :arity         :variadic
             :mbql-operator :!=}
            {:operator      :number/between
             :arity         :two
             :mbql-operator :between}
            {:operator      :number/>=
             :arity         :one
             :mbql-operator :>=}
            {:operator      :number/<=
             :arity         :one
             :mbql-operator :<=}]
   :string [{:operator      :string/=
             :arity         :variadic
             :mbql-operator :=}
            {:operator      :string/!=
             :arity         :variadic
             :mbql-operator :!=}
            {:operator      :string/contains
             :arity         :one
             :mbql-operator :contains}
            {:operator      :string/does-not-contain
             :arity         :one
             :mbql-operator :does-not-contain}
            {:operator      :string/starts-with
             :arity         :one
             :mbql-operator :starts-with}
            {:operator      :string/ends-with
             :arity         :one
             :mbql-operator :ends-with}]})

#?(:cljs
   (def ^:export PARAMETER_OPERATOR_TYPES
     "Operators for the frontend
  {\"number\": {\"name\": \"string/=\" ...}}"
     ;; these `tru` calls can't be top level on the backend
     (let [annotations {:string/=           {:name (tru "Equals"), :description (tru "Equals a specific value.")}
                        :string/!=          {:name (tru "Is not"), :description (tru "Exclude one or more values.")},
                        :string/starts-with {:name (tru "Starts with"), :description (tru "Match values that begin with the entered text.")}
                        :string/ends-with   {:name (tru "Ends with"), :description (tru "Match values that end with the entered text.")},
                        :string/contains    {:name (tru "Contains"), :description (tru "Match values that contain the entered text.")}
                        :string/does-not-contain
                        {:name (tru "Does not contain"), :description (tru "Filter out values that contain the entered text.")},
                        :number/=           {:name (tru "Equal to")},
                        :number/!=          {:name (tru "Not equal to")},
                        :number/>=          {:name (tru "Greater than or equal to")}
                        :number/<=          {:name (tru "Less than or equal to")}
                        :number/between     {:name (tru "Between")}}]
       (clj->js (m/map-vals (fn [ops]
                              (into [] (map (fn [{:keys [operator] :as op}]
                                              (let [stringed (str (namespace operator) "/" (name operator))]
                                                (merge
                                                 (assoc op
                                                        :operator stringed
                                                        :type stringed)
                                                 (annotations operator)))))
                                    ops))
                            operators)))))

(defn- operators-for-arity
  "Given an arity (:one, :two, :variadic), and the operators information, filter for that arity, and return key value
  pairs of [operator mbql-operator]."
  [arity operators]
  (into {}
        (comp cat
              (filter (comp #{arity} :arity))
              (map (juxt :operator :mbql-operator)))
        (-> operators vals)))

(def ^:private unary (operators-for-arity :one operators))

(def ^:private binary (operators-for-arity :two operators))

(def ^:private variadic (operators-for-arity :variadic operators))

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
  (let [field' (some-> field mbql.u/wrap-field-id-if-needed)]
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

#?(:cljs
   (defn ^:export parameter_to_mbql [param]
     (clj->js
      (to-clause (-> param
                     (js->clj :keywordize-keys true)
                     (update :type keyword))))))
#?(:cljs
   (defn ^:export is_operator [param]
     (operator? (keyword param))))
