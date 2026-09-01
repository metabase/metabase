(ns metabase.typed-schemas.javascript
  "A small TypeScript AST encoded as tagged vectors, and a printer for it.

  The AST covers exactly the subset of TypeScript that typed-schema modules
  emit. Expressions:

    [:lit 42]                        ; any JSON-encodable literal
    [:ref \"tables\" \"orders\" :fields]  ; property path => tables.orders.fields
    [:call \"pickFields\" expr ...]    ; call expression, args printed inline
    [:arr expr-or-item ...]          ; array literal
    [:obj entry ...]                 ; object literal

  Object entries are `[key expr]` or `[key {:comments [...]} expr]`; array
  items are bare expressions or `[:item {:comments [...]} expr]`. Comments are
  plain strings; the printer prefixes them with `//` on their own lines above
  the entry. Statements:

    [:const \"tables\" expr]           ; const tables = <expr> as const;
    [:raw \"function helper() {...}\"] ; verbatim TypeScript
    [:export-default expr]           ; export default <expr>;
    [:module statement ...]          ; one printed file

  For example:

    [:module
     [:const \"tables\"
      [:obj [\"orders\" {:comments [\"Entity ID: abc123\"]}
             [:obj [\"type\" [:lit \"table\"]]
                   [\"ids\" [:arr [:lit 1] [:lit 2]]]]]]]
     [:export-default [:ref \"tables\"]]]

  prints as:

    const tables = {
      // Entity ID: abc123
      orders: {
        type: \"table\",
        ids: [ 1, 2 ]
      }
    } as const;

    export default tables;

  Rendering rules: arrays whose items are all literals print on one line;
  `:call` arguments always print inline; object keys print bare when they are
  valid JavaScript identifiers and quoted otherwise. [[render-js]] prints a
  `:module`; [[Module]] is the Malli schema for the whole grammar.

  The printer is deliberately option-free and policy-free: decisions about
  *what* to emit (runtime keys, comments, compaction) belong in
  `metabase.typed-schemas.render`, which builds this AST. If the output needs
  new syntax, add a node type and its printer here rather than concatenating
  TypeScript strings elsewhere."
  (:require
   [clojure.string :as str]
   [metabase.util :as u]
   [metabase.util.json :as json]))

(set! *warn-on-reflection* true)

(def ^:private expression-tags
  #{:lit :ref :call :arr :obj})

(def ^:private key-schema
  [:or :string :keyword])

(def Module
  "Malli schema for the TypeScript AST accepted by [[render-js]]."
  [:schema {:registry
            {::comment-options [:map {:closed true}
                                [:comments {:optional true} [:sequential :string]]]
             ::entry           [:or
                                [:tuple key-schema [:ref ::expr]]
                                [:tuple key-schema [:ref ::comment-options] [:ref ::expr]]]
             ::item            [:tuple [:= :item] [:ref ::comment-options] [:ref ::expr]]
             ::expr            [:multi {:dispatch first}
                                [:lit [:tuple [:= :lit] :any]]
                                [:ref [:cat [:= :ref] [:+ key-schema]]]
                                [:call [:cat [:= :call] :string [:* [:schema [:ref ::expr]]]]]
                                [:arr [:cat [:= :arr] [:* [:or
                                                           [:schema [:ref ::item]]
                                                           [:schema [:ref ::expr]]]]]]
                                [:obj [:cat [:= :obj] [:* [:schema [:ref ::entry]]]]]]
             ::statement       [:multi {:dispatch first}
                                [:const [:tuple [:= :const] key-schema [:ref ::expr]]]
                                [:raw [:tuple [:= :raw] :string]]
                                [:export-default [:tuple [:= :export-default] [:ref ::expr]]]]}}
   [:cat [:= :module] [:* [:schema [:ref ::statement]]]]])

(defn expression?
  "Returns true when `value` is an AST expression node."
  [value]
  (and (vector? value)
       (contains? expression-tags (first value))))

(defn call?
  "Returns true when `value` is a `[:call ...]` expression node."
  [value]
  (and (vector? value)
       (= :call (first value))))

(def ^:private js-identifier-pattern
  #"[A-Za-z_$][A-Za-z0-9_$]*")

(defn- spaces
  [indent]
  (apply str (repeat indent " ")))

(defn- javascript-key
  "Renders a value as a JavaScript object key.

  Valid identifiers render bare e.g. orders; everything else renders as a quoted
  property name e.g. \"orders-by-month\"."
  [entry-key]
  (let [key-name (u/qualified-name entry-key)]
    (if (re-matches js-identifier-pattern key-name)
      key-name
      (json/encode key-name))))

(defn- reference-path
  "Renders `[:ref ...]` segments as a JavaScript property path."
  [path-segments]
  (str (u/qualified-name (first path-segments))
       (apply str (for [path-segment (rest path-segments)]
                    (let [segment-name (u/qualified-name path-segment)]
                      (if (re-matches js-identifier-pattern segment-name)
                        (str "." segment-name)
                        (str "[" (json/encode segment-name) "]")))))))

(defn- entry-parts
  "Returns `[key comment-options expr]` for either entry form."
  [entry]
  (if (= 3 (count entry))
    entry
    [(first entry) nil (second entry)]))

(defn- item-parts
  "Returns `[comment-options expr]` for either array item form."
  [item]
  (if (and (vector? item) (= :item (first item)))
    [(second item) (nth item 2)]
    [nil item]))

(defn- comment-block
  "Returns `// ...` comment lines followed by a newline, or nil without comments."
  [indent comments]
  (when (seq comments)
    (str (str/join "\n" (map #(str (spaces indent) "// " %) comments)) "\n")))

(declare render-expression)

(defn- render-inline
  "Renders an expression on a single line, for `:call` arguments."
  [node]
  (case (first node)
    :lit  (json/encode (second node))
    :ref  (reference-path (rest node))
    :call (let [[_ function-name & args] node]
            (str function-name "(" (str/join ", " (map render-inline args)) ")"))
    :arr  (str "[ " (str/join ", " (map render-inline (rest node))) " ]")
    :obj  (str "{ "
               (str/join ", " (for [entry (rest node)
                                    :let [[entry-key _ expr] (entry-parts entry)]]
                                (str (javascript-key entry-key) ": " (render-inline expr))))
               " }")))

(defn- literal-node?
  [node]
  (and (vector? node) (= :lit (first node))))

(defn- render-object
  [entries indent]
  (if (empty? entries)
    "{ }"
    (str "{\n"
         (str/join ",\n"
                   (for [entry entries
                         :let [[entry-key options expr] (entry-parts entry)
                               entry-indent (+ indent 2)]]
                     (str (comment-block entry-indent (:comments options))
                          (spaces entry-indent)
                          (javascript-key entry-key)
                          ": "
                          (render-expression expr entry-indent))))
         "\n" (spaces indent) "}")))

(defn- render-array
  [items indent]
  (cond
    (empty? items)
    "[ ]"

    (every? literal-node? items)
    (str "[ " (str/join ", " (map #(json/encode (second %)) items)) " ]")

    :else
    (str "[\n"
         (str/join ",\n"
                   (for [item items
                         :let [[options expr] (item-parts item)
                               item-indent (+ indent 2)]]
                     (str (comment-block item-indent (:comments options))
                          (spaces item-indent)
                          (render-expression expr item-indent))))
         "\n" (spaces indent) "]")))

(defn- render-expression
  [node indent]
  (case (first node)
    :lit  (json/encode (second node))
    :ref  (reference-path (rest node))
    :call (render-inline node)
    :obj  (render-object (rest node) indent)
    :arr  (render-array (rest node) indent)))

(defn- render-statement
  [statement]
  (case (first statement)
    :raw            (second statement)
    :const          (let [[_ const-name expr] statement]
                      (str "const " (u/qualified-name const-name) " = "
                           (render-expression expr 0) " as const;"))
    :export-default (str "export default " (render-expression (second statement) 0) ";")))

(defn render-js
  "Renders a `[:module ...]` AST as TypeScript source."
  [[_ & statements]]
  (str (str/join "\n\n" (map render-statement statements)) "\n"))
