(ns metabase.util.malli.fn
  (:refer-clojure :exclude [fn])
  (:require
   [clojure.core :as core]
   [malli.core :as mc]
   [malli.destructure :as md]
   [malli.error :as me]
   [malli.experimental :as mx]
   [metabase.shared.util.i18n :as i18n]
   [metabase.util.malli.registry :as mr]))

(defn- add-default-map-schemas [args]
  (if (empty? args)
    args
    (loop [acc [], [x & [y z :as more]] args]
      (let [schema (when (= y :-) z)
            more   (if schema
                     (drop 2 more)
                     more)
            schema (if (and (map? x)
                            (not schema))
                     :any
                     schema)
            acc    (concat acc (if schema
                                 [x :- schema]
                                 [x]))]
        (if (seq more)
          (recur acc more)
          acc)))))

(defn- arity-schema [{:keys [args], :as _arity} return-schema]
  [:=>
   (:schema (md/parse (add-default-map-schemas args)))
   return-schema])

(defn- parameterized-fn-tail->schema [fn-tail]
  (let [parsed (mc/parse mx/SchematizedParams (if (symbol? (first fn-tail))
                                                fn-tail
                                                (cons '&f fn-tail)))]
    (when (= parsed ::mc/invalid)
      (let [error     (mc/explain mx/SchematizedParams fn-tail)
            humanized (me/humanize error)]
        (throw (ex-info (format "Invalid function tail: %s" humanized)
                        {:fn-tail   fn-tail
                         :error     error
                         :humanized humanized}))))
    (let [{:keys [return arities]}     parsed
          return-schema                (:schema return :any)
          [arities-type arities-value] arities]
      (case arities-type
        :single   (arity-schema arities-value return-schema)
        :multiple (into [:function]
                        (for [arity (:arities arities-value)]
                          (arity-schema arity return-schema)))))))

(defn- deparameterized-arity [{:keys [body args prepost], :as _arity}]
  (concat
   [(:arglist (md/parse args))]
   (when prepost
     [prepost])
   body))

(defn- deparameterized-fn-tail [fn-tail]
  (let [{:keys [arities], fn-name :name} (mc/parse mx/SchematizedParams (if (symbol? (first fn-tail))
                                                                          fn-tail
                                                                          (cons '&f fn-tail)))
        [arities-type arities-value]     arities
        body                             (case arities-type
                                           :single   (deparameterized-arity arities-value)
                                           :multiple (for [arity (:arities arities-value)]
                                                       (deparameterized-arity arity)))]
    body))

(defn deparameterized-fn-form [fn-tail]
  `(clojure.core/fn ~@(deparameterized-fn-tail fn-tail)))

(def ^:dynamic *enforce* true)

(defn validate-input [schema value]
  (when *enforce*
    (when-let [error (mr/explain schema value)]
      (let [humanized (me/humanize error)]
        (throw (ex-info (i18n/tru "Invalid input: {0}" (pr-str humanized))
                        {:type      ::invalid-input
                         :error     error
                         :humanized humanized
                         :schema    schema
                         :value     value}))))))

(defn validate-output [schema value]
  (when *enforce*
    (when-let [error (mr/explain schema value)]
      (let [humanized (me/humanize error)]
        (throw (ex-info (i18n/tru "Invalid output: {0}" (pr-str humanized))
                        {:type      ::invalid-output
                         :error     error
                         :humanized humanized
                         :schema    schema
                         :value     value})))))
  value)

(defn- varargs-schema? [[_cat & args :as _input-schema]]
  (and (sequential? (last args))
       (= (first (last args)) :*)))

(defn- input-schema-arg-names [[_cat & args :as input-schema]]
  (let [varargs?    (varargs-schema? input-schema)
        normal-args (if varargs?
                      (butlast args)
                      args)]
    (concat
     (for [n (range (count normal-args))]
       (symbol (str (char (+ (int \a) n)))))
     (when varargs?
       ['more]))))

(defn- input-schema->arglist [input-schema]
  (let [arg-names (input-schema-arg-names input-schema)]
    (vec (if (varargs-schema? input-schema)
           (concat (butlast arg-names) ['& (last arg-names)])
           arg-names))))

(defn- input-schema->validation-forms [[_cat & schemas :as input-schema]]
  (let [arg-names (input-schema-arg-names input-schema)
        schemas   (if (varargs-schema? input-schema)
                    (concat (butlast schemas) [[:maybe (last schemas)]])
                    schemas)]
    (->> (map (clojure.core/fn [arg-name schema]
                (when-not (= schema :any)
                  `(validate-input ~schema ~arg-name)))
              arg-names
              schemas)
         (filter some?))))

(defn- input-schema->application-form [input-schema]
  (let [arg-names (input-schema-arg-names input-schema)]
    (if (varargs-schema? input-schema)
      (list* `apply '&f arg-names)
      (list* '&f arg-names))))

(defn- instrumented-arity [[_=> input-schema output-schema]]
  (let [input-schema           (if (= input-schema :cat)
                                 [:cat]
                                 input-schema)
        arglist                (input-schema->arglist input-schema)
        input-validation-forms (input-schema->validation-forms input-schema)
        result-form            (input-schema->application-form input-schema)
        result-form            (if (and output-schema
                                        (not= output-schema :any))
                                 `(->> ~result-form
                                       (validate-output ~output-schema))
                                 result-form)]
    `(~arglist ~@input-validation-forms ~result-form)))

(defn- instrumented-fn-tail [[schema-type :as schema]]
  (case schema-type
    :=>
    [(instrumented-arity schema)]

    :function
    (let [[_function & schemas] schema]
      (map instrumented-arity schemas))))

(defmacro instrumented-fn* [schema]
  `(clojure.core/fn ~@(instrumented-fn-tail schema)))

;;; TODO -- this could also be used to power a Malli version of [[fn]]
(defn instrumented-fn-form
  "Given a `fn-tail` like

    ([x :- :int y] (+ 1 2))

  return an unevaluated instrumented [[fn]] form like

    (mc/-instrument {:schema [:=> [:cat :int :any] :any]}
                    (fn [x y] (+ 1 2)))"
  [fn-tail]
  (deparameterized-fn-form fn-tail)
  `(let [~'&f ~(deparameterized-fn-form fn-tail)]
     (instrumented-fn* ~(parameterized-fn-tail->schema fn-tail))))

(defmacro fn [& fn-tail]
  (instrumented-fn-form fn-tail))
