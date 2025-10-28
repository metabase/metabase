(ns representations.util.malli.registry
  (:refer-clojure :exclude [declare def])
  (:require
   #?@(:clj ([malli.experimental.time :as malli.time]
             [net.cgrand.macrovich :as macros]))
   [clojure.walk :as walk]
   [malli.core :as mc]
   [malli.registry]
   [malli.util :as mut])
  #?(:cljs (:require-macros [representations.util.malli.registry])))

(defonce ^:private cache (atom {}))

(defonce ^:private registry*
  (atom (merge (mc/default-schemas)
               (mut/schemas)
               #?(:clj (malli.time/schemas)))))

(defonce registry (malli.registry/mutable-registry registry*))

(defn register!
  "Register a spec with our Malli spec registry."
  [schema definition]
  (swap! registry* assoc schema definition)
  (reset! cache {})
  nil)

(defn -with-doc
  "Add a `:description` option to a `schema`. Tries to merge it in existing vector schemas to avoid unnecessary
  indirection."
  [schema docstring]
  (cond
    (and (vector? schema)
         (map? (second schema)))
    (let [[tag opts & args] schema]
      (into [tag (merge {:description docstring} opts)] args))

    (vector? schema)
    (let [[tag & args] schema]
      (into [tag {:description docstring}] args))

    :else
    [:schema {:description docstring} schema]))

#?(:clj
   (defmacro def
     "Like [[clojure.spec.alpha/def]]; add a Malli schema to our registry."
     ([type schema]
      `(register! ~type ~schema))
     ([type docstring schema]
      (assert (string? docstring))
      `(representations.util.malli.registry/def ~type
         ~(macros/case
           :clj `(-with-doc ~schema ~docstring)
           ;; Ignore docstring for CLJS.
           :cljs schema)))))

(def ^:dynamic *cache-miss-hook*
  "A hook that is called whenever there is a cache miss, for side effects.
  This is used in tests or to monitor cache misses."
  ;; (fn [_k _schema _value] nil)
  nil)

(defn- schema-cache-key
  "Make schemas that aren't `=` to identical ones e.g.

    [:re #\"\\d{4}\"]
    [:or :int [:re #\"\\d{4}\"]]

  work correctly as cache keys instead of creating new entries every time the code is evaluated."
  [x]
  (walk/postwalk
   (fn [form]
     (cond-> form
       (instance? #?(:clj java.util.regex.Pattern :cljs js/RegExp) form)
       str))
   x))

(defn cached
  "Get a cached value for `k` + `schema`. Cache is cleared whenever a schema is (re)defined
  with [representations.util.malli.registry/def]]. If value doesn't exist, `value-thunk` is used to calculate (and cache)
  it.

  You generally shouldn't use this outside of this namespace unless you have a really good reason to do so! Make sure
  you used namespaced keys if you are using it elsewhere."
  [k schema value-thunk]
  (let [schema-key (schema-cache-key schema)]
    (or (get (get @cache k) schema-key)     ; get-in is terribly inefficient
        (let [v (value-thunk)]
          (when *cache-miss-hook*
            (*cache-miss-hook* k schema v))
          (swap! cache assoc-in [k schema-key] v)
          v))))

(defn validator
  "Fetch a cached [[mc/validator]] for `schema`, creating one if needed. The cache is flushed whenever the registry
  changes."
  [schema]
  (letfn [(make-validator* []
            (try
              (mc/validator schema {:registry registry})
              (catch #?(:clj Throwable :cljs :default) e
                (throw (ex-info (str "Error making validator for " (pr-str schema) ":" (ex-message e))
                                {:schema schema}
                                e)))))
          (make-validator []
            (let [validator (make-validator*)]
              ;; Only memoize in tests/dev for now, in prod validation is mostly disabled and this stuff is fairly
              ;; experimental, and we don't want to blow up instances because of the increased memory usage. Once it
              ;; bakes a bit we can see whether it's useful to enable it in prod
              #?(:clj  validator
                 :cljs validator)))]
    (cached :validator schema make-validator)))

(defn explainer
  "Fetch a cached [[mc/explainer]] for `schema`, creating one if needed. The cache is flushed whenever the registry
  changes."
  [schema]
  (letfn [(make-explainer []
            (try
              (let [validator* (validator schema)
                    explainer* (mc/explainer schema {:registry registry})]
                ;; for valid values, it's significantly faster to just call the validator. Let's optimize for the 99.9%
                ;; of calls whose values are valid.
                (fn schema-explainer [value]
                  (when-not (validator* value)
                    (explainer* value))))
              (catch #?(:clj Throwable :cljs :default) e
                (throw (ex-info (str "Error making explainer for " (pr-str schema) ":" (ex-message e))
                                {:schema schema}
                                e)))))]
    (cached :explainer schema make-explainer)))

(defn explain
  "[[mc/explain]], but uses a cached explainer from [[explainer]]."
  [schema value]
  ((explainer schema) value))
