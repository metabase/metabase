(ns metabase.util.malli.defmethod
  "Impl for [[metabase.util.malli/defmethod]]."
  (:require
   [clojure.core :as core]
   [malli.core :as mc]
   [malli.destructure]
   [malli.experimental :as mx]))

(defn- arity-schema [arity return-schema]
  [:=>
   (:schema (malli.destructure/parse (:args arity)))
   return-schema])

(defn- parameterized-fn-tail->schema [fn-tail]
  (let [{:keys [return arities]}     (mc/parse mx/SchematizedParams (if (symbol? (first fn-tail))
                                                                      fn-tail
                                                                      (cons 'f fn-tail)))
        return-schema                (:schema return :any)
        [arities-type arities-value] arities]
    (case arities-type
      :single   (arity-schema arities-value return-schema)
      :multiple (into [:function]
                      (for [arity (:arities arities-value)]
                        (arity-schema arity return-schema))))))

(defn- deparameterized-arity [{:keys [body args prepost], :as _arity}]
  (concat
   [(:arglist (malli.destructure/parse args))]
   (when prepost
     [prepost])
   body))

(defn- deparameterized-fn-tail [fn-tail]
  (let [{:keys [arities]}            (mc/parse mx/SchematizedParams (if (symbol? (first fn-tail))
                                                                      fn-tail
                                                                      (cons 'f fn-tail)))
        [arities-type arities-value] arities]
    (case arities-type
      :single   (deparameterized-arity arities-value)
      :multiple (for [arity (:arities arities-value)]
                  (deparameterized-arity arity)))))

;;; TODO -- this could also be used to power a Malli version of [[fn]]
(defn instrumented-fn-form
  "Given a `fn-tail` like

    ([x :- :int y] (+ 1 2))

  return an unevaluated instrumented [[fn]] form like

    (mc/-instrument {:schema [:=> [:cat :int :any] :any]}
                    (fn [x y] (+ 1 2)))"
  [fn-tail]
  `(mc/-instrument {:schema ~(parameterized-fn-tail->schema fn-tail)}
                   (fn ~@(deparameterized-fn-tail fn-tail))))
