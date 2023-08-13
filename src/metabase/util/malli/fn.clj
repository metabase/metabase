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

(defn- add-default-map-schemas
  "Malli normally generates wacky default schemas when you use map destructuring in an argslist; this never seems to work
  correctly, so just add `[:maybe :map]` schemas manually to circumvent Malli's weird behavior.

    (add-default-map-schemas '[x {:keys [y]}])
    ;; =>
    [x {:keys [y]} :- [:maybe :map]]"
  [args]
  (if (empty? args)
    args
    (loop [acc [], [x & [y z :as more]] args]
      (let [schema (when (= y :-) z)
            more   (if schema
                     (drop 2 more)
                     more)
            schema (if (and (map? x)
                            (not schema))
                     (if (= (last acc) '&)
                       [:* :any]
                       [:maybe :map])
                     schema)
            acc    (concat acc (if schema
                                 [x :- schema]
                                 [x]))]
        (if (seq more)
          (recur acc more)
          acc)))))

(defn- arity-schema
  "Given a `fn` arity as parsed by [[mx/SchematizedParams]] an `return-schema`, return an appropriate `:=>` schema for
  the arity."
  [{:keys [args], :as _arity} return-schema]
  [:=>
   (:schema (md/parse (add-default-map-schemas args)))
   return-schema])

(defn parse-fn-tail
  "Parse a parameterized `fn` tail with the [[mx/SchematizedParams]] schema. Throw an exception if it cannot be parsed."
  [fn-tail]
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
    parsed))

(defn fn-schema
  "Implementation for [[fn]] and [[metabase.util.malli.defn/defn]]. Given an unparsed parametered fn tail, extract the
  annotations and return a `:=>` or `:function` schema."
  [parsed]
  (let [{:keys [return arities]}     parsed
        return-schema                (:schema return :any)
        [arities-type arities-value] arities]
    (case arities-type
      :single   (arity-schema arities-value return-schema)
      :multiple (into [:function]
                      (for [arity (:arities arities-value)]
                        (arity-schema arity return-schema))))))

(defn- deparameterized-arity [{:keys [body args prepost], :as _arity}]
  (concat
   [(:arglist (md/parse args))]
   (when prepost
     [prepost])
   body))

(defn- deparameterized-fn-tail [{[arities-type arities-value] :arities, :as _parsed}]
  (let [body (case arities-type
               :single   (deparameterized-arity arities-value)
               :multiple (for [arity (:arities arities-value)]
                           (deparameterized-arity arity)))]
    body))

(defn deparameterized-fn-form
  "Impl for [[metabase.util.malli.fn/fn]] and [[metabase.util.malli.defn/defn]]. Given a parsed `fn` tail (as parsed
  by [[parsed-fn-tail]]), return a [[clojure.core.fn]] form with the parameters stripped out.

    (deparameterized-fn-form (parse-fn-tail '[:- :int [x :- :int] (inc x)]))
    ;; =>
    (fn [x] (inc x))"
  [parsed]
  `(core/fn ~@(deparameterized-fn-tail parsed)))

(def ^:dynamic *enforce*
  "Whether [[validate-input]] and [[validate-output]] should validate things or not. In Cljc code, you can
  use [[metabase.util.malli/disable-enforcement]] to bind this only in Clojure code."
  true)

(defn- validate [schema value error-type]
  (when *enforce*
    ;; `validate` is significantly faster than `explain` if `value` is actually valid.
    (when-not (mr/validate schema value)
      (let [error     (mr/explain schema value)
            humanized (me/humanize error)]
        (throw (ex-info (case error-type
                          ::invalid-input  (i18n/tru "Invalid input: {0}" (pr-str humanized))
                          ::invalid-output (i18n/tru "Invalid output: {0}" (pr-str humanized)))
                        {:type      error-type
                         :error     error
                         :humanized humanized
                         :schema    schema
                         :value     value}))))))

(defn validate-input
  "Impl for [[metabase.util.malli.fn/fn]]; validates an input argument with `value` against `schema` using a cached
  explainer and throws an exception if the check fails."
  [schema value]
  (validate schema value ::invalid-input))

(defn validate-output
  "Impl for [[metabase.util.malli.fn/fn]]; validates function output `value` against `schema` using a cached explainer
  and throws an exception if the check fails. Returns validated value."
  [schema value]
  (validate schema value ::invalid-output)
  value)

(defn- varargs-schema? [[_cat & args :as _input-schema]]
  (letfn [(star-schema? [schema]
            (and (sequential? schema)
                 (= (first schema) :*)))]
    (star-schema? (last args))))

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
    (->> (map (core/fn [arg-name schema]
                ;; 1. Skip checks against `:any` schema, there is no situation where it would fail.
                ;;
                ;; 2. Skip checks against the default varargs schema, there is no situation where [:maybe [:* :any]] is
                ;; going to fail.
                (when-not (= schema (if (= arg-name 'more)
                                      [:maybe [:* :any]]
                                      :any))
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

(defn instrumented-fn-form
  "Given a `fn-tail` like

    ([x :- :int y] (+ 1 2))

  and parsed by [[parsed-fn-tail]],

  return an unevaluated instrumented [[fn]] form like

    (mc/-instrument {:schema [:=> [:cat :int :any] :any]}
                    (fn [x y] (+ 1 2)))"
  [parsed]
  `(let [~'&f ~(deparameterized-fn-form parsed)]
     (core/fn ~@(instrumented-fn-tail (fn-schema parsed)))))

(defmacro fn
  "Malli version of [[schema.core/fn]]. A form like

    (fn :- :int [x :- :int] (inc x))

  compiles to something like

    (let [&f (fn [x] (inc x))]
      (fn [a]
        (validate-input :int a)
        (validate-output :int (&f a))))

  Known issue: this version of `fn` does not capture the optional function name and make it available, e.g. you can't
  do

    (mu/fn my-fn
     ([x] (my-fn x 1))
     ([x y :- :int] (+ x y)))

  If we were to include `my-fn` in the uninstrumented `fn` form, then it would bypass schema checks when you call
  another arity:

    (let [&f (fn my-fn
               ([x] (my-fn x 1))
               ([x y] (+ x y)))]
      (fn
        ([a]
         (&f a))
        ([a b]
         (validate-input :int b)
         (&f a b))))

    ;; skips the `:- :int` check on `y` in the 2-arity
    (my-fn 1.0) ;; => 2.0

  Since this is a big gotcha, we are currently not including the optional function name `my-fn` in the generated
  output. We can probably fix this with [[letfn]], since it allows mutually recursive function calls, but that's a
  problem for another day. The passed function name comes back from [[mc/parse]] as `:name` if we want to attempt to
  fix this later."
  [& fn-tail]
  (instrumented-fn-form (parse-fn-tail fn-tail)))
