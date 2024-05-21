(ns metabase.xrays.domain-entities.malli
  (:refer-clojure :exclude [defn])
  (:require
    [malli.instrument]
    [net.cgrand.macrovich :as macros]))

(defmacro -define-getter
  "Generates an accessor, given the symbol and path to the value."
  [sym path]
  `(clojure.core/defn ~(vary-meta sym assoc :export true)
     ~(str "Accessor for `" path "`.")
     [obj#]
     (get-in obj# ~path)))

(defmacro -define-converter
  "Incoming converter for the replacement value. `identity` in CLJ."
  [schema path in-sym]
  `(def ~in-sym
     ~(macros/case
        :cljs `(-> ~schema
                   (metabase.xrays.domain-entities.malli/schema-for-path ~path)
                   metabase.xrays.domain-entities.converters/incoming)
        :clj  `identity)))

(defmacro -define-setter
  "Generates a setter. Prefixes the symbol with `with-`, ie. `with-foo-bar`.
  `in-sym` is the name of the incoming converter defined by [[-define-converter]].
  Calls that converter on the new value before `assoc`ing it in."
  [sym path in-sym]
  `(clojure.core/defn ~(vary-meta (symbol (str "with-" (name sym)))
                                  assoc :export true)
     ~(str "Updater for `" path "`.")
     [obj# new-value#]
     (assoc-in obj# ~path (~in-sym new-value#))))

(defmacro -define-js-converter
  "Generates the outgoing converter from CLJS data structures to vanilla JS objects.
  Generates nothing in CLJ mode."
  [schema path out-sym]
  (macros/case
    :cljs `(def ~out-sym
             (metabase.xrays.domain-entities.converters/outgoing
               (metabase.xrays.domain-entities.malli/schema-for-path ~schema ~path)))))

(defmacro -define-js-returning-getter
  "Generates a getter that converts back to a JS object, in CLJS.
  Generates nothing in CLJ.
  `sym` is the main symbol, eg. `foo-bar`. `out-sym` is the outgoing converter defined by
  [[-define-js-converter]], eg. `foo-bar->`."
  [sym path out-sym]
  (macros/case
    :cljs `(clojure.core/defn ~(vary-meta (symbol (str (name sym) "-js"))
                                          assoc :export true)
             ~(str "Fetches `" path "` and converts it to plain JS.")
             [obj#]
             (~out-sym (~sym obj#)))))

(defmacro -define-getter-and-setter
  "Generates the getter, setter and necessary JS<->CLJS converters for a single `sym` and `path` pair.

  In CLJ, this generates the getter, setter and a dummy incoming converter that is just `identity`.

  In CLJS, generates the getter and setter, real converters in both directions, and a getter that returns
  vanilla JS objects instead of CLJS data."
  [schema sym path]
  (let [in-sym  (vary-meta (symbol (str "->" (name sym)))
                           assoc :private true)
        out-sym (vary-meta (symbol (str (name sym) "->"))
                           assoc :private true)]
    `(do
       (-define-getter ~sym ~path)
       (-define-converter ~schema ~path ~in-sym)
       (-define-setter ~sym ~path ~in-sym)
       (-define-js-converter ~schema ~path ~out-sym)
       (-define-js-returning-getter ~sym ~path ~out-sym))))

(defmacro define-getters-and-setters
  "Generates an accessor (`get-in`) and updater (`assoc-in`) for each specified path.

  For example:
  ```
  (define-getters-and-setters Question
    dataset-query [:card :dataset-query]
    cache-ttl     [:card :cache-ttl])
  ```
  will generate:
  ```
  (mu/defn ^:export dataset-query :- DatasetQuery
    \"Accessor for [:card :dataset-query].\"
    [obj :- Question]
    (get-in obj [:card :dataset-query]))

  ;; This converter is always defined, but it's `identity` in CLJ.
  ;; Note that it's safe to call these converters even if the incoming data is already CLJS.
  ;; This is what's generated in CLJS:
  (def ^:private ->dataset-query
    (converters/incoming DatasetQuery))

  (mu/defn ^:export with-dataset-query :- Question
    \"Updater for [:card :dataset-query].\"
    [obj :- Question new-value :- DatasetQuery]
    (assoc-in obj [:card :dataset-query] (->dataset-query new-value)))

  ;; This converter is only generated in CLJS.
  (def ^:private dataset-query->
    (converters/outgoing Question))

  ;; This function is also only generated in CLJS.
  (mu/defn ^:export dataset-query-js :- :any
    \"Fetches `[:card :dataset-query]` and converts it to plain JS.\"
    [obj :- Question]
    (dataset-query-> (dataset-query obj)))

  ;; ... and the same five things generated for cache-ttl and any other args.
  ```

  You provide the schema for the parent object; the macro will examine that schema to determine the
  schema for the field being fetched or updated. The updater's name gets prefixed with `with-`, and the
  JS-returning getter suffixed with `-js`.

  The converters are private and intended to be internal to the macros. Since they only depend on the
  schema it's more efficient to compute them once and reuse them."
  [schema sym path & more]
  `(do
     (-define-getter-and-setter ~schema ~sym ~path)
     ~(when (seq more)
        `(define-getters-and-setters ~schema ~@more))))
