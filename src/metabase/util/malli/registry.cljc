(ns metabase.util.malli.registry
  (:refer-clojure :exclude [declare def])
  (:require
   #?@(:clj ([malli.experimental.time :as malli.time]
             [net.cgrand.macrovich :as macros]))
   [clojure.walk :as walk]
   [malli.core :as mc]
   [malli.registry]
   [malli.util :as mut])
  #?(:cljs (:require-macros [metabase.util.malli.registry])))

(defonce ^:private cache (atom {}))

(defn- schema-cache-key
  "Make schemas that aren't `=` to identical ones e.g.
    [:re #\"\\d{4}\"]
    [:or [:re #\"\\d{4}\"] :int]
    [:fn even?]
    (mr/with-key [:fn (constantly true)])

  work correctly as cache keys instead of creating new entries every time the code is evaluated."
  [x]
  (or (some-> x meta ::key)
      (walk/postwalk
       (fn [x]
         (cond
           (instance? #?(:clj java.util.regex.Pattern
                         :cljs js/RegExp) x) (str x)
           ;; Attach a cache key to any naughty object in a schema, and it'll be used
           ;; to calculate the cache-key for that part.
           (some-> x meta ::key) (-> x meta ::key)
           ;; TODO: This does not work for h.o.f. like (every-pred even? odd?),
           ;; (pr-str (every-pred even? odd?)) == (pr-str (every-pred string?))
           ;; (fn? x) (pr-str x)
           :else x))
       x)))

(defn- stabilize-reader-fn-args
  "Calling with-key on a reader-macro generated function will cause it to have
  gensym'd arguments

  Using this gives us this property in with-key:

  (= (::key (meta (with-key #(+ 1 %))))
     (::key (meta (with-key #(+ 1 %)))))
  ;; => true
  "
  [form]
  (let [arguments (set (remove #{'&} (second form)))
        replacements '[a b c d e f g h i j k l m n o p q r s t u v w x y z]
        _ (when (> (count arguments) (count replacements))
            (throw (ex-info (str
                             "Not enough replacements for arguments in fn* form. Do you mean to use more than "
                             (count replacements)
                             " arguments to your reader-macro-function?")
                            {:form form
                             :arguments arguments
                             :replacements replacements})))
        argument-replacement (zipmap arguments replacements)]
    (walk/postwalk
     (fn [x] (if-let [new (argument-replacement x)] new x))
     form)))

(defn- fn-form-generated-by-reader-macro? [form]
  (and (coll? form)
       (= 'fn* (first form))))

(defn- stabilize-schema-fn-args
  [form]
  (walk/postwalk
   (fn [frm] (if (fn-form-generated-by-reader-macro? frm)
               (stabilize-reader-fn-args frm)
               frm))
   form))

(defn- enforce-key-idempotency
  "Wrapping a schema with [[with-key]] multiple times should be idempotent, so this function
  removes extra wrapping(s) from a schema form, so that it can be used as a cache key."
  [form]
  (let [wrapping-forms #{'with-key 'mr/with-key 'metabase.util.malli.registry/with-key}]
    (loop [frm form]
      (if (and (coll? frm)
               (wrapping-forms (first frm)))
        (recur (second frm))
        frm))))

(defmacro with-key
  "Adds `::mr/key` metadata, which is a pr-str'd string of body, to body. Be careful not to call this
  on functions taking parameters, since it uses the shape of the literal body passed to it as a key.
  e.g.:
    (defn my-schema [] :int)
    (mr/with-key (my-schema))
    If you change `my-schema` to return `:keyword` here, the cache will not invalidate properly."
  [body]
  `(try (with-meta ~body
                   (assoc (meta ~body) ::key ~(-> body
                                                  enforce-key-idempotency
                                                  stabilize-schema-fn-args
                                                  pr-str)))
        (catch Exception _# ~body)))

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
    (or (get (get @cache k) schema-key)     ; get-in is terribly inefficient
        (let [v (value-thunk)]
          (when *cache-miss-hook* (*cache-miss-hook* k schema v))
          (swap! cache assoc-in [k schema-key] v)
          v))))

(defn validator
  "Fetch a cached [[mc/validator]] for `schema`, creating one if needed. The cache is flushed whenever the registry
  changes."
  [schema]
  (letfn [(make-validator []
            (try
              #_{:clj-kondo/ignore [:discouraged-var]}
              (mc/validator schema)
              (catch #?(:clj Throwable :cljs :default) e
                (throw (ex-info (str "Error making validator for " (pr-str schema) ":" (ex-message e))
                                {:schema schema}
                                e)))))]
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
              (let [validator* (mc/validator schema)
                    explainer* (mc/explainer schema)]
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
      `(register! ~type (with-key ~schema)))
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
