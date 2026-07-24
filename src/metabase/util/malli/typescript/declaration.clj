(ns metabase.util.malli.typescript.declaration
  (:require
   [cljs.compiler :as comp]
   [clojure.string :as str]
   [clojure.walk :as walk]
   [malli.core :as mc]
   [metabase.util :as u]
   [metabase.util.log :as log]
   [metabase.util.malli.typescript.schema :as schema]
   [metabase.util.malli.typescript.type :as type]))

(set! *warn-on-reflection* true)

(def ^:dynamic *registry-refs*
  "Atom collecting registry schema references during type generation. When bound, refs are recorded so we can generate
  type aliases."
  nil)

(def ^:dynamic *local-definitions*
  "Atom collecting inline Malli registry definitions during type generation."
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

(def ^:dynamic ^:private *diagnostics*
  "Atom collecting structured schema compilation diagnostics."
  nil)

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

(defn base-type-name
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
        ;; Entity name: convert to CapitalCase (dots and dashes become CapitalCase).
        ;; Malli registry keywords are case-sensitive, so retain an uppercase marker
        ;; when CapitalCase would otherwise collapse `foo` and `Foo`.
        raw-entity-name (name kw)
        entity-name     (cond-> (to-capital-case raw-entity-name)
                          (Character/isUpperCase ^char (first raw-entity-name))
                          (str "Upper"))]
    (str ns-name "_" entity-name)))

(defn registry-type-name
  "Convert a qualified keyword to a TypeScript type reference. Shared aliases
  receive a `Shared.` prefix when included in `shared-types`."
  ([kw]
   (registry-type-name kw *shared-types*))
  ([kw shared-types]
   (let [base-name (base-type-name kw)]
     (if (contains? shared-types kw)
       (str "Shared." base-name)
       base-name))))

(def ^:dynamic *key-transform*
  "Optional map-key transform applied while generating JS-facing object types."
  nil)

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
(defn- schema->ts-impl
  "Core implementation of schema->ts (non-memoized)."
  [malli-schema]
  (let [compiled    (schema/schema->result malli-schema
                                           {:argument-context? *argument-context*
                                            :key-transform *key-transform*})
        rendered    (type/render (:type compiled) {:ref-name registry-type-name})
        source-type (when (vector? malli-schema) (first malli-schema))]
    (doseq [schema-keyword (:registry-refs compiled)]
      (record-registry-ref! schema-keyword))
    (when *local-definitions*
      (swap! *local-definitions* merge (:local-definitions compiled)))
    (when *diagnostics*
      (swap! *diagnostics* into (:diagnostics compiled)))
    (when (seq (:diagnostics compiled))
      (record-weak-type! :unknown))
    (if (and (contains? #{:or :orn :multi :and :merge} source-type)
             (contains? #{:union :intersection} (:kind (:type compiled))))
      (str "(" rendered ")")
      rendered)))

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

(defn- catn-child-schema
  [child]
  (if (= 3 (count child)) (nth child 2) (nth child 1)))

(defn- arg-schema-children
  [arg-schema]
  (let [malli-schema (mc/schema arg-schema)]
    (case (mc/type malli-schema)
      :catn (map catn-child-schema (mc/children malli-schema))
      (mc/children malli-schema))))

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

(defn- with-seqex-parameter-shape
  [{:keys [arg-schema rest?] :as spec}]
  (let [malli-schema (mc/schema arg-schema)
        schema-type  (mc/type malli-schema)
        [child]      (mc/children malli-schema)]
    (cond
      (= :? schema-type)
      (assoc spec :arg-schema child :optional? true)

      (contains? #{:* :+ :repeat} schema-type)
      (assoc spec
             :arg-schema [:sequential child]
             :rest? true)

      rest?
      spec

      :else
      spec)))

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
                                  fallback)))
            shaped-spec   (fn [spec]
                            (with-seqex-parameter-shape
                              (update spec :arg-schema #(or % (schema-or-pad :any)))))]
        (if (rest-marker? arg-name)
          (if (munged-ampersand? arg-name)
            (recur (next remaining-args)
                   (next remaining-schemas)
                   (inc arg-idx)
                   (conj specs (shaped-spec {:arg-name   'rest
                                             :arg-schema (schema-or-pad [:sequential :any])
                                             :arg-idx    arg-idx
                                             :rest?      true})))
            (if-let [rest-name (second remaining-args)]
              (conj specs (shaped-spec {:arg-name   rest-name
                                        :arg-schema (schema-or-pad [:sequential :any])
                                        :arg-idx    arg-idx
                                        :rest?      true}))
              (do
                (warn-arg-schema-mismatch! "Function arglist has variadic marker without rest arg name"
                                           {:arg-idx arg-idx})
                specs)))
          (recur (next remaining-args)
                 (next remaining-schemas)
                 (inc arg-idx)
                 (conj specs (shaped-spec {:arg-name   arg-name
                                           :arg-schema (schema-or-pad :any)
                                           :arg-idx    arg-idx
                                           :rest?      false}))))))))

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
          (map (fn [{:keys [arg-name arg-schema arg-idx optional? rest?]}]
                 (let [arg-type (if (= arg-idx generic-arg-idx)
                                  (if rest? "T[]" "T")
                                  (schema->ts arg-schema))]
                   (str (when rest? "...")
                        (extract-arg-name arg-name arg-idx)
                        (when optional? "?")
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
                         (fn [{:keys [arg-name arg-schema arg-idx optional? rest?]}]
                           (let [parameter-name (extract-arg-name arg-name arg-idx)]
                             (str " * @param {"
                                  (if (= arg-idx generic-arg-idx)
                                    (if rest? "T[]" "T")
                                    (schema->ts arg-schema))
                                  "} "
                                  (when rest? "...")
                                  (if optional?
                                    (str "[" parameter-name "]")
                                    parameter-name))))
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
          schema (->> schema
                      (resolve-var-refs (or ns fqname))
                      schema/sanitize-predicate-fn-constraints)
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
          schema (->> schema
                      (resolve-var-refs (or ns fqname))
                      schema/sanitize-predicate-fn-constraints)]
      (str (format-const-jsdoc doc schema)
           (format "export const %s: %s;" constname (schema->ts schema))
           "\n"))
    (catch Exception e
      (throw (ex-info (.getMessage e)
                      (assoc (ex-data e)
                             :meta defmeta)
                      e)))))

(defn def->ts
  "Convert an exported def into TypeScript. Dispatches to fn->ts for functions
   and const->ts for constants. Missing or unavailable schemas produce sound
   fallback declarations so runtime exports remain present."
  [defmeta]
  (if-not (:schema defmeta)
    (do
      (record-weak-type! :unknown)
      (indent-ts
       (if (seq (:arglists defmeta))
         (fallback-fn->ts defmeta)
         (fallback-const->ts defmeta))))
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
          (throw e))))))

(defn- declaration-result
  [render defmeta {:keys [current-ns shared-types]
                   :or {shared-types #{}}}]
  (let [registry-refs     (atom #{})
        local-definitions (atom {})
        diagnostics       (atom [])
        weak-types        (atom {})]
    (binding [*registry-refs*     registry-refs
              *local-definitions* local-definitions
              *diagnostics*       diagnostics
              *shared-types*      shared-types
              *current-ns*        current-ns
              *current-def*       (some-> (:name defmeta) name)
              *weak-types*        weak-types]
      {:declaration       (render defmeta)
       :registry-refs     @registry-refs
       :local-definitions @local-definitions
       :diagnostics       (vec (distinct @diagnostics))
       :weak-types        @weak-types})))

(defn fn->result
  "Compile function metadata into declaration text and its reference, local-alias,
  diagnostic, and weak-type dependencies. Options may provide `:current-ns` and
  the set of `:shared-types` rendered through the shared declaration module."
  ([defmeta]
   (fn->result defmeta {}))
  ([defmeta options]
   (declaration-result fn->ts defmeta options)))

(defn const->result
  "Compile constant metadata into declaration text and its reference, local-alias,
  diagnostic, and weak-type dependencies. Options match `fn->result`."
  ([defmeta]
   (const->result defmeta {}))
  ([defmeta options]
   (declaration-result const->ts defmeta options)))

(defn def->result
  "Compile exported def metadata into declaration text and a structured dependency
  result. Options match `fn->result`; schema-less exports receive sound fallbacks."
  ([defmeta]
   (def->result defmeta {}))
  ([defmeta options]
   (declaration-result def->ts defmeta options)))
