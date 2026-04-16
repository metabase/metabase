(ns metabase.util.malli.registry
  (:refer-clojure :exclude [declare def])
  (:require
   #?(:clj [metabase.config.core :as config])
   #?@(:clj ([malli.experimental.time :as malli.time]
             [metabase.util.malli.registry.validator-cache :as mr.validator-cache]
             [net.cgrand.macrovich :as macros]))
   [malli.core :as mc]
   [malli.registry]
   [malli.util :as mut]
   [metabase.util.performance :refer [postwalk]])
  #?(:cljs (:require-macros [metabase.util.malli.registry])))

(defonce ^:private cache (atom {}))

(defn- schema-cache-key
  "Make schemas that aren't `=` to identical ones e.g.

    [:re #\"\\d{4}\"]
    [:or :int [:re #\"\\d{4}\"]]

  work correctly as cache keys instead of creating new entries every time the code is evaluated."
  [x]
  (postwalk
   (fn [form]
     (cond-> form
       (instance? #?(:clj java.util.regex.Pattern :cljs js/RegExp) form)
       str))
   x))

(def ^:dynamic *cache-miss-hook*
  "A hook that is called whenever there is a cache miss, for side effects.
  This is used in tests or to monitor cache misses."
  ;; (fn [_k _schema _value] nil)
  nil)

(defn- deref-entry [ref-box value-thunk]
  #?(:clj  (or (.get ^java.lang.ref.SoftReference @ref-box)
               (let [v        (value-thunk)
                     soft-ref (java.lang.ref.SoftReference. v)]
                 (vreset! ref-box soft-ref)
                 v))
     :cljs (or (.deref @ref-box)
               (let [v        (value-thunk)
                     weak-ref (js/WeakRef. v)]
                 (vreset! ref-box weak-ref)
                 v))))

(defn- cache-entry [value]
  #?(:clj  (volatile! (java.lang.ref.SoftReference. value))
     :cljs (volatile! (js/WeakRef. value))))

(defn cached
  "Get a cached value for `k` + `schema`. Cache is cleared whenever a schema is (re)defined
  with [[metabase.util.malli.registry/def]]. If value doesn't exist, `value-thunk` is used to calculate (and cache)
  it.

  You generally shouldn't use this outside of this namespace unless you have a really good reason to do so! Make sure
  you used namespaced keys if you are using it elsewhere."
  [k schema value-thunk]
  (let [schema-key (schema-cache-key schema)]
    (or (some-> (get (get @cache k) schema-key) (deref-entry value-thunk)) ; get-in is terribly inefficient
        (let [v (value-thunk)]
          (when *cache-miss-hook*
            (*cache-miss-hook* k schema v))
          (swap! cache assoc-in [k schema-key] (cache-entry v))
          v))))

(defn- cached-schema [schema]
  (if (mc/-reference? schema)
    (cached :ref schema #(mc/-into-schema (mc/-ref-schema) {} [schema] {}))
    (cached :schema schema #(mc/schema schema))))

(defn validator
  "Fetch a cached [[mc/validator]] for `schema`, creating one if needed. The cache is flushed whenever the registry
  changes."
  [schema]
  (letfn [(make-validator* []
            (try
              #_{:clj-kondo/ignore [:discouraged-var]}
              (mc/validator (cached-schema schema))
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
                    explainer* (mc/explainer (cached-schema schema))]
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

(defn- cached-ref-schema
  "Malli (as of 0.2.0) will re-allocate a specialised Schema object for a reference site
   as well as the referent's Schema each time it is referenced.

  The unique Schema object for the referent will then go on and re-allocate again for nested references,
  In malli 0.2.0 this can go on forever at runtime, resembling a memory leak.
  Even without significant runtime value complexity this very quickly leads to large heap memory usage
  as we retain validator roots in our cache.

  This custom :ref implementation dramatically reduces memory usage and OOM likely-hood:

  We allow references to reuse a cached Schema object if the following conditions hold:

  a. The registry is identical to the default, we refer to the same Schema object each time
  b. The reference itself has no attributes that specialise it (such as documentation).

  This means that most refs in our schemas will incur a pointer-like incremental cost,
  rather than an inlining-the-whole-subgraph type exponential cost.

  NOTE: At time of writing work is ongoing in malli to introduce knot-ties to validators/transformers.
  However, it appears we still see exponential memory scaling without this [[cached-ref-schema]] fix.
  We should revisit the need for this override with newer versions of malli."
  ([]
   (cached-ref-schema nil))
  ([{:keys [type-properties]}]
   (reify
     mc/AST
     (-from-ast [parent ast options] (mc/-from-value-ast parent ast options))
     mc/IntoSchema
     (-type [_] :ref)
     (-type-properties [_] type-properties)
     (-into-schema [_ properties [ref :as children] options]
       (mc/-check-children! :ref properties children 1 1)
       (when-not (mc/-reference? ref)
         (mc/-fail! ::mc/invalid-ref {:ref ref}))
       (let [reg (mc/-registry options)]
         ;; we only want to use our cache if this reference is equivalent to any other i,e:
         ;; - it must be placed in a context where the default registry is used.
         ;;   (otherwise it might share a name with the globally registered schema but reference a different schema)
         ;; - it cannot have any properties that specialise the reference.
         (if (and (identical? reg mc/default-registry) (empty? properties))
           (cached :ref ref #(mc/-into-schema (mc/-ref-schema) {} children options))
           (mc/-into-schema (mc/-ref-schema) properties children options))))
     #?@(:cljs [IPrintWithWriter (-pr-writer [this writer opts] (mc/pr-writer-into-schema this writer opts))]))))

(defonce ^:private registry*
  (atom (merge (mc/default-schemas)
               {:ref (cached-ref-schema)}
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
