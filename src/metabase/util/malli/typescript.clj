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

(def ^:dynamic *registry-refs*
  "Atom collecting registry schema references during type generation. When bound, refs are recorded so we can generate
  type aliases."
  nil)

(def ^:dynamic *shared-types*
  "Set of registry schemas emitted in the shared module. References to these schemas are prefixed with `Shared.`."
  #{})

(def ^:dynamic *current-ns*
  "Current namespace being processed, used for diagnostics."
  nil)

(def ^:dynamic *current-def*
  "Current var being processed, used for diagnostics."
  nil)

(def ^:dynamic *weak-types*
  "Atom collecting generated any/unknown occurrences for diagnostics. Maps namespace to entries with type and var name."
  nil)

(def ^:dynamic *argument-context*
  "True when generating function argument types. In argument context, :maybe includes undefined."
  false)

(defn- debug-cljs?
  "Check if MB_DEBUG_CLJS environment variable is set."
  []
  (some? (System/getenv "MB_DEBUG_CLJS")))

(defn- record-weak-type!
  "Record an occurrence of 'any' or 'unknown' type for debug output."
  [type-kw]
  (when (and *weak-types* *current-ns* *current-def*)
    (swap! *weak-types* update *current-ns* (fnil conj #{}) {:type type-kw :def *current-def*})))

(defn- record-registry-ref!
  "Record a registry schema reference for later type alias generation."
  [schema-keyword]
  (when *registry-refs*
    (swap! *registry-refs* conj schema-keyword)))

(def ^:private special-char-map
  "Map of special characters to readable TypeScript-safe names."
  {\! "Bang"
   \= "Eq"
   \+ "Plus"
   \- "Minus"
   \* "Star"
   \/ "Slash"
   \< "Lt"
   \> "Gt"
   \? "Q"})

(defn- munge-segment
  "Munge a segment by replacing special chars with readable names and capitalizing."
  [segment]
  (->> segment
       (map #(get special-char-map % (str %)))
       (apply str)
       u/capitalize-first-char))

(defn- to-capital-case
  "Convert string with dots/hyphens to CapitalCase.
   Example: \"column.has-field-values\" -> \"ColumnHasFieldValues\"
   Handles special case where string is just a special character like \"-\"."
  [s]
  ;; If the string is a single special character, munge it directly
  (if (and (= 1 (count s)) (contains? special-char-map (first s)))
    (get special-char-map (first s))
    ;; Otherwise, split on delimiters and munge each segment
    (->> (str/split s #"[-.]")
         (remove str/blank?)
         (map munge-segment)
         (str/join ""))))

(defn- base-type-name
  "Convert a qualified keyword like ::lib.schema/query to a base TypeScript type name.
   Dots in namespace become underscores, dashes become CapitalCase.
   Dots in entity name also become CapitalCase parts.
   Example: metabase.lib.schema.mbql-clause/bin-width -> Metabase_Lib_Schema_MbqlClause_BinWidth
   Example: metabase.lib.schema.metadata/column.has-field-values -> Metabase_Lib_Schema_Metadata_ColumnHasFieldValues"
  [kw]
  (let [;; Namespace: split by dots, convert each part to CapitalCase, join with underscores
        ns-name (->> (str/split (namespace kw) #"\.")
                     (remove str/blank?)
                     (map to-capital-case)
                     (str/join "_"))
        ;; Entity name: convert to CapitalCase (dots and dashes become CapitalCase)
        entity-name (to-capital-case (name kw))]
    (str ns-name "_" entity-name)))

(defn- registry-type-name
  "Convert a qualified keyword to a TypeScript type reference.
   If the type is in *shared-types*, prefix with 'Shared.' to reference the shared module."
  [kw]
  (let [base-name (base-type-name kw)]
    (if (contains? *shared-types* kw)
      (str "Shared." base-name)
      base-name)))

(declare schema->ts)

(def ^:dynamic *key-transform*
  "Optional map-key transform applied while generating JS-facing object types."
  nil)

(defn- camel-case-key
  "Convert a kebab/snake/camel-ish Clojure key name to camelCase for JS-facing object schemas.
  Mirrors the common CLJS convention where predicate keys like `:many-pks?` become `isManyPks`."
  [s]
  (let [s     (if (str/ends-with? s "?")
                (str "is-" (str/replace s #"\?$" ""))
                s)
        parts (remove str/blank? (str/split s #"[-_\s]+"))]
    (if (seq parts)
      (str (first parts)
           (apply str (map str/capitalize (rest parts))))
      s)))

(defn- transform-map-key
  [k]
  (case *key-transform*
    :camelCase (if (keyword? k)
                 (camel-case-key (name k))
                 (str k))
    (if (keyword? k) (name k) (str k))))

(defn- fmt-literal
  "Format literal value to a TypeScript literal type."
  [v]
  (cond
    (nil? v)     "null"
    (boolean? v) (str v)
    (number? v)  (str v)
    (keyword? v) (pr-str (cond->> (name v)
                           (namespace v) (str (namespace v) "/")))
    (string? v)  (pr-str v)
    :else        (pr-str (str v))))

(defn- wrap
  ([s wrappers]
   (str (first wrappers) s (second wrappers)))
  ([s l r]
   (str l s r)))

(defn- quote-if-necessary
  "Quote a property name if it contains characters invalid for JS identifiers."
  [s]
  (if (re-matches #"[A-Za-z_$][\w$]*" s)
    s
    (str "\"" s "\"")))

(defn- indent-ts
  "Add proper indentation to TypeScript type definition based on brace depth.
   Indents lines inside { } blocks with 2 spaces per level."
  [s]
  (let [lines (str/split-lines s)]
    (loop [result []
           depth 0
           [line & remaining] lines]
      (if (nil? line)
        (str/join "\n" result)
        (let [;; Count braces to track depth changes
              open-count  (count (re-seq #"\{" line))
              close-count (count (re-seq #"\}" line))
              ;; For closing braces, reduce depth before indenting
              indent-depth (if (str/starts-with? (str/trim line) "}")
                             (max 0 (dec depth))
                             depth)
              indented-line (str (apply str (repeat indent-depth "  ")) line)
              new-depth (+ depth open-count (- close-count))]
          (recur (conj result indented-line)
                 (max 0 new-depth)
                 remaining))))))

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
(defmethod -schema->ts :any      [schema]
  (let [props (mc/properties schema)]
    (cond
      ;; [:any {:typescript "CustomType"}] => "CustomType"
      (:typescript props)
      (:typescript props)

      ;; [:any {:ts/array-of <element-schema>}] => "ElementType[]"
      (:ts/array-of props)
      (str (schema->ts (:ts/array-of props)) "[]")

      ;; [:any {:ts/object-of [:map [:key Type] ...]}] => "{ key: Type; ... }"
      ;; Nested :ts/object-of inherits an outer :ts/key-transform unless it sets its own;
      ;; use :ts/key-transform :none to explicitly reset to default key formatting.
      (:ts/object-of props)
      (binding [*key-transform* (or (:ts/key-transform props) *key-transform*)]
        (schema->ts (:ts/object-of props)))

      ;; [:any {:ts/instance-of "Array"}] — from [:is-a js/Array] transformation
      (:ts/instance-of props)
      (case (:ts/instance-of props)
        "Array"  "unknown[]"
        "Object" "Record<string, unknown>"
        (do (record-weak-type! :unknown)
            "unknown"))

      :else
      (do (record-weak-type! :unknown)
          "unknown"))))
(defmethod -schema->ts :re       [_] "string")
(defmethod -schema->ts 'pos-int? [_] "number")
(defmethod -schema->ts 'nat-int? [_] "number")
(defmethod -schema->ts 'neg-int? [_] "number")
(defmethod -schema->ts 'int      [_] "number")
(defmethod -schema->ts 'int?     [_] "number")
(defmethod -schema->ts 'number?  [_] "number")
(defmethod -schema->ts 'string?  [_] "string")
(defmethod -schema->ts 'boolean  [_] "boolean")
(defmethod -schema->ts 'boolean? [_] "boolean")
(defmethod -schema->ts 'double   [_] "number")
(defmethod -schema->ts 'double?  [_] "number")
(defmethod -schema->ts 'float    [_] "number")
(defmethod -schema->ts 'float?   [_] "number")
(defmethod -schema->ts 'keyword? [_] "string")
(defmethod -schema->ts 'symbol   [_] "string")
(defmethod -schema->ts 'symbol?  [_] "string")
(defmethod -schema->ts 'uuid     [_] "string")
(defmethod -schema->ts 'uuid?    [_] "string")
(defmethod -schema->ts 'nil      [_] "null")
(defmethod -schema->ts 'nil?     [_] "null")
(defmethod -schema->ts 'vector?  [_]
  (record-weak-type! :unknown)
  "unknown[]")

;; Java Time types - serialized as ISO-8601 strings in JS/TS
(defmethod -schema->ts :time/local-date          [_] "string")
(defmethod -schema->ts :time/local-time          [_] "string")
(defmethod -schema->ts :time/offset-time         [_] "string")
(defmethod -schema->ts :time/local-date-time     [_] "string")
(defmethod -schema->ts :time/offset-date-time    [_] "string")
(defmethod -schema->ts :time/zoned-date-time     [_] "string")

(defmethod -schema->ts :vector
  [schema]
  (let [children (mc/children schema)]
    (str (schema->ts (first children)) "[]")))

(defn- repeated-tuple-type
  [child-type min-count]
  (if (pos? min-count)
    (str "[" (str/join ", " (concat (repeat min-count child-type)
                                    [(str "..." child-type "[]")])) "]")
    (str child-type "[]")))

(defmethod -schema->ts :sequential
  [schema]
  (let [[child] (mc/children schema)
        child-type (schema->ts child)]
    (repeated-tuple-type child-type (:min (mc/properties schema) 0))))

(defmethod -schema->ts :set
  [schema]
  (let [[inner] (mc/children schema)]
    (-> (schema->ts inner)
        (wrap "Set<" ">"))))

(defmethod -schema->ts :map
  [schema]
  (let [closed? (true? (:closed (mc/properties schema)))
        children (mc/children schema)
        entries  (mapv (fn [[k opts v-schema]]
                         (let [k-str     (-> (transform-map-key k)
                                             (quote-if-necessary))
                               optional? (:optional opts)
                               separator (if optional? "?:" ":")]
                           (str k-str separator " " (schema->ts v-schema))))
                       children)
        entries  (cond-> entries
                   (and (not closed?) (seq entries))
                   (conj "[key: string]: unknown"))]
    (cond
      (seq entries)
      (str "{\n" (str/join ";\n" (map #(str "\t" %) entries)) ";\n}")

      closed?
      "{}"

      :else
      "Record<string, unknown>")))

(defn- map-of-key-type
  "Return a TypeScript key type for a Malli `:map-of` key schema. TypeScript Record keys must be property keys,
  so structural or unknown Malli key schemas fall back to `string`."
  [schema]
  (let [schema-type (mc/type (mc/schema schema))]
    (case schema-type
      (:string :keyword :symbol :uuid :uri :re) "string"
      (:int :double) "number"
      (let [ts-type (schema->ts schema)]
        (if (re-matches #"(?:string|number|symbol|(?:\"[^\"]+\"|\d+)(?: \| (?:\"[^\"]+\"|\d+))*)" ts-type)
          ts-type
          "string")))))

(defmethod -schema->ts :map-of
  [schema]
  (let [[left right] (mc/children schema)
        key-type (map-of-key-type left)
        value-type (schema->ts right)]
    (if (= :enum (mc/type (mc/schema left)))
      (str "Partial<Record<" key-type ", " value-type ">>")
      (str "Record<" key-type ", " value-type ">"))))

(defmethod -schema->ts :tuple
  [schema]
  (let [children (mc/children schema)]
    (-> (str/join ", " (map schema->ts children))
        (wrap "[]"))))

(defn- unknown-type?
  "Check if a type string is effectively 'unknown' (no useful type info).
   Includes 'unknown[]' so that [:and [:is-a js/Array] [:sequential X]] simplifies to X[]
   rather than (unknown[] & X[])."
  [s]
  (or (= s "unknown")
      (= s "unknown[]")
      (str/starts-with? s "unknown /*")))

(def ^:private unknown-union-branch-type
  "{ readonly __metabaseUnknownSchemaBranch: true }")

(defn- simplify-union-types
  "Simplify a collection of union type strings:
   - If any type is 'any', return [\"any\"] (any absorbs everything)
   - Return distinct types
   Note: callers should filter out 'unknown' types before calling this."
  [types]
  (cond
    (some #(= % "any") types) ["any"]
    :else                     (vec (distinct types))))

(defn- merge-union-types
  "Merge union type strings while preserving information from unknown branches.
   If unknown branches are present together with known branches, add a branded marker
   type instead of erasing unknown branches entirely."
  [types]
  (let [known-types     (remove unknown-type? types)
        unknown-present (not= (count known-types) (count types))
        simplified      (simplify-union-types known-types)]
    (cond
      (some #(= % "any") simplified) ["any"]
      (and unknown-present (seq simplified))
      (conj simplified unknown-union-branch-type)
      :else
      simplified)))

(defn- merge-intersection-types
  "Merge intersection type strings, dropping unknown branches.
   Unknown constraints in intersections (e.g. predicate-only schemas) cannot be represented
   structurally in TS without poisoning assignability of known branches. If every branch is unknown-ish, preserve
   array-ness when present rather than degrading `unknown[]` to bare `unknown`."
  [types]
  (let [known-types     (remove unknown-type? types)
        simplified      (vec (distinct known-types))]
    (cond
      (seq simplified)
      simplified

      (some #(= % "unknown[]") types)
      ["unknown[]"]

      :else
      ["unknown"])))

(defmethod -schema->ts :or
  [schema]
  (let [children (mc/children schema)
        types    (->> children
                      (map schema->ts)
                      merge-union-types)]
    (case (count types)
      0 "unknown"
      1 (first types)
      (-> (str/join " | " types)
          (wrap "()")))))

(defmethod -schema->ts :orn
  [schema]
  (let [children (mc/children schema)
        types    (->> children
                      (map (fn [[_name _opts child-schema]]
                             (schema->ts child-schema)))
                      merge-union-types)]
    (case (count types)
      0 "unknown"
      1 (first types)
      (-> (str/join " | " types)
          (wrap "()")))))

(defmethod -schema->ts :and
  [schema]
  (let [children (mc/children (mc/schema schema))
        types (->> (map schema->ts children)
                   merge-intersection-types)]
    (case (count types)
      1 (first types)
      (-> (str/join " & " types)
          (wrap "()")))))

(defmethod -schema->ts :maybe
  [schema]
  (let [[inner] (mc/children (mc/schema schema))
        inner-type (schema->ts inner)]
    (cond
      (= inner-type "unknown")
      "unknown"

      *argument-context*
      (str inner-type " | undefined | null")

      :else
      (str inner-type " | null"))))

;; :schema wraps a schema for validation - just unwrap and process the child
(defmethod -schema->ts :schema
  [schema]
  (let [[child] (mc/children (mc/schema schema))]
    (schema->ts child)))

(defn- catn-child-schema
  "Extract the schema from a Malli :catn child: [name schema] or [name opts schema]."
  [child]
  (if (= 3 (count child))
    (nth child 2)
    (nth child 1)))

(defn- arg-schema-children
  [arg-schema]
  (let [schema (mc/schema arg-schema)]
    (case (mc/type schema)
      :catn (map catn-child-schema (mc/children schema))
      (mc/children schema))))

;; :cat is a sequence schema with positional elements (like tuple but for seqex)
(defmethod -schema->ts :cat
  [schema]
  (let [children (mc/children (mc/schema schema))]
    (-> (str/join ", " (map schema->ts children))
        (wrap "[]"))))

;; :catn is like :cat but with named entries - extract schema from each entry
(defmethod -schema->ts :catn
  [schema]
  (let [schemas (map catn-child-schema (mc/children (mc/schema schema)))]
    (-> (str/join ", " (map schema->ts schemas))
        (wrap "[]"))))

;; :repeat is a repeating sequence; honors {:min n} like :+
(defmethod -schema->ts :repeat
  [schema]
  (let [[child] (mc/children (mc/schema schema))]
    (repeated-tuple-type (schema->ts child) (:min (mc/properties schema) 0))))

;; :* is zero or more - produce array type
(defmethod -schema->ts :*
  [schema]
  (let [[child] (mc/children (mc/schema schema))]
    (str (schema->ts child) "[]")))

;; :+ is one or more.
(defmethod -schema->ts :+
  [schema]
  (let [[child] (mc/children (mc/schema schema))]
    (repeated-tuple-type (schema->ts child) (:min (mc/properties schema) 1))))

;; :? is zero or one - produce optional type
(defmethod -schema->ts :?
  [schema]
  (let [[child] (mc/children (mc/schema schema))]
    (str (schema->ts child) " | undefined")))

;; :merge combines multiple map schemas into one - produce intersection type
(defmethod -schema->ts :merge
  [schema]
  (let [children (mc/children (mc/schema schema))
        types    (->> (map schema->ts children)
                      merge-intersection-types)]
    (case (count types)
      1 (first types)
      (-> (str/join " & " types)
          (wrap "()")))))

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
        args-children               (arg-schema-children args-schema)]
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
  (let [children (mc/children (mc/schema schema))
        types    (->> children
                      (map (fn [[_key _opts child-schema]]
                             (schema->ts child-schema)))
                      merge-union-types)]
    (case (count types)
      0 "unknown"
      1 (first types)
      (-> (str/join " | " types)
          (wrap "()")))))

(defmethod -schema->ts :ref
  [schema]
  (let [t (first (mc/children schema))]
    ;; If this is a qualified keyword (registry ref), output type name and record it unless a key transform requires
    ;; expanding inline so nested map keys are transformed too.
    (if (and (keyword? t) (namespace t))
      (if *key-transform*
        (schema->ts (mr/resolve-schema t))
        (do
          (record-registry-ref! t)
          (registry-type-name t)))
      ;; Otherwise fall through to resolve the schema
      (schema->ts t))))

(defmethod -schema->ts :fn
  [schema]
  (let [typescript (:typescript (mc/properties schema))]
    (when (or (nil? typescript) (= "unknown" typescript))
      (record-weak-type! :unknown))
    (or typescript "unknown")))

;; Default fallback

(defmethod -schema->ts :default
  [schema]
  (let [t (mc/type schema)]
    (cond
      ;; For :malli.core/schema (registry wrapper), use mc/form to get the original keyword
      (= t :malli.core/schema)
      (let [form (mc/form schema)]
        (if (and (keyword? form) (namespace form))
          (if *key-transform*
            (schema->ts (mr/resolve-schema form))
            (do
              (record-registry-ref! form)
              (registry-type-name form)))
          ;; If form isn't a qualified keyword, resolve and expand
          (schema->ts (mr/resolve-schema schema))))

      ;; For other qualified keyword schemas, output type name and record it
      (and (keyword? t) (namespace t))
      (if *key-transform*
        (schema->ts (mr/resolve-schema t))
        (do
          (record-registry-ref! t)
          (registry-type-name t)))

      (:typescript (mc/properties schema))
      (:typescript (mc/properties schema))

      :else
      (throw (ex-info "Unsupported schema" {::unsupported true
                                            :schema       schema
                                            :type         (mc/type schema)})))))

;; Public API

(def ^:dynamic *seen*
  "Schemas currently being expanded, used to detect recursive inline expansion."
  #{})

(defn- schema->ts-impl
  "Core implementation of schema->ts (non-memoized)."
  [schema]
  (when (*seen* schema)
    (throw (ex-info "Circular schema reference" {::unsupported true
                                                 :schema       schema})))
  (try
    (binding [*seen* (conj *seen* schema)]
      (-schema->ts (mc/schema schema)))
    (catch Throwable t
      (cond
        (::unsupported (ex-data t))
        (do
          (record-weak-type! :unknown)
          "unknown")
        (instance? StackOverflowError t)
        (do
          (record-weak-type! :unknown)
          "unknown")
        :else
        (throw t)))))

(defn schema->ts
  "Convert a Malli schema to TypeScript type definition. Dispatches on the schema type (keyword)."
  [schema]
  (schema->ts-impl schema))

(defn generate-typescript-interface
  "Generate a TypeScript interface definition from a Malli schema."
  [interface-name schema]
  (str "export interface " interface-name " " (schema->ts schema)))

(defn generate-typescript-type
  "Generate a TypeScript type alias from a Malli schema."
  [type-name schema]
  (str "export type " type-name " = " (schema->ts schema)))

(defn- cljs-munge
  "Munge a symbol/string using ClojureScript's munge which handles JS reserved words."
  [s]
  (comp/munge (if (symbol? s) s (symbol (str s)))))

(defn- extract-arg-name
  "Extract a valid parameter name from an arglist element.
   Handles simple symbols and destructuring forms (maps/vectors)."
  [arg-form index]
  (cond
    ;; Compiler-munged variadic placeholder
    (and (symbol? arg-form)
         (= "_AMPERSAND_" (name arg-form)))
    "rest"

    ;; Simple symbol
    (symbol? arg-form)
    (cljs-munge arg-form)

    ;; Map destructuring - use :as name or synthetic
    (map? arg-form)
    (if-let [as-name (:as arg-form)]
      (cljs-munge as-name)
      (str "arg" index))

    ;; Vector destructuring - use :as name or synthetic
    (vector? arg-form)
    (let [as-idx (.indexOf ^java.util.List arg-form :as)]
      (if (and (>= as-idx 0) (< (inc as-idx) (count arg-form)))
        (cljs-munge (nth arg-form (inc as-idx)))
        (str "arg" index)))

    ;; Fallback to synthetic name
    :else
    (str "arg" index)))

(defn- rest-marker?
  "True for variadic markers in arglists.
   Handles both canonical '& and compiler-munged '_AMPERSAND_' placeholders."
  [arg-form]
  (and (symbol? arg-form)
       (or (= arg-form '&)
           (= (name arg-form) "&")
           (= (name arg-form) "_AMPERSAND_"))))

(defn- munged-ampersand?
  "True if this is the compiler-munged variadic placeholder symbol."
  [arg-form]
  (and (symbol? arg-form)
       (= (name arg-form) "_AMPERSAND_")))

(defn- warn-arg-schema-mismatch!
  [message extra]
  (log/warn message (merge {:ns *current-ns*, :def *current-def*} extra)))

(defn- arg-specs
  "Pair arglist entries with schema children, handling variadic args.
   Returns specs like:
   {:arg-name x :arg-schema s :arg-idx 0 :rest? false}
   {:arg-name args :arg-schema s :arg-idx 1 :rest? true}"
  [arglist arg-schema]
  (loop [remaining-args    (seq arglist)
         remaining-schemas (seq (arg-schema-children arg-schema))
         arg-idx           0
         specs             []]
    (cond
      (nil? remaining-args)
      (do
        (when (seq remaining-schemas)
          (warn-arg-schema-mismatch! "Function schema has more argument schemas than arglist entries"
                                     {:extra-schemas (count remaining-schemas)}))
        specs)

      :else
      (let [arg-name      (first remaining-args)
            ;; Rest params must pad with a sequential schema so the emitted rest type stays an array
            ;; (`...rest: unknown[]`); a bare `unknown` rest type is invalid TypeScript.
            schema-or-pad (fn [fallback]
                            (or (first remaining-schemas)
                                (do
                                  (warn-arg-schema-mismatch! "Function arglist has more entries than schema; using unknown"
                                                             {:arg-name (pr-str arg-name), :arg-idx arg-idx})
                                  fallback)))]
        (if (rest-marker? arg-name)
          (if (munged-ampersand? arg-name)
            (recur (next remaining-args)
                   (next remaining-schemas)
                   (inc arg-idx)
                   (conj specs {:arg-name   'rest
                                :arg-schema (schema-or-pad [:sequential :any])
                                :arg-idx    arg-idx
                                :rest?      true}))
            (if-let [rest-name (second remaining-args)]
              (conj specs {:arg-name   rest-name
                           :arg-schema (schema-or-pad [:sequential :any])
                           :arg-idx    arg-idx
                           :rest?      true})
              (do
                (warn-arg-schema-mismatch! "Function arglist has variadic marker without rest arg name"
                                           {:arg-idx arg-idx})
                specs)))
          (recur (next remaining-args)
                 (next remaining-schemas)
                 (inc arg-idx)
                 (conj specs {:arg-name   arg-name
                              :arg-schema (schema-or-pad :any)
                              :arg-idx    arg-idx
                              :rest?      false})))))))

(defn- fallback-arg-specs
  "Build argument specs from arglist only, for fallback declarations."
  [arglist]
  (loop [remaining-args (seq arglist)
         arg-idx        0
         specs          []]
    (if (nil? remaining-args)
      specs
      (let [arg-name (first remaining-args)]
        (if (rest-marker? arg-name)
          (if (munged-ampersand? arg-name)
            (recur (next remaining-args)
                   (inc arg-idx)
                   (conj specs {:arg-name 'rest :arg-idx arg-idx :rest? true}))
            (if-let [rest-name (second remaining-args)]
              (conj specs {:arg-name rest-name :arg-idx arg-idx :rest? true})
              specs))
          (recur (next remaining-args)
                 (inc arg-idx)
                 (conj specs {:arg-name arg-name :arg-idx arg-idx :rest? false})))))))

(defn- format-ts-args
  "Format function arguments as TypeScript. If generic-arg-idx is provided,
   use 'T' for that argument instead of its schema type."
  ([arglist arg-schema]
   (format-ts-args arglist arg-schema nil))
  ([arglist arg-schema generic-arg-idx]
   (binding [*argument-context* true]
     (->> (arg-specs arglist arg-schema)
          (map (fn [{:keys [arg-name arg-schema arg-idx rest?]}]
                 (let [arg-type (if (= arg-idx generic-arg-idx)
                                  (if rest? "T[]" "T")
                                  (schema->ts arg-schema))]
                   (str (when rest? "...")
                        (extract-arg-name arg-name arg-idx)
                        ": "
                        arg-type))))
          (str/join ", ")))))

(defn- format-jsdoc
  "Generate a JSDoc comment block with description, @param tags, and @returns tag.
   If generic-arg-idx is provided, use 'T' for that argument and return type."
  ([doc arglist arg-schema return-schema]
   (format-jsdoc doc arglist arg-schema return-schema nil nil))
  ([doc arglist arg-schema return-schema generic-arg-idx base-type-str]
   (let [doc-lines (when-not (str/blank? doc)
                     (->> (str/split-lines doc)
                          (map #(str " * " %))))
         template-line (when generic-arg-idx
                         (str " * @template {" base-type-str "} T"))
         param-lines (binding [*argument-context* true]
                       (doall
                        (map
                         (fn [{:keys [arg-name arg-schema arg-idx rest?]}]
                           (str " * @param {"
                                (if (= arg-idx generic-arg-idx)
                                  (if rest? "T[]" "T")
                                  (schema->ts arg-schema))
                                "} "
                                (when rest? "...")
                                (extract-arg-name arg-name arg-idx)))
                         (arg-specs arglist arg-schema))))
         return-line (str " * @returns {" (if generic-arg-idx "T" (schema->ts return-schema)) "}")]
     (str "/**\n"
          (when (seq doc-lines)
            (str (str/join "\n" doc-lines) "\n *\n"))
          (when template-line
            (str template-line "\n"))
          (str/join "\n" param-lines)
          "\n"
          return-line
          "\n */\n"))))

(defn- format-fallback-jsdoc
  "Generate a fallback JSDoc block when schema cannot be resolved."
  [doc arglist]
  (let [doc-lines (when-not (str/blank? doc)
                    (->> (str/split-lines doc)
                         (map #(str " * " %))))
        note-line " * NOTE: Generated fallback declaration due to unavailable schema validator during build"
        param-lines (for [{:keys [arg-name arg-idx rest?]} (fallback-arg-specs arglist)]
                      (str " * @param {unknown"
                           (when rest? "[]")
                           "} "
                           (when rest? "...")
                           (extract-arg-name arg-name arg-idx)))]
    (str "/**\n"
         (when (seq doc-lines)
           (str (str/join "\n" doc-lines) "\n *\n"))
         note-line
         "\n"
         (str/join "\n" param-lines)
         "\n"
         " * @returns {unknown}\n"
         " */\n")))

(defn- fallback-fn->ts
  "Generate unknown-typed function declarations as a safe fallback."
  [{:keys [arglists doc] fqname :name}]
  (let [fnname   (cljs-munge (name fqname))
        arglists (if (= (first arglists) 'quote) (second arglists) arglists)]
    (->> arglists
         (map (fn [arglist]
                (let [ts-args (->> (fallback-arg-specs arglist)
                                   (map (fn [{:keys [arg-name arg-idx rest?]}]
                                          (str (when rest? "...")
                                               (extract-arg-name arg-name arg-idx)
                                               ": unknown"
                                               (when rest? "[]"))))
                                   (str/join ", "))]
                  (str (format-fallback-jsdoc doc arglist)
                       (format "export function %s(%s): unknown;" fnname ts-args)))))
         (str/join "\n"))))

(defn- fallback-const->ts
  "Generate unknown-typed constant declaration as a safe fallback."
  [{:keys [doc] fqname :name}]
  (let [constname (cljs-munge (name fqname))]
    (str "/**\n"
         (when-not (str/blank? doc)
           (str (str/join "\n" (map #(str " * " %) (str/split-lines doc))) "\n *\n"))
         " * NOTE: Generated fallback declaration due to unavailable schema validator during build\n"
         " * @type {unknown}\n"
         " */\n"
         (format "export const %s: unknown;" constname))))

(defn- extract-generic-info
  "Extract generic type information from a return schema.
   Returns nil if not generic, or a map with :arg-idx and :base-type if :ts/same-as is present.

   Example: [:schema {:ts/same-as 0} ::column]
   Returns: {:arg-idx 0, :base-type ::column}"
  [out-schema]
  (when (and (= :schema (mc/type out-schema))
             (mc/properties out-schema))
    (when-let [arg-idx (:ts/same-as (mc/properties out-schema))]
      (let [props (mc/properties out-schema)
            [base-schema] (mc/children out-schema)]
        {:arg-idx       arg-idx
         :base-type     base-schema
         :generic-bound (:ts/generic-bound props)}))))

(defn- -fn->ts
  "Inputs:
  - fnname: \"fnname\"
  - arglist: '[nothing]
  - schema: [:=> [:cat :string] [:maybe :string]]
  - doc: optional docstring

  Output is a string:

  /**
   * docstring
   *
   * @param {string} nothing
   * @returns {string | null}
   */
  export function fnname(nothing: string): string | null;

  If the return schema has :ts/same-as property, generates a generic function:
  export function withBinning<T extends ColumnMetadata>(column: T, option: ...): T;"
  ([fnname arglist schema]
   (-fn->ts fnname arglist schema nil))
  ([fnname arglist schema doc]
   (assert (= :=> (mc/type schema)) "-fn->ts expects schema to start with :=>")
   (let [[arg-schema out-schema] (mc/children schema)
         generic-info (extract-generic-info out-schema)]
     (if generic-info
       ;; Generic function with :ts/same-as
       (let [{:keys [arg-idx base-type generic-bound]} generic-info
             base-type-str (schema->ts (or generic-bound base-type))]
         (str (format-jsdoc doc arglist arg-schema out-schema arg-idx base-type-str)
              (format "export function %s<T extends %s>(%s): T;"
                      (cljs-munge fnname)
                      base-type-str
                      (format-ts-args arglist arg-schema arg-idx))))
       ;; Regular function
       (str (format-jsdoc doc arglist arg-schema out-schema)
            (format "export function %s(%s): %s;" (cljs-munge fnname)
                    (format-ts-args arglist arg-schema)
                    (schema->ts out-schema)))))))

(defn- require-or-return [ns-or-name]
  (if (symbol? ns-or-name)
    (let [ns-sym (if-let [sym-ns (namespace ns-or-name)]
                   (symbol sym-ns)
                   ns-or-name)]
      (locking clojure.lang.RT/REQUIRE_LOCK
        (require ns-sym))
      (find-ns ns-sym))
    ns-or-name))

(defn- js-symbol?
  "Check if a symbol is in the `js` namespace (e.g., `js/Array`, `js/Object`).
   These only exist in CLJS and cannot be resolved on the JVM."
  [form]
  (and (symbol? form)
       (= "js" (namespace form))))

(defn- resolve-var-refs [ns schema]
  (walk/postwalk
   (fn [form]
     (cond
       ;; [:is-a js/Foo] — JS class instance check. Replace with a TS-generator-friendly form
       ;; since js/Foo classes don't exist on the JVM and :is-a expects a real class.
       (and (vector? form)
            (= :is-a (first form))
            (= 2 (count form))
            (js-symbol? (second form)))
       [:any {:ts/instance-of (name (second form))}]

       ;; Skip js/* symbols entirely — they can't be resolved on the JVM
       (js-symbol? form)
       form

       ;; Resolve CLJ-side var references
       (and (symbol? form) (not (keyword? form)))
       (or (some-> (ns-resolve (require-or-return ns) form)
                   deref)
           form)

       :else
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
       (if (= (mc/type schema) :function)
         (->> (map (fn [arglist child-schema]
                     (-fn->ts fnname arglist child-schema doc))
                   arglists
                   (mc/children schema))
              (str/join "\n"))
         (-fn->ts fnname (first arglists) schema doc))
       "\n"))
    (catch Exception e
      (throw (ex-info (.getMessage e)
                      (assoc (ex-data e)
                             :meta fnmeta)
                      e)))))

(defn- function-schema?
  "Check if a schema is a function schema (:=> or :function).
   Works with raw schema forms before resolution."
  [schema]
  (when schema
    (let [schema-type (if (vector? schema) (first schema) schema)]
      (or (= schema-type :=>) (= schema-type :function)))))

(defn- format-const-jsdoc
  "Generate a JSDoc comment block for a constant with description and @type tag."
  [doc schema]
  (let [doc-lines (when-not (str/blank? doc)
                    (->> (str/split-lines doc)
                         (map #(str " * " %))))
        type-line (str " * @type {" (schema->ts schema) "}")]
    (str "/**\n"
         (when (seq doc-lines)
           (str (str/join "\n" doc-lines) "\n *\n"))
         type-line
         "\n */\n")))

(defn const->ts
  "Convert a constant definition with schema metadata into TypeScript type declaration."
  [{:keys [schema doc ns] fqname :name :as defmeta}]
  (try
    (let [constname (cljs-munge (name fqname))
          schema (resolve-var-refs (or ns fqname) schema)]
      (str (format-const-jsdoc doc schema)
           (format "export const %s: %s;" constname (schema->ts schema))
           "\n"))
    (catch Exception e
      (throw (ex-info (.getMessage e)
                      (assoc (ex-data e)
                             :meta defmeta)
                      e)))))

(defn def->ts
  "Convert a def with schema metadata into TypeScript. Dispatches to fn->ts for functions
   and const->ts for constants. If schema processing fails due unavailable SCI validators,
   emits a fallback declaration with unknown types so exports remain present."
  [defmeta]
  (try
    (indent-ts
     (if (function-schema? (:schema defmeta))
       (fn->ts defmeta)
       (const->ts defmeta)))
    (catch clojure.lang.ExceptionInfo e
      (if (= :malli.core/sci-not-available (:type (ex-data e)))
        (do (log/warn "Using fallback TypeScript declaration for" (:name defmeta)
                      "- schema contains [:fn] validators requiring SCI")
            (record-weak-type! :unknown)
            (indent-ts
             (if (function-schema? (:schema defmeta))
               (fallback-fn->ts defmeta)
               (fallback-const->ts defmeta))))
        (throw e)))))

(defn- registry-schema?
  "Check if a keyword refers to a valid schema in the Malli registry."
  [kw]
  (try
    (some? (mr/resolve-schema kw))
    (catch Exception _
      false)))

(defn- generate-type-aliases
  "Generate TypeScript type aliases for a set of registry schema keywords.
   Iteratively expands to find all transitively referenced schemas.
   Uses sorted order for deterministic output."
  [initial-refs]
  ;; Filter to only valid registry schemas and sort for deterministic order
  (let [valid-refs (->> initial-refs
                        (filter registry-schema?)
                        (sort-by str)
                        vec)]
    (loop [pending-refs valid-refs
           processed    #{}
           aliases      []]
      (if (empty? pending-refs)
        (str/join "\n\n" aliases)
        (let [current-ref (first pending-refs)
              remaining   (rest pending-refs)]
          (if (processed current-ref)
            (recur (vec remaining) processed aliases)
            ;; Expand this ref and collect any new refs it discovers
            (let [new-refs-atom (atom #{})
                  type-def     (binding [*registry-refs* new-refs-atom
                                         *seen*          #{}]
                                 (try
                                   (schema->ts (mr/resolve-schema current-ref))
                                   (catch Exception e
                                     (log/warn "Failed to expand schema for type alias"
                                               {:schema current-ref :error (.getMessage e)})
                                     "unknown")))
                  ;; Use base-type-name for the definition (no Shared. prefix)
                  type-name    (base-type-name current-ref)
                  ;; Generate alias even for unknown types - they may be referenced elsewhere
                  alias-decl   (str "export type " type-name " = " type-def ";")
                  ;; Filter new refs to only valid registry schemas, exclude self-refs, sort for determinism
                  new-refs     (->> @new-refs-atom
                                    (remove #(= % current-ref))
                                    (filter registry-schema?)
                                    (remove processed)
                                    (sort-by str))]
              (recur (vec (concat remaining new-refs))
                     (conj processed current-ref)
                     (conj aliases alias-decl)))))))))

(defn- collect-registry-refs
  "Cheaply collect direct registry schema refs from a schema form without generating TypeScript strings. This is
  intentionally conservative: if a literal keyword also happens to name a registry schema, collecting it can only create
  an unused alias, which is safer than missing a real dependency."
  [schema]
  (let [refs (atom #{})]
    (walk/postwalk (fn [form]
                     (when (and (keyword? form)
                                (namespace form)
                                (registry-schema? form))
                       (swap! refs conj form))
                     form)
                   schema)
    @refs))

(defn- collect-refs-from-defs
  "Collect all registry schema refs used by a set of defs without generating full TypeScript. Returns a set of
  qualified keywords."
  [defs]
  (reduce (fn [refs {:keys [schema ns] fqname :name}]
            (try
              (let [resolved-schema (resolve-var-refs (or ns fqname) schema)]
                (into refs (collect-registry-refs resolved-schema)))
              (catch clojure.lang.ExceptionInfo e
                (if (= :malli.core/sci-not-available (:type (ex-data e)))
                  refs
                  (do
                    (log/warn "Failed to collect TypeScript schema refs" {:name fqname :error (.getMessage e)})
                    refs)))
              (catch Exception e
                (log/warn "Failed to collect TypeScript schema refs" {:name fqname :error (.getMessage e)})
                refs)))
          #{}
          (vals defs)))

(defn- ts-content
  "Generate TypeScript content for a namespace.
   - defs: map of def name -> metadata
   - shared-types: set of schema keywords that are defined in shared.d.ts
   - ns-refs: set of registry refs used by this namespace (from first pass)"
  ([defs]
   (ts-content defs #{} #{}))
  ([defs shared-types]
   (ts-content defs shared-types #{}))
  ([defs shared-types ns-refs]
   (binding [*registry-refs* (atom #{})]
     (let [fn-defs (->> (vals defs)
                        (keep (fn [defmeta]
                                (binding [*current-def* (name (:name defmeta))]
                                  (def->ts defmeta))))
                        (str/join "\n\n"))
           ;; Use pre-collected refs from first pass, filter out shared types
           local-refs (remove shared-types ns-refs)
           type-aliases (generate-type-aliases local-refs)
           ;; Add import for shared types if any refs are in shared-types
           shared-refs-used (filter shared-types ns-refs)
           import-stmt (when (seq shared-refs-used)
                         "import type * as Shared from './metabase.lib.shared';\n\n")]
       (str (or import-stmt "")
            (if (seq type-aliases)
              (str "// Type aliases for registry schemas\n" type-aliases "\n\n" fn-defs)
              fn-defs))))))

(defn- try-require-ns
  "Try to require a namespace on the Clojure side. Returns true if successful, false if the namespace
   doesn't exist (e.g., .cljs only files). Logs a debug message on failure."
  [ns]
  (try
    (require ns)
    true
    (catch java.io.FileNotFoundException _
      (log/debug "Skipping cljs-only namespace" {:ns ns})
      false)))

(defn- generate-shared-types-content
  "Generate content for the shared types file.
   Takes a set of schema keywords that should be defined in the shared file."
  [shared-refs]
  (binding [*shared-types* #{}]  ; No Shared. prefix when defining in shared file
    (let [type-aliases (generate-type-aliases shared-refs)]
      (str "// Shared type aliases for registry schemas used by multiple modules\n"
           "// Auto-generated - do not edit\n\n"
           type-aliases))))

(defn- generate-reexports
  "Generate re-export statements for metabase.lib.js.d.ts to re-export from all metabase.* modules."
  [all-namespaces]
  (let [;; Filter to all metabase.* namespaces, excluding metabase.lib.js itself
        reexport-nses (->> all-namespaces
                           (filter (fn [ns]
                                     (and (str/starts-with? (str ns) "metabase.")
                                          (not= ns 'metabase.lib.js))))
                           sort)]
    (when (seq reexport-nses)
      (str "\n// Re-exports from metabase.* modules\n"
           (->> reexport-nses
                (map (fn [ns]
                       (let [fname (comp/munge (str ns))]
                         (str "export * from './" fname "';"))))
                (str/join "\n"))
           "\n"))))

(defn- ns->file-path
  "Convert a namespace symbol to a source file path.
   e.g., metabase.lib.limit -> src/metabase/lib/limit.cljs"
  [ns-sym]
  (let [ns-str (str ns-sym)
        path (-> ns-str
                 (str/replace "." "/")
                 (str/replace "-" "_"))
        base-path (str "src/" path)
        candidates [(str base-path ".cljs")
                    (str base-path ".cljc")
                    (str base-path ".clj")]]
    (or (first (filter #(.exists (java.io.File. ^String %)) candidates))
        (str base-path ".cljs"))))

(defn- output-weak-type-warnings!
  "Output warnings for namespaces that have any/unknown types."
  [weak-types]
  (when (seq weak-types)
    (log/warn "=== TypeScript generation: files with weak types (any/unknown) ===")
    (doseq [[ns entries] (sort-by key weak-types)]
      (let [any-count (count (filter #(= :any (:type %)) entries))
            unknown-count (count (filter #(= :unknown (:type %)) entries))
            file-path (ns->file-path ns)]
        (log/warn (str "  " file-path " - any: " any-count ", unknown: " unknown-count))))
    (log/warn "Set MB_DEBUG_CLJS=verbose to list entities with weak types")
    (when (= "verbose" (System/getenv "MB_DEBUG_CLJS"))
      (log/warn "=== Entities with weak types ===")
      (doseq [[ns entries] (sort-by key weak-types)]
        (let [by-def (group-by :def entries)]
          (log/warn (str "  " (ns->file-path ns) ":"))
          (doseq [[def-name def-entries] (sort-by key by-def)]
            (let [types (->> def-entries (map :type) distinct sort (map name) (str/join ", "))]
              (log/warn (str "    " def-name " [" types "]")))))))))

(defn produce-dts
  "Shadow-cljs build hook that writes generated TypeScript declaration files for schema-annotated CLJS vars."
  {:shadow.build/stage :flush}
  [state]
  (binding [*weak-types* (when (debug-cljs?) (atom {}))]
    (let [nses       (get-in state [:compiler-env ::ana/namespaces])
          total      (count nses)
          nses-defs  (keep (fn [[ns {:keys [defs]}]]
                             (let [defs (m/filter-vals :schema defs)]
                               (when (seq defs)
                                 [ns defs])))
                           nses)
          defs-count (count nses-defs)]
      (log/info "Compiling TypeScript defs" {:namespaces defs-count :total total})
      ;; First pass: require all namespaces and collect refs to count usage
      (log/debug "Pass 1: Collecting type references across all namespaces")
      (doseq [[ns _defs] nses-defs]
        (try-require-ns ns))
      (let [;; Collect refs from each namespace
            ns-refs (into {}
                          (for [[ns defs] nses-defs]
                            [ns (binding [*current-ns* ns]
                                  (collect-refs-from-defs defs))]))
            ;; Count how many namespaces reference each schema
            ref-counts (frequencies (mapcat val ns-refs))
            ;; Shared types are those used by 2+ namespaces
            shared-refs (into #{} (keep (fn [[ref cnt]] (when (>= cnt 2) ref)) ref-counts))]
        (log/info "Shared types analysis" {:total-refs (count ref-counts)
                                           :shared-refs (count shared-refs)})
        ;; Generate shared.d.ts
        (when (seq shared-refs)
          (let [f (b.data/output-file state "metabase.lib.shared.d.ts")]
            (binding [*current-ns* 'metabase.lib.shared]
              (spit f (generate-shared-types-content shared-refs)))
            (log/debug "Generated shared types file" {:types (count shared-refs)})))
        ;; Second pass: generate per-namespace files
        (log/debug "Pass 2: Generating per-namespace type files")
        (let [lib-namespaces (map first nses-defs)]
          (doseq [[ns defs] nses-defs]
            (let [t     (u/start-timer)
                  fname (comp/munge (str ns))
                  f     (b.data/output-file state (str fname ".d.ts"))
                  this-ns-refs (get ns-refs ns #{})
                  content (binding [*shared-types* shared-refs
                                    *current-ns*   ns]
                            (ts-content defs shared-refs this-ns-refs))
                  ;; Add re-exports for metabase.lib.js
                  content (if (= ns 'metabase.lib.js)
                            (let [all-nses (if (seq shared-refs)
                                             (cons 'metabase.lib.shared lib-namespaces)
                                             lib-namespaces)]
                              (str content (generate-reexports all-nses)))
                            content)]
              (spit f content)
              (log/debug "Type generation completed" {:ns ns :time (u/since-ms t)})))))
      ;; Output warnings if debug mode is on
      (when *weak-types*
        (output-weak-type-warnings! @*weak-types*))
      (log/info "TypeScript defs compilation complete" {:namespaces defs-count})))
  state)
