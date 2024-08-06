(ns metabase.util.malli.registry
  (:refer-clojure :exclude [declare def])
  (:require
   [malli.core :as mc]
   [malli.registry]
   [malli.util :as mut]
   #?@(:clj ([malli.experimental.time :as malli.time])))
  #?(:cljs (:require-macros [metabase.util.malli.registry])))

(defonce ^:private cache (atom {}))

(defn cached
  "Get a cached value for `k` + `schema`. Cache is cleared whenever a schema is (re)defined
  with [[metabase.util.malli.registry/def]]. If value doesn't exist, `value-thunk` is used to calculate (and cache)
  it.

  You generally shouldn't use this outside of this namespace unless you have a really good reason to do so! Make sure
  you used namespaced keys if you are using it elsewhere."
  [k schema value-thunk]
  (or (get (get @cache k) schema) ; get-in is terribly inefficient
      (let [v (value-thunk)]
        (swap! cache assoc-in [k schema] v)
        v)))

(defn validator
  "Fetch a cached [[mc/validator]] for `schema`, creating one if needed. The cache is flushed whenever the registry
  changes."
  [schema]
  (cached :validator schema #(mc/validator schema)))

(defn validate
  "[[mc/validate]], but uses a cached validator from [[validator]]."
  [schema value]
  ((validator schema) value))

(defn explainer
  "Fetch a cached [[mc/explainer]] for `schema`, creating one if needed. The cache is flushed whenever the registry
  changes."
  [schema]
  (letfn [(make-explainer []
            #_{:clj-kondo/ignore [:discouraged-var]}
            (let [validator* (mc/validator schema)
                  explainer* (mc/explainer schema)]
              ;; for valid values, it's significantly faster to just call the validator. Let's optimize for the 99.9%
              ;; of calls whose values are valid.
              (fn schema-explainer [value]
                (when-not (validator* value)
                  (explainer* value)))))]
    (cached :explainer schema make-explainer)))

(defn explain
  "[[mc/explain]], but uses a cached explainer from [[explainer]]."
  [schema value]
  ((explainer schema) value))

(defonce ^:private registry*
  (atom (merge (mc/default-schemas)
               (mut/schemas)
               #?(:clj (malli.time/schemas)))))

(defonce ^:private registry (malli.registry/mutable-registry registry*))

(malli.registry/set-default-registry! registry)

(defn register!
  "Register a spec with our Malli spec registry."
  [schema definition]
  (swap! registry* assoc schema definition)
  (reset! cache {})
  nil)

(defn schema
  "Get the Malli schema for `type` from the registry."
  [type]
  (malli.registry/schema registry type))

(defn -with-doc
  "Add a `:doc/message` option to a `schema`. Tries to merge it in existing vector schemas to avoid unnecessary
  indirection."
  [schema docstring]
  (cond
    (and (vector? schema)
         (map? (second schema)))
    (let [[tag opts & args] schema]
      (into [tag (assoc opts :doc/message docstring)] args))

    (vector? schema)
    (let [[tag & args] schema]
      (into [tag {:doc/message docstring}] args))

    :else
    [:schema {:doc/message docstring} schema]))

#?(:clj
   (defmacro def
     "Like [[clojure.spec.alpha/def]]; add a Malli schema to our registry."
     ([type schema]
      `(register! ~type ~schema))
     ([type docstring schema]
      `(metabase.util.malli.registry/def ~type
         (-with-doc ~schema ~docstring)))))

(defn resolve-schema
  "For REPL/test usage: get the definition of a registered schema from the registry."
  [schema]
  (mc/deref-all (mc/schema schema)))
