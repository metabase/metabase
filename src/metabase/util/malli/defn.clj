(ns metabase.util.malli.defn
  (:refer-clojure :exclude [defn defn-])
  (:require
   [clojure.core :as core]
   [clojure.string :as str]
   [malli.core :as mc]
   [malli.destructure]
   [metabase.util :as u]
   [metabase.util.malli.fn :as mu.fn]
   [metabase.util.malli.registry :as mr]
   [net.cgrand.macrovich :as macros]))

(set! *warn-on-reflection* true)

;;; TODO -- this should generate type hints from the schemas and from the return type as well.
(core/defn- deparameterized-arglist [{:keys [args]}]
  (-> (malli.destructure/parse args)
      :arglist
      (with-meta (macros/case
                   :cljs
                   (meta args)

                   ;; make sure we resolve classnames e.g. `java.sql.Connection` intstead of `Connection`, otherwise the
                   ;; tags won't work if you use them in another namespace that doesn't import that class. (Clj only)
                   :clj
                   (let [args-meta    (meta args)
                         tag          (:tag args-meta)
                         resolved-tag (when (symbol? tag)
                                        (let [resolved (ns-resolve *ns* tag)]
                                          (when (class? resolved)
                                            (symbol (.getName ^Class resolved)))))]
                     (cond-> args-meta
                       resolved-tag (assoc :tag resolved-tag)))))))

(core/defn- deparameterized-arglists [parsed]
  (let [{:keys [arities]} (:values parsed)
        arities-type (:key arities)
        arities-value (:values (:value arities))]
    (case arities-type
      :single   (list (deparameterized-arglist arities-value))
      :multiple (map #(deparameterized-arglist (:values %)) (:arities arities-value)))))

(core/defn- annotated-docstring
  "Generate a docstring with additional information about inputs and return type using a parsed fn tail (as parsed
  by [[mx/SchematizedParams]])."
  [parsed]
  (let [{:keys [doc arities return]} (:values parsed)
        arities-type (:key arities)
        arities-value (:values (:value arities))]
    (str/trim
     (str "Inputs: " (case arities-type
                       :single   (pr-str (:args arities-value))
                       :multiple (str "("
                                      (str/join "\n           "
                                                (map (comp pr-str :args :values)
                                                     (:arities arities-value)))
                                      ")"))
          "\n  Return: " (str/replace (u/pprint-to-str (:schema (:values return) :any))
                                      "\n"
                                      "\n          ")
          (when (not-empty doc)
            (str "\n\n  " doc))))))

(core/defn- schema->jsdoc
  "Convert a Malli schema to a JSDoc/TypeScript type string.
  Returns nil for :any schemas or schemas that can't be converted.

  `visited` is a set of schema references we've already seen to prevent infinite recursion."
  ([schema]
   (schema->jsdoc schema #{}))
  ([schema visited]
   (cond
     (= schema :any) "*"

     ;; Qualified keywords are registry references - try to resolve them
     (and (keyword? schema) (namespace schema))
     (when-not (visited schema)
       (try
         (let [resolved (mr/resolve-schema schema)]
           (schema->jsdoc (mc/form resolved) (conj visited schema)))
         (catch Exception _e
           nil)))

     (keyword? schema)
     (case schema
       :int     "number"
       :string  "string"
       :boolean "boolean"
       :double  "number"
       :float   "number"
       :keyword "string"
       :symbol  "string"
       :uuid    "string"
       :nil     "null"
       nil)

     ;; Handle predicate functions like int?, string?, etc.
     (symbol? schema)
     (let [schema-str (name schema)]
       (when (str/ends-with? schema-str "?")
         (case (subs schema-str 0 (dec (count schema-str)))
           "int"     "number"
           "number"  "number"
           "string"  "string"
           "boolean" "boolean"
           "double"  "number"
           "float"   "number"
           "keyword" "string"
           "symbol"  "string"
           "uuid"    "string"
           "nil"     "null"
           nil)))

     (vector? schema)
     (case (first schema)
       :map
       (let [entries (rest schema)
             ;; Map entries can be [k v] or [k options v] where options is a map
             props (keep (fn [entry]
                           (when (vector? entry)
                             (let [[k maybe-opts maybe-v] entry
                                   ;; If second element is a map, it's options
                                   v (if (map? maybe-opts)
                                       maybe-v
                                       maybe-opts)
                                   k-name (if (keyword? k)
                                            (name k)
                                            (str k))
                                   v-type (schema->jsdoc v visited)]
                               (when v-type
                                 (str k-name ": " v-type)))))
                         entries)]
         (when (seq props)
           (str "{" (str/join ", " props) "}")))

       :vector
       (when-let [item-type (schema->jsdoc (second schema) visited)]
         (str item-type "[]"))

       :sequential
       (when-let [item-type (schema->jsdoc (second schema) visited)]
         (str item-type "[]"))

       :set
       (when-let [item-type (schema->jsdoc (second schema) visited)]
         (str "Set<" item-type ">"))

       :enum
       (let [entries (drop (if (map? (second schema)) 2 1) schema)]
         (str "(" (str/join " | " (map #(str "'" (subs (str %) 1) "'") entries)) ")"))

       :or
       (let [types (keep #(schema->jsdoc % visited) (rest schema))]
         (when (seq types)
           (str/join " | " types)))

       :maybe
       (when-let [inner (schema->jsdoc (second schema) visited)]
         (str "?" inner))

       nil)

     :else nil)))

(core/defn- make-jsdoc
  "Generate JSDoc for editors to consume"
  [parsed]
  (try
    (let [arities (-> parsed :values :arities)
          args    (case (:key arities)
                    :single   (-> arities :value :values :args)
                    :multiple (-> arities :value :values :arities last :values :args))
          arglist (:arglist (malli.destructure/parse args))

          fn-schema                                  (mu.fn/fn-schema parsed {:target :target/metadata})
          ;; this is [:= [:cat :param-schema :param-schema] :return-schema]
          [_=> [_cat & param-schemas] return-schema] (cond-> fn-schema
                                                       ;; [:function [:=> schema1 ret1] [:=> schema2 ret2] ...]
                                                       (= :function (first fn-schema)) last)

          param-jsdoc  (->> (map (fn [param-name param-schema]
                                   (when-let [jsdoc (schema->jsdoc param-schema)]
                                    (str "@param {" jsdoc "} " param-name)))
                                arglist param-schemas)
                           (filterv identity))
          return-jsdoc (when-let [jsdoc (schema->jsdoc return-schema)]
                         (str "@return {" jsdoc "}"))]
      (cond-> param-jsdoc
        return-jsdoc (conj return-jsdoc)))
    (catch Exception _e
      [])))

(defmacro defn
  "Implementation of [[metabase.util.malli/defn]]. Like [[schema.core/defn]], but for Malli.

  Doesn't Malli already have a version of this in [[malli.experimental]]? It does, but it tends to eat memory; see
  https://metaboat.slack.com/archives/CKZEMT1MJ/p1690496060299339 and #32843 for more information. This new
  implementation solves most of our memory consumption problems.

  Unless it's in a skipped namespace during prod, (see: [[mu.fn/instrument-ns?]]) this macro emits clojure code to
  validate its inputs and outputs based on its malli schema annotations.

  Example macroexpansion:

    (mu/defn f :- :int
      [x :- :int]
      (inc x))

    ;; =>

    (def f
      (let [&f (fn [x] (inc x))]
        (fn ([a]
             (metabase.util.malli.fn/validate-input :int a)
             (->> (&f a)
                  (metabase.util.malli.fn/validate-output :int))))))

  Known issue: does not currently generate automatic type hints the way [[schema.core/defn]] does, nor does it attempt
  to preserve them if you specify them manually. We can fix this in the future."
  [& [fn-name :as fn-tail]]
  (let [parsed           (mu.fn/parse-fn-tail fn-tail)
        cosmetic-name    (gensym (munge (str fn-name)))
        {attr-map :meta} (:values parsed)
        attr-map         (merge
                          {:arglists (list 'quote (deparameterized-arglists parsed))
                           :schema   (mu.fn/fn-schema parsed {:target :target/metadata})
                           :jsdoc    (make-jsdoc parsed)}
                          attr-map)
        docstring        (annotated-docstring parsed)
        instrument?      (mu.fn/instrument-ns? *ns*)]
    (if-not instrument?
      `(def ~(vary-meta fn-name merge attr-map)
         ~docstring
         ~(mu.fn/deparameterized-fn-form parsed))
      `(def ~(vary-meta fn-name merge attr-map)
         ~docstring
         ~(macros/case
            :clj  (let [error-context {:fn-name (list 'quote fn-name)}]
                    (mu.fn/instrumented-fn-form error-context parsed cosmetic-name))
            :cljs (mu.fn/deparameterized-fn-form parsed cosmetic-name))))))

(defmacro defn-
  "Same as defn, but creates a private def."
  [fn-name & fn-tail]
  `(defn
     ~(with-meta fn-name (assoc (meta fn-name) :private true))
     ~@fn-tail))
