(ns metabase.util.malli.registry
  (:refer-clojure :exclude [declare def])
  (:require
   #?@(:clj ([malli.experimental.time :as malli.time]
             [net.cgrand.macrovich :as macros])) ;; TODO: consider using a ttl cache incase any bad schemas start slipping through? [clojure.core.cache :as cache]
   [clojure.string :as str]
   [clojure.walk :as walk]
   [malli.core :as mc]
   [malli.registry]
   [malli.util :as mut]
   [metabase.config.core :as config]
   [metabase.util.log :as log])
  #?(:cljs (:require-macros [metabase.util.malli.registry])))

(defonce
  ^{:private true
    :doc "Has the form:
          {[k cache-key] function}
          Example:
          {[:validator ::my/int] \"#function[clojure.core/int]\"}"}
  cache (atom {}))

(defn- schema-cache-key
  "Make schemas that aren't `=` to identical ones e.g.

    [:re #\"\\d{4}\"]
    [:or [:re #\"\\d{4}\"] :int]
    [:fn (constantly true)]
    [:fn even?]

  work correctly as cache keys instead of creating new entries every time the code is evaluated.

  Also handles functions to prevent cache key instability from composed/anonymous functions.

  ;; both are anti-patterns and will throw:
  (let [my-fn (constantly 3)]
    (schema-cache-key [:fn my-fn]))

  (let [my-fn (constantly 3)]
    (schema-cache-key (with-key my-fn)))"
  [cache-keyable]
  (or
   (some-> cache-keyable meta ::key)
   (walk/postwalk
    (fn [x]
      (if #?(:clj (instance? java.util.regex.Pattern x)
             :cljs (instance? js/RegExp x)) (str x)
          (let [meta-key (some-> x meta ::key)
                _ (when (and (not config/is-prod?)
                             meta-key
                             (not (#{"(" "["} (str (first meta-key)))))
                    (log/info
                     (str/join ["Schema cache key forms (not their values per se) must be wrapped with [[mu/with-key]] to ensure stability."
                                "If you are using a derived schema, either wrap the form in the generation function, "
                                "or a macro with [[mu/with-key]] to wrap the schema form itself."
                                (pr-str {::error "iono" :meta-key meta-key :schema x})])))]
            (if meta-key meta-key
                (if (fn? x)
                  (do
                    (log/info (str "function schemas must be wrapped with [[mu/with-key]], see the docstring for more info.\n"
                                   (pr-str {::error "function without key" :schema x})))
                    x)
                  x)))))
    cache-keyable)))

(defmacro with-key
  "Adds `::mr/key` metadata, which is a pr-str'd string of body, to body. Be careful not to call this
  on functions taking parameters, since it uses the shape of the literal body passed to it as a key.

  e.g.:
    (defn my-schema [] :int)
    (mr/with-key (my-schema))
    If you change `my-schema` to return `:keyword` here, the cache will not invalidate properly.

  All functions that are used with mr/validate, mu/defn, and defendpoint need their function schema _forms_ wrapped with
  this macro."
  [body]
  `(try
     (with-meta ~body (merge (meta ~body) {::key ~(pr-str body)}))
     (catch Exception _# ~body)))

(defmacro stable-key?
  "Evaluates the schema form twice, and if the results are not equal, it is not usable as a cache key."
  [schema]
  `(let [computed-schema# (#'schema-cache-key ~schema)]
     (if (= computed-schema#
            (#'schema-cache-key ~schema))
       computed-schema#
       false)))

(def ^{:dynamic true
       :doc "A hook that is called whenever the cache is updated, for side effects.
             This is used in tests or to log cache updates."}
  *cache-miss-hook* (fn [_k _schema _value-thunk] nil))

(binding [*cache-miss-hook* (fn [k schema value-thunk]
                              (log/info (str "Cache miss for " (pr-str k) " with schema " (pr-str schema)
                                             ". Calculating value with " (pr-str value-thunk) ".")))]
  (defn cached
    "Get a cached value for `k` + `schema`. Cache is cleared whenever a schema is (re)defined
  with [[metabase.util.malli.registry/def]]. If value doesn't exist, `value-thunk` is used to calculate (and cache)
  it.

  You generally shouldn't use this outside of this namespace unless you have a really good reason to do so! Make sure
  you used namespaced keys if you are using it elsewhere."
    [k schema value-thunk]
    (let [schema-key (schema-cache-key schema)]
      (or (get @cache [k schema-key])
          (do (*cache-miss-hook* k schema value-thunk) false)
          (let [v (value-thunk)]
            (swap! cache assoc [k schema-key] v)
            v)))))

(defn cache-size-info
  "Return information about the current cache size and structure for debugging memory issues."
  [cache-val]
  (let [total-entries (count cache-val)
        by-type (->> (group-by (fn [[k _]] (first k)) cache-val)
                     (mapv (fn [[k v]]
                             [k (count v)]))
                     (into {}))]
    {:total-cache-entries total-entries
     :entries-by-type by-type}))

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
  ;; TODO: Fixme cache fix prereq
  ;; (reset! cache {})
  nil)

(defn registered-schema
  "Get the schema registered for `k`, if any."
  [k]
  (get @registry* k))

(defn schema
  "Get the Malli schema for `type` from the registry."
  [type]
  (malli.registry/schema registry type))

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
            (let [dereffed (-> schema mc/deref deref-all-preserving-properties)
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

(comment

  (count @cache)

  ;; inspect cache keys:
  ;; (map (comp schema-cache-key second) (keys @cache))
  )
