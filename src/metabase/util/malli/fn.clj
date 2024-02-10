(ns metabase.util.malli.fn
  (:refer-clojure :exclude [fn])
  (:require
   [clojure.core :as core]
   [malli.core :as mc]
   [malli.destructure :as md]
   [malli.error :as me]
   [metabase.config :as config]
   [metabase.shared.util.i18n :as i18n]
   [metabase.util.log :as log]
   [metabase.util.malli.humanize :as mu.humanize]
   [metabase.util.malli.registry :as mr]))

(set! *warn-on-reflection* true)

(defn- add-default-schemas
  "Malli normally generates wacky default schemas when you use destructuring in an argslist; this never seems to work
  correctly, so just add default schemas manually to circumvent Malli's weird behavior.

    (add-default-schemas '[x {:keys [y]}])
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
            schema (cond
                     schema
                     schema

                     (and (or (map? x)
                              (sequential? x))
                          (= (last acc) '&))
                     [:* :any]

                     (map? x)
                     [:maybe :map]

                     (sequential? x)
                     [:maybe [:sequential :any]])
            acc    (concat acc (if schema
                                 [x :- schema]
                                 [x]))]
        (if (seq more)
          (recur acc more)
          acc)))))

(defn- arity-schema
  "Given a `fn` arity as parsed by [[SchematizedParams]] an `return-schema`, return an appropriate `:=>` schema for
  the arity."
  [{:keys [args], :as _arity} return-schema]
  [:=>
   (:schema (md/parse (add-default-schemas args)))
   return-schema])

(def ^:private SchematizedParams
  "This is exactly the same as [[malli.experimental/SchematizedParams]], but it preserves metadata from the arglists."
  (mc/schema
   [:schema
    {:registry {"Schema"    any?
                "Separator" [:= :-]
                "Args"      vector? ; [:vector :any] loses metadata, but vector? keeps it :shrug:
                "PrePost"   [:map
                             [:pre {:optional true} [:sequential any?]]
                             [:post {:optional true} [:sequential any?]]]
                "Arity"     [:catn
                             [:args "Args"]
                             [:prepost [:? "PrePost"]]
                             [:body [:* :any]]]
                "Params"    [:catn
                             [:name symbol?]
                             [:return [:? [:catn
                                           [:- "Separator"]
                                           [:schema "Schema"]]]]
                             [:doc [:? string?]]
                             [:meta [:? :map]]
                             [:arities [:altn
                                        [:single "Arity"]
                                        [:multiple [:catn
                                                    [:arities [:+ [:schema "Arity"]]]
                                                    [:meta [:? :map]]]]]]]}}
    "Params"]))

(def ^:private ^{:arglists '([fn-tail])} parse-SchematizedParams
  (mc/parser SchematizedParams))

(defn parse-fn-tail
  "Parse a parameterized `fn` tail with the [[SchematizedParams]] schema. Throw an exception if it cannot be parsed."
  [fn-tail]
  (let [parsed (parse-SchematizedParams (if (symbol? (first fn-tail))
                                          fn-tail
                                          (cons '&f fn-tail)))]
    (when (= parsed ::mc/invalid)
      (let [error     (mc/explain SchematizedParams fn-tail)
            humanized (mu.humanize/humanize error)]
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

(defn deparameterized-fn-tail
  "Generate a deparameterized `fn` tail (the contents of a `fn` form after the `fn` symbol)."
  [{[arities-type arities-value] :arities, :as _parsed}]
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

(defn- validate [error-context schema value error-type]
  (when *enforce*
    (when-let [error (mr/explain schema value)]
      (let [humanized (me/humanize error {:wrap (core/fn humanize-include-value
                                                  [{:keys [value message]}]
                                                  (str message ", got: " (pr-str value)))})
            details   (merge
                        {:type      error-type
                         :error     error
                         :humanized humanized
                         :schema    schema
                         :value     value}
                        error-context)]
        (if (or config/is-dev?
              config/is-test?)
          ;; In dev and test, throw an exception.
          (throw (ex-info (case error-type
                            ::invalid-input  (i18n/tru "Invalid input: {0}" (pr-str humanized))
                            ::invalid-output (i18n/tru "Invalid output: {0}" (pr-str humanized)))
                          details))
          ;; In prod, log a warning.
          (log/warn
            (case error-type
              ::invalid-input  (i18n/tru "Invalid input - Please report this as an issue on Github: {0}"
                                         (pr-str humanized))
              ::invalid-output (i18n/tru "Invalid output - Please report this as an issue on Github: {0}"
                                         (pr-str humanized)))
            details))))))

(defn validate-input
  "Impl for [[metabase.util.malli.fn/fn]]; validates an input argument with `value` against `schema` using a cached
  explainer and throws an exception if the check fails."
  [error-context schema value]
  (validate error-context schema value ::invalid-input))

(defn validate-output
  "Impl for [[metabase.util.malli.fn/fn]]; validates function output `value` against `schema` using a cached explainer
  and throws an exception if the check fails. Returns validated value."
  [error-context schema value]
  (validate error-context schema value ::invalid-output)
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

(defn- input-schema->validation-forms [error-context [_cat & schemas :as input-schema]]
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
                  `(validate-input ~error-context ~schema ~arg-name)))
              arg-names
              schemas)
         (filter some?))))

(defn- input-schema->application-form [input-schema]
  (let [arg-names (input-schema-arg-names input-schema)]
    (if (varargs-schema? input-schema)
      (list* `apply '&f arg-names)
      (list* '&f arg-names))))

(defn fixup-stacktrace
  "If exception is thrown from the [[validate]] machinery, remove those stack trace elements so the top of the stack is
  the calling function."
  [^Exception e]
  (if (#{::invalid-input ::invalid-output} (-> e ex-data :type))
    (let [trace (.getStackTrace e)
          cleaned (when trace
                    (into-array StackTraceElement
                                (drop-while (comp #{(.getName (class validate))
                                                    (.getName (class validate-input))
                                                    (.getName (class validate-output))}
                                                  #(.getClassName ^StackTraceElement %))
                                            trace)))]
      (doto e
        (.setStackTrace cleaned)))
    e))

(defn- instrumented-arity [error-context [_=> input-schema output-schema]]
  (let [input-schema           (if (= input-schema :cat)
                                 [:cat]
                                 input-schema)
        arglist                (input-schema->arglist input-schema)
        input-validation-forms (input-schema->validation-forms error-context input-schema)
        result-form            (input-schema->application-form input-schema)
        result-form            (if (and output-schema
                                        (not= output-schema :any))
                                 `(->> ~result-form
                                       (validate-output ~error-context ~output-schema))
                                 result-form)]
    `(~arglist
      (try
        ~@input-validation-forms
        ~result-form
        (catch Exception ~'error
          (throw (fixup-stacktrace ~'error)))))))

(defn- instrumented-fn-tail [error-context [schema-type :as schema]]
  (case schema-type
    :=>
    [(instrumented-arity error-context schema)]

    :function
    (let [[_function & schemas] schema]
      (for [schema schemas]
        (instrumented-arity error-context schema)))))

(defn instrumented-fn-form
  "Given a `fn-tail` like

    ([x :- :int y] (+ 1 2))

  and parsed by [[parsed-fn-tail]],

  return an unevaluated instrumented [[fn]] form like

    (mc/-instrument {:schema [:=> [:cat :int :any] :any]}
                    (fn [x y] (+ 1 2)))"
  [error-context parsed]
  `(let [~'&f ~(deparameterized-fn-form parsed)]
     (core/fn ~@(instrumented-fn-tail error-context (fn-schema parsed)))))

;; ------------------------------ Skipping Namespace Enforcement in prod ------------------------------

(defn instrument-ns?
  "Returns true if mu.fn/fn and mu/defn in a namespace should be instrumented with malli schema validation."
  [namespace]
  (or (true? (:instrument/always (meta namespace)))
      config/is-dev?
      config/is-test?))

(defmacro fn
  "Malli version of [[schema.core/fn]].

  Unless it's in a skipped namespace during prod, a form like:

    (fn :- :int [x :- :int] (inc x))

  compiles to something like

    (let [&f (fn [x] (inc x))]
      (fn [a]
        (validate-input {} :int a)
        (validate-output {} :int (&f a))))

  The map arg here is additional error context; for something like [[metabase.util.malli/defn]], it will be something
  like

    {:fn-name 'metabase.lib.field/resolve-field-id}

  for [[metabase.util.malli/defmethod]] it will be something like

    {:fn-name 'whatever/my-multimethod, :dispatch-value :field}

  If compiled in a namespace in [[namespaces-toskip]], during `config/is-prod?`, it will be emitted as a vanilla clojure.core/fn form.

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
         (validate-input {} :int b)
         (&f a b))))

    ;; skips the `:- :int` check on `y` in the 2-arity
    (my-fn 1.0) ;; => 2.0

  Since this is a big gotcha, we are currently not including the optional function name `my-fn` in the generated
  output. We can probably fix this with [[letfn]], since it allows mutually recursive function calls, but that's a
  problem for another day. The passed function name comes back from [[mc/parse]] as `:name` if we want to attempt to
  fix this later."
  [& fn-tail]
  (let [parsed (parse-fn-tail fn-tail)
        instrument? (instrument-ns? *ns*)]
    (if-not instrument?
      (deparameterized-fn-form parsed)
      (let [error-context (if (symbol? (first fn-tail))
                            ;; We want the quoted symbol of first fn-tail:
                            {:fn-name (list 'quote (first fn-tail))} {})]
        (instrumented-fn-form error-context parsed)))))
