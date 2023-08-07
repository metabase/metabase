(ns metabase.util.malli.registry
  (:refer-clojure :exclude [declare def])
  (:require
   [malli.core :as mc]
   [malli.registry]
   [malli.util :as mut]
   #?@(:clj ([malli.experimental.time :as malli.time])))
  #?(:cljs (:require-macros [metabase.util.malli.registry])))

(defonce ^:private cache (atom {}))

(defn- cached [k schema value-thunk]
  (or (get-in @cache [k schema])
      (let [v (value-thunk)]
        (swap! cache assoc-in [k schema] v)
        v)))

(defn explainer
  "Fetch a cached [[mc/explainer]] for `schema`, creating one if needed. The cache is flushed whenever the registry
  changes."
  [schema]
  (cached :explainer schema #_{:clj-kondo/ignore [:discouraged-var]} #(mc/explainer schema)))

(defn explain
  "[[mc/explain]], but uses a cached explainer from [[explainer]]."
  [schema value]
  ((explainer schema) value))

(defn validator
  "Fetch a cached [[mc/validator]] for `schema`, creating one if needed. The cache is flushed whenever the registry
  changes."
  [schema]
  (cached :validator schema #(mc/validator schema)))

(defn validate
  "[[mc/validate]], but uses a cached validator from [[validator]]."
  [schema value]
  ((validator schema) value))

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

#?(:clj
   (defmacro def
     "Like [[clojure.spec.alpha/def]]; add a Malli schema to our registry."
     [type schema]
     `(register! ~type ~schema)))

(defn resolve-schema
  "For REPL/test usage: get the definition of a registered schema from the registry."
  [schema]
  (mc/deref-all (mc/schema schema)))
