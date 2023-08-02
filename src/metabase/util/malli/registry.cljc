(ns metabase.util.malli.registry
  (:refer-clojure :exclude [def])
  (:require
   [malli.core :as mc]
   [malli.registry :as mr]
   [malli.util :as mut]
   #?@(:clj ([malli.experimental.time :as malli.time])))
  #?(:cljs (:require-macros [metabase.util.malli.registry])))

(defonce ^:private explainer-cache
  (atom {}))

(defn explainer
  "Fetch a cached [[mc/explainer]] for `schema`, creating one if needed. The cache is flushed whenever the registry
  changes."
  [schema]
  (or (get @explainer-cache schema)
      (let [explainer (mc/explainer schema)]
        (swap! explainer-cache assoc schema explainer)
        explainer)))

(defn explain
  "[[mc/explain]], but uses a cached explainer from [[explainer]]."
  [schema value]
  ((explainer schema) value))

(defonce ^:private registry*
  (atom (merge (mc/default-schemas)
               (mut/schemas)
               #?(:clj (malli.time/schemas)))))

(defonce ^:private registry (mr/mutable-registry registry*))

(mr/set-default-registry! registry)

(defn register!
  "Register a spec with our Malli spec "
  [type schema]
  (swap! registry* assoc type schema)
  (reset! explainer-cache {})
  nil)

#?(:clj
   (defmacro def
     "Like [[clojure.spec.alpha/def]]; add a Malli schema to our registry."
     [type schema]
     `(register! ~type ~schema)))

(defn resolve-schema
  "For REPL/test usage: get the definition of a registered schema from the registry."
  [k]
  {:pre [(keyword? k)]}
  (mr/schema registry k))
