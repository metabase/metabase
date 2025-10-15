(ns metabase.util.malli.typescript
  (:require
   [cljs.analyzer :as ana]
   [cljs.compiler :as comp]
   [clojure.string :as str]
   [clojure.walk :as walk]
   [malli.core :as mc]
   [medley.core :as m]
   [metabase.util :as u]
   [metabase.util.log :as log]
   [metabase.util.malli.registry :as mr]
   [shadow.build.data :as b.data]))

(set! *warn-on-reflection* true)

(defn normalize-schema [schema]
  (when-not (vector? schema)
    (throw (ex-info "Expected to get schema vector" {:schema schema})))
  (if (map? (second schema))
    schema
    (into [(first schema) nil] (rest schema))))

(declare schema->ts)

(defn- fmt-literal
  "Format literal value to a TypeScript string"
  [v]
  (cond
    (number? v)  (str v)
    (keyword? v) (str "\"" (name v) "\"")
    :else        (str "\"" v "\"")))

(defn- wrap
  ([s wrappers]
   (str (first wrappers) s (second wrappers)))
  ([s l r]
   (str l s r)))

(defn- quote-if-neccessary [s]
  (if (re-find #"[^\w\d_]" s)
    (wrap s "''")
    s))

(declare schema->ts)

(defmulti -schema->ts
  "Convert a Malli schema to TypeScript type definition.
   Dispatches on the schema type (keyword)."
  {:arglists '([schema])}
  (fn [schema]
    (mc/type (mc/schema schema))))

(defmethod -schema->ts :string   [_] "string")
(defmethod -schema->ts :int      [_] "number")
(defmethod -schema->ts :double   [_] "number")
(defmethod -schema->ts :boolean  [_] "boolean")
(defmethod -schema->ts :keyword  [_] "string")
(defmethod -schema->ts :symbol   [_] "string")
(defmethod -schema->ts :uuid     [_] "string")
(defmethod -schema->ts :uri      [_] "string")
(defmethod -schema->ts :nil      [_] "null")
(defmethod -schema->ts :any      [_] "any")
(defmethod -schema->ts :re       [_] "string")
(defmethod -schema->ts 'pos-int? [_] "number")
(defmethod -schema->ts 'int      [_] "number")
(defmethod -schema->ts 'number?  [_] "number")
(defmethod -schema->ts 'string?  [_] "string")
(defmethod -schema->ts 'boolean  [_] "boolean")
(defmethod -schema->ts 'double   [_] "number")
(defmethod -schema->ts 'float    [_] "number")
(defmethod -schema->ts 'keyword? [_] "string")
(defmethod -schema->ts 'symbol   [_] "string")
(defmethod -schema->ts 'uuid     [_] "string")
(defmethod -schema->ts 'nil      [_] "null")
(defmethod -schema->ts 'vector?  [_] "unknown[]")

(defmethod -schema->ts :vector
  [schema]
  (let [children (mc/children schema)]
    (str (schema->ts (first children)) "[]")))

(defmethod -schema->ts :sequential
  [schema]
  (let [children (mc/children schema)]
    (str (schema->ts (first children)) "[]")))

(defmethod -schema->ts :set
  [schema]
  (let [[inner] (mc/children schema)]
    (-> (schema->ts inner)
        (wrap "Set<" ">"))))

(defmethod -schema->ts :map
  [schema]
  (let [children (mc/children schema)
        entries  (map (fn [[k _opts v-schema]]
                        (let [k-str     (-> (if (keyword? k) (name k) (str k))
                                            (quote-if-neccessary))
                              optional? (:optional (mc/properties v-schema))
                              separator (if optional? "?:" ":")]
                          (str k-str separator " " (schema->ts v-schema))))
                      children)]
    (if (empty? entries)
      "Record<string, unknown>"
      (-> (str/join ";\n" entries)
          (wrap "{\n" "\n}")))))

(defmethod -schema->ts :map-of
  [schema]
  (let [[left right] (mc/children schema)]
    (-> (str (schema->ts left) ", " (schema->ts right))
        (wrap "Record<" ">"))))

(defmethod -schema->ts :tuple
  [schema]
  (let [children (mc/children schema)]
    (-> (str/join ", " (map schema->ts children))
        (wrap "[]"))))

(defmethod -schema->ts :or
  [schema]
  (let [children (mc/children schema)
        types    (->> (map schema->ts children)
                      (remove #(str/starts-with? % "unknown /* unsupported")))]
    (if (seq types)
      (-> (str/join " | " types)
          (wrap "()"))
      "unknown /* unsupported */")))

(defmethod -schema->ts :orn
  [schema]
  (let [children (mc/children schema)]
    (-> (str/join " | "
                  (map (fn [[_name _opts child-schema]]
                         (schema->ts child-schema))
                       children))
        (wrap "()"))))

(defmethod -schema->ts :and
  [schema]
  (let [children (mc/children (mc/schema schema))
        types (->> (map schema->ts children)
                   (remove #(str/starts-with? % "unknown /* unsupported")))]
    (if (seq types)
      (-> (str/join " & " types)
          (wrap "()"))
      "unknown /* unsupported */")))

(defmethod -schema->ts :maybe
  [schema]
  (let [[inner] (mc/children (mc/schema schema))]
    (str (schema->ts inner) " | null")))

(defmethod -schema->ts :=
  [schema]
  (let [v (first (mc/children (mc/schema schema)))]
    (fmt-literal v)))

(defmethod -schema->ts :enum
  [schema]
  (let [children (mc/children (mc/schema schema))]
    (->> (map fmt-literal children)
         (str/join " | "))))

(defmethod -schema->ts :=>
  [schema]
  (let [[args-schema return-schema] (mc/children (mc/schema schema))
        args-children               (mc/children (mc/schema args-schema))]
    (str
     (-> (str/join ", " (map-indexed (fn [i arg-schema]
                                       (str "arg" i ": "
                                            (schema->ts arg-schema)))
                                     args-children))
         (wrap "()"))
     " => "
     (schema->ts return-schema))))

(defmethod -schema->ts :multi
  [schema]
  (let [children (mc/children (mc/schema schema))]
    (if (empty? children)
      "unknown"
      (-> (str/join " | " (map (fn [[_key _opts child-schema]]
                                 (schema->ts child-schema))
                               children))
          (wrap "()")))))

(defmethod -schema->ts :ref
  [schema]
  (let [t (first (mc/children schema))]
    ;; should just go to default fallback and deref there
    (schema->ts t)))

(defmethod -schema->ts :fn
  [schema]
  (or (:typescript (mc/properties schema))
      (let [t (first (mc/children schema))]
        (str "unknown /* unsupported: " t " */"))))

;; Default fallback

(defmethod -schema->ts :default
  [schema]
  (let [t (mc/type schema)]
    (cond
      (and (keyword? t) (namespace t))
      (schema->ts (mr/resolve-schema schema))

      (:typescript (mc/properties schema))
      (:typescript (mc/properties schema))

      :else
      (throw (ex-info "Unsupported schema" {::unsupported true
                                            :schema       schema
                                            :type         (mc/type schema)})))))

(comment
  (println (fn->ts (meta #'metabase.models.visualization-settings/parse-db-column-ref)))

  (schema->ts [:orn
               [:string? string?]
               [:vector? vector?]
               [:keyword? keyword?]])

  ( s))


;; Public API

(def ^:dynamic *seen* #{})

(def schema->ts
  "Convert a Malli schema to TypeScript type definition.
   Dispatches on the schema type (keyword)."
  (memoize
   (fn
     [schema]
     (when (*seen* schema)
       (throw (ex-info "wtf" {::unsupported true
                              :schema       schema})))
     (try
       (binding [*seen* (conj *seen* schema)]
         (-schema->ts (mc/schema schema)))
       (catch Exception e
         (cond
           (::unsupported (ex-data e))      (str "unknown /* unsupported: " (pr-str schema) " */")
           (instance? StackOverflowError e) (str "unknown /* recursive: " (pr-str schema) " */")
           :else                            (throw e)))))))

(defn generate-typescript-interface
  "Generate a TypeScript interface definition from a Malli schema."
  [interface-name schema]
  (str "export interface " interface-name " " (schema->ts schema)))

(defn generate-typescript-type
  "Generate a TypeScript type alias from a Malli schema."
  [type-name schema]
  (str "export type " type-name " = " (schema->ts schema)))

(defn- format-ts-args [arglist arg-schema]
  (->> (map
        (fn [arg-name arg-schema]
          (str (munge arg-name) ": " (schema->ts arg-schema)))
        arglist
        (mc/children arg-schema))
       (str/join ", ")))

(defn- format-comment [doc]
  (when-not (str/blank? doc)
    (str "/**\n"
         (->> (str/split-lines doc) (map #(str " * " %)) (str/join "\n"))
         "\n */\n")))

(defn- -fn->ts
  "Inputs:
  - fnname: \"fnname\"
  - arglist: '[nothing]
  - schema: [:=> [:cat :string] [:maybe :string]]

  Output is a string:

  export function fnname(nothing: string): string | null;"
  [fnname arglist schema]
  (assert (= :=> (mc/type schema)) "-fn->ts expects schema to start with :=>")
  (let [[arg-schema out-schema] (mc/children schema)]
    (format "export function %s(%s): %s;" (munge fnname)
            (format-ts-args arglist arg-schema)
            (schema->ts out-schema))))

(defn- require-or-return [ns-or-name]
  (if (symbol? ns-or-name)
    (do
      (locking clojure.lang.RT/REQUIRE_LOCK
        (-> ns-or-name namespace symbol require))
      (-> ns-or-name namespace symbol find-ns))
    ns-or-name))

(defn- resolve-var-refs [ns schema]
  (walk/postwalk
   (fn [form]
     (or (when (and (symbol? form)
                    (not (keyword? form)))
           (some-> (ns-resolve (require-or-return ns) form)
                   deref))
         form))
   schema))

(defn fn->ts
  "Convert either function metadata or ClojureScript's compiler state ('def') into TypeScript type."
  [{:keys [arglists schema doc ns] fqname :name :as fnmeta}]
  (try
    (let [fnname (name fqname)
          schema (resolve-var-refs (or ns fqname) schema)
          arglists (if (= (first arglists) 'quote)
                     (second arglists)
                     arglists)]
      (str
       (format-comment doc)
       (if (= (mc/type schema) :function)
         (->> (map (partial -fn->ts fnname) (rest arglists) (mc/children schema))
              (str/join "\n"))
         (-fn->ts fnname (first arglists) schema))
       "\n"))
    (catch Exception e
      (throw (ex-info (.getMessage e)
                      (assoc (ex-data e)
                             :meta fnmeta)
                      e)))))

(defn- ts-content [defs]
  (->> (map fn->ts (vals defs))
       (str/join "\n\n")))

(comment
  (requiring-resolve 'metabase.lib.binning/with-binning-option-type)
  (ns-resolve (find-ns 'metabase.lib.binning) 'with-binning-option-type)
  (print (fn->ts (meta #'metabase.lib.template-tags/arity)))

  (fn->ts (meta #'metabase.lib.binning.util/resolve-options))

  )

(defn produce-dts
  {:shadow.build/stage :flush}
  [state]
  (let [nses  (get-in state [:compiler-env ::ana/namespaces])
        total (count nses)]
    (doseq [[i [ns {:keys [defs]}]] (map-indexed vector nses)
            :let                    [defs (m/filter-vals :schema defs)]]
      (log/info "Compiling TypeScript defs" {:ns ns :number (str (inc i) "/" total) :defs (count defs)})
      (when (seq defs)
        (let [t (u/start-timer)]
          (require ns)
          (log/debug "Loading ns completed" {:ns ns :time (u/since-ms t)}))
        (let [t     (u/start-timer)
              fname (comp/munge (str ns))
              f     (b.data/output-file state (str fname ".d.ts"))]
          (spit f (ts-content defs))
          (log/debug "Type generation completed" {:ns ns :time (u/since-ms t)})))))
  state)
