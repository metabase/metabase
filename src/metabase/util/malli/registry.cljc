(ns metabase.util.malli.registry
  (:refer-clojure :exclude [declare def])
  (:require
   #?(:clj [metabase.config.core :as config])
   #?@(:clj ([malli.experimental.time :as malli.time]
             [metabase.util.malli.registry.validator-cache :as mr.validator-cache]
             [net.cgrand.macrovich :as macros]))
   [clojure.walk :as walk]
   [malli.core :as mc]
   [malli.registry]
   [malli.util :as mut]
   [metabase.util.malli.error :as mu.error])
  #?(:cljs (:require-macros [metabase.util.malli.registry])))

(defonce ^:private cache (atom {}))

(def ^:private cacheable-fn-set
  (into #{} (filter fn?) (keys (mc/default-schemas))))

(defn cacheable-fn?
  "Only the functions installed in the default malli registry should be allowed.
  All other fn objects are illegal because they may not be cacheable."
  [f]
  (contains? cacheable-fn-set f))

;; DEBUG nocommit
(defonce counter (atom {}))
(defn add-counter! [form schema ec]
  (swap! counter update schema
         (fn [erorrs]
           (conj (or erorrs []) {:form form :error-context ec}))))

(comment
  (require '[metabase.util.malli.schema :as ms])
  (import '(java.sql Connection))
  (reset! counter {})

  (map second (take 20 (sort-by (fn [[_ v]] (count v))
                                @counter)))

  (schema-cache-key
   [:or (ms/InstanceOf :model/Card)])

  (schema-cache-key
   (ms/InstanceOfClass Integer))

  [(schema-cache-key [:fn #(odd? %)])]

  (schema-cache-key [:or [:fn {:mr/cache-key "my odd"} #(odd? %)]])
  ;; => [:or "my odd"]

  (schema-cache-key [:or [:fn #(odd? %)]])
  ;; => :metabase.util.malli.registry/uncachable
  )
(defn- schema-cache-key*
  "Make schemas that aren't `=` to identical ones e.g.

    [:re #\"\\d{4}\"]
    [:or :int [:re #\"\\d{4}\"]]

  work correctly as cache keys instead of creating new entries every time the code is evaluated.

  Also able to handle certain schemas with functions that are known to be cachable. For example, ms/InstanceOf.
  "
  [x]
  (let [cacheable?* (atom :cache-ok)
        walked (walk/prewalk
                (fn [form]
                  ;;(prn ["saw" form])
                  (cond
                    ;; stringify regexes
                    (instance? #?(:clj java.util.regex.Pattern :cljs js/RegExp) form)
                    (str form)

                    ;; some functions are ok, they are in the default schemas:
                    (and (fn? form) (cacheable-fn? form))
                    form

                    ;; short circuit if given a cache-key as data
                    (and (vector? form)
                         (:mr/cache-key (second form)))
                    (:mr/cache-key (second form))

                    ;; cache-key lookup in a schema
                    (and (= :malli.core/schema (type form))
                         (let [schema-form (mc/form form)]
                           (and (vector? schema-form)
                                (:mr/cache-key (second schema-form)))))
                    ;; TODO: better-cond
                    [(first (mc/form form))
                     (:mr/cache-key (second (mc/form form)))]

                    ;; postwalk will never visit functions in schemas with the `mr/key-cache` property.
                    (and (fn? form) (not (cacheable-fn? form)))
                    (do
                      ;;(prn ["wtf" form])
                      (when config/is-dev?
                        ;; TODO: throw here
                        #_(user/log :cache_fn_problems (merge {:bad-fn form :schema x} (when-let [ec mu.error/*context*] {:error-context ec})))
                        (add-counter! form x mu.error/*context*))
                      (reset! cacheable?* ::uncachable))

                    :else form))
                x)]
    [@cacheable?* walked]))

(defn- schema-cache-key [x]
  (let [[cacheability the-key] (schema-cache-key* x)]
    (if (= cacheability ::uncachable) ::uncachable the-key)))

(def ^:dynamic *cache-miss-hook*
  "A hook that is called whenever there is a cache miss, for side effects.
  This is used in tests or to monitor cache misses."
  ;; (fn [_k _schema _value] nil)
  nil)

(defn cached
  "Get a cached value for `k` + `schema`. Cache is cleared whenever a schema is (re)defined
  with [[metabase.util.malli.registry/def]]. If value doesn't exist, `value-thunk` is used to calculate (and cache)
  it.

  You generally shouldn't use this outside of this namespace unless you have a really good reason to do so! Make sure
  you used namespaced keys if you are using it elsewhere."
  [k schema value-thunk]
  (let [schema-key (schema-cache-key schema)]
    (if (= schema-key ::uncachable)
      ;; Do not cache uncachable entities.
      ;; In dev this should cause a big error.
      (value-thunk)
      (or (get (get @cache k) schema-key)     ; get-in is terribly inefficient
          (let [v (value-thunk)]
            (when *cache-miss-hook*
              (*cache-miss-hook* k schema v))
            (swap! cache assoc-in [k schema-key] v)
            v)))))

(defn validator
  "Fetch a cached [[mc/validator]] for `schema`, creating one if needed. The cache is flushed whenever the registry
  changes."
  [schema]
  (letfn [(make-validator* []
            (try
              #_{:clj-kondo/ignore [:discouraged-var]}
              (mc/validator schema)
              (catch #?(:clj Throwable :cljs :default) e
                (throw (ex-info (str "Error making validator for " (pr-str schema) ":" (ex-message e))
                                {:schema schema}
                                e)))))
          (make-validator []
            (let [validator (make-validator*)]
              ;; Only memoize in tests/dev for now, in prod validation is mostly disabled and this stuff is fairly
              ;; experimental, and we don't want to blow up instances because of the increased memory usage. Once it
              ;; bakes a bit we can see whether it's useful to enable it in prod
              #?(:clj  (if config/is-prod?
                         validator
                         (mr.validator-cache/memoized-validator validator))
                 :cljs validator)))]
    (cached :validator schema make-validator)))

(defn validate
  "[[mc/validate]], but uses a cached validator from [[validator]]."
  [schema value]
  ((validator schema) value))

(defn explainer
  "Fetch a cached [[mc/explainer]] for `schema`, creating one if needed. The cache is flushed whenever the registry
  changes."
  [schema]
  (letfn [(make-explainer []
            (try
              #_{:clj-kondo/ignore [:discouraged-var]}
              (let [validator* (validator schema)
                    explainer* (delay (mc/explainer schema))]
                ;; for valid values, it's significantly faster to just call the validator. Let's optimize for the 99.9%
                ;; of calls whose values are valid.
                (fn schema-explainer [value]
                  (when-not (validator* value)
                    (@explainer* value))))
              (catch #?(:clj Throwable :cljs :default) e
                (throw (ex-info (str "Error making explainer for " (pr-str schema) ":" (ex-message e))
                                {:schema schema}
                                e)))))]
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

(defn registered-schema
  "Get the schema registered for `k`, if any."
  [k]
  (get @registry* k))

(defn schema
  "Get the Malli schema for `type` from the registry."
  [type]
  (malli.registry/schema registry type))

;;; TODO -- we should change `:doc/message` to `:description` so it's inline
;;; with [[metabase.util.malli.describe/describe]] and [[malli.experimental.describe/describe]]
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
      `(metabase.util.malli.registry/def ~type
         ~(macros/case
           :clj `(-with-doc ~schema ~docstring)
           ;; Ignore docstring for CLJS.
           :cljs schema)))))

(defn- deref-all-preserving-properties
  "Like [[mc/deref-all]] but preserves properties attached to a `:ref` by wrapping the result in `:schema`."
  [schema]
  (letfn [(with-properties [schema properties]
            (-> schema
                (mc/-set-properties (merge (mc/properties schema) properties))))
          (deref* [schema]
            (let [dereffed   (-> schema mc/deref deref-all-preserving-properties)
                  properties (mc/properties schema)]
              (cond-> dereffed
                (seq properties) (with-properties properties))))]
    (cond-> schema
      (mc/-ref-schema? schema) deref*)))

(defn resolve-schema
  "For REPL/test/documentation generation usage: get the definition of a registered schema from the registry.
  Recursively resolves the top-level schema (e.g. a `:ref` to another `:ref`), but does not recursively resolve
  children of the schema e.g. the value schemas for a `:map`.

  I was going to use [[mc/deref-recursive]] here but it tosses out properties attached to `:ref`s or `:schemas` which
  are sorta important when they contain stuff like `:description` -- so this version uses the
  custom [[deref-all-preserving-properties]] function above which merges them in. -- Cam"
  [schema]
  (let [schema (-> schema mc/schema deref-all-preserving-properties)]
    (mc/walk schema
             (fn [schema _path children _options]
               (cond (= (mc/type schema) :ref)
                     schema

                     (mc/-ref-schema? schema)
                     (deref-all-preserving-properties (mc/-set-children schema children))

                     :else
                     (mc/-set-children schema children)))
             ;; not sure this option is really needed, but [[mc/deref-recursive]] sets it... turning it off doesn't
             ;; seem to make any of our tests fail so maybe I'm not capturing something
             {::mc/walk-schema-refs true})))
