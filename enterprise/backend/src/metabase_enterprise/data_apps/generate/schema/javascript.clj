(ns metabase-enterprise.data-apps.generate.schema.javascript
  "A small TypeScript AST encoded as tagged vectors, and a printer for it.

  The AST covers exactly the subset of TypeScript that generated schema modules
  emit. Expressions:

    [:lit 42]                                ; any JSON-encodable literal
    [:ref \"orders\" :fields]                  ; property path => orders.fields
    [:call \"pickFields\" expr ...]            ; call expression, args printed inline
    [:call \"pickFields\" {:pure true} expr ...] ; /* @__PURE__ */ pickFields(...)
    [:arr expr-or-item ...]                  ; array literal
    [:obj entry ...]                         ; object literal

  A pure call is one a bundler may drop when its result is unused. Object
  entries are `[key expr]` or `[key {:metadata {...}} obj]`; array items are
  bare expressions or `[:item {:metadata {...}} obj]`, where `obj` is an
  `[:obj ...]`. Metadata is a JSON-encodable map, printed as a
  `/* metadata: {...} */` block first inside the entry's object, before its
  properties, so a reader meets it before the data it describes and it never
  reaches runtime code. Statements:

    [:const \"orders\" expr]                   ; const orders = <expr> as const;
    [:const \"orders\" {:export true} expr]    ; export const orders = <expr> as const;
    [:raw \"function helper() {...}\"]         ; verbatim TypeScript
    [:module statement ...]                  ; one printed file

  A const's options may also carry `:metadata`, printed inside its object as
  for an entry. For example:

    [:module
     [:const \"orders\" {:export true, :metadata {\"entityId\" \"abc123\"}}
      [:obj [\"type\" [:lit \"table\"]]
            [\"ids\" [:arr [:lit 1] [:lit 2]]]]]]

  prints as:

    export const orders = {
      /* metadata: { \"entityId\": \"abc123\" } */
      type: \"table\",
      ids: [ 1, 2 ]
    } as const;

  Rendering rules: arrays whose items are all literals print on one line;
  `:call` arguments always print inline; object keys print bare when they are
  an [[identifier?]] and quoted otherwise, and an entry whose value is a
  reference to its own key prints as the key alone (`{ orders }`). A metadata block prints on
  one line, nested arrays and objects included, so an entry's metadata is the
  line before its properties and a reader can find it with `grep`. [[render-js]]
  prints a `:module`; [[Module]] is the Malli schema for the whole grammar.

  The printer takes no configuration and makes no policy decisions: decisions about
  *what* to emit (runtime keys, metadata, compaction) belong in
  `metabase-enterprise.data-apps.generate.schema.render`, which builds this AST. If the output needs
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
            {::metadata      [:map-of key-schema :any]
             ::entry-options [:map {:closed true}
                              [:metadata {:optional true} [:ref ::metadata]]]
             ::const-options [:map {:closed true}
                              [:export {:optional true} :boolean]
                              [:metadata {:optional true} [:ref ::metadata]]]
             ::call-options  [:map {:closed true}
                              [:pure {:optional true} :boolean]]
             ;; Metadata prints as a block inside the entry's object, so only an object can carry it.
             ::entry         [:or
                              [:tuple key-schema [:ref ::expr]]
                              [:tuple key-schema [:ref ::entry-options] [:ref ::obj]]]
             ::item          [:tuple [:= :item] [:ref ::entry-options] [:ref ::obj]]
             ::obj           [:cat [:= :obj] [:* [:schema [:ref ::entry]]]]
             ::expr            [:multi {:dispatch first}
                                [:lit [:tuple [:= :lit] :any]]
                                [:ref [:cat [:= :ref] [:+ key-schema]]]
                                [:call [:cat [:= :call] :string [:? [:schema [:ref ::call-options]]] [:* [:schema [:ref ::expr]]]]]
                                [:arr [:cat [:= :arr] [:* [:or
                                                           [:schema [:ref ::item]]
                                                           [:schema [:ref ::expr]]]]]]
                                [:obj [:ref ::obj]]]
             ::statement       [:multi {:dispatch first}
                                [:const [:or
                                         [:tuple [:= :const] key-schema [:ref ::expr]]
                                         [:tuple [:= :const] key-schema [:ref ::const-options] [:ref ::expr]]]]
                                [:raw [:tuple [:= :raw] :string]]]}}
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

;; ASCII only: JavaScript tools disagree on which other letters an identifier can hold.
(def ^:private js-identifier-pattern
  #"[A-Za-z_$][A-Za-z0-9_$]*")

(defn identifier?
  "Returns true when `s` is an identifier name that every JavaScript tool accepts. Reserved words are identifier names."
  [s]
  (boolean (re-matches js-identifier-pattern s)))

(defn- spaces
  [indent]
  (apply str (repeat indent " ")))

(defn- javascript-key
  "Renders a value as a JavaScript object key.

  Valid identifiers render bare e.g. orders; everything else renders as a quoted
  property name e.g. \"orders-by-month\"."
  [entry-key]
  (let [key-name (u/qualified-name entry-key)]
    (if (identifier? key-name)
      key-name
      (json/encode key-name))))

(defn- reference-path
  "Renders `[:ref ...]` segments as a JavaScript property path."
  [path-segments]
  (str (u/qualified-name (first path-segments))
       (apply str (for [path-segment (rest path-segments)]
                    (let [segment-name (u/qualified-name path-segment)]
                      (if (identifier? segment-name)
                        (str "." segment-name)
                        (str "[" (json/encode segment-name) "]")))))))

(defn- entry-parts
  "Returns `[key options expr]` for a node with or without an options map: an object entry, or a const after its tag."
  [entry]
  (if (= 3 (count entry))
    entry
    [(first entry) nil (second entry)]))

(defn- item-parts
  "Returns `[entry-options expr]` for either array item form."
  [item]
  (if (and (vector? item) (= :item (first item)))
    [(second item) (nth item 2)]
    [nil item]))

(defn- shorthand?
  "Returns true when an object entry can print as its key alone: its value is a reference to the binding its key names."
  [entry-key expr]
  (= [:ref (u/qualified-name entry-key)] expr))

(defn- metadata-json
  "Renders `value` as JSON on one line, nested arrays and objects included."
  [value]
  (cond
    (map? value)        (str "{ "
                             (str/join ", " (for [[k v] value]
                                              (str (json/encode (u/qualified-name k)) ": " (metadata-json v))))
                             " }")
    (sequential? value) (str "[ " (str/join ", " (map metadata-json value)) " ]")
    :else               (json/encode value)))

(defn- metadata-block
  "Returns a `/* metadata: {...} */` block. A `*/` can only occur inside a JSON string, where it is written as the
  equivalent `*\\/`, so the block always ends where it should."
  [indent metadata]
  (str (spaces indent) "/* metadata: "
       (str/replace (metadata-json metadata) "*/" "*\\/")
       " */"))

(declare render-expression)

(defn- render-inline
  "Renders an expression on a single line, for `:call` arguments."
  [node]
  (case (first node)
    :lit  (json/encode (second node))
    :ref  (reference-path (rest node))
    :call (let [[_ function-name & args] node
                [options args]           (if (map? (first args))
                                           [(first args) (rest args)]
                                           [nil args])]
            (str (when (:pure options) "/* @__PURE__ */ ")
                 function-name "(" (str/join ", " (map render-inline args)) ")"))
    :arr  (str "[ " (str/join ", " (map render-inline (rest node))) " ]")
    :obj  (str "{ "
               (str/join ", " (for [entry (rest node)
                                    :let [[entry-key options expr] (entry-parts entry)]]
                                (do
                                  ;; An inline object has no room for a block, so refuse rather than drop it.
                                  (when (seq (:metadata options))
                                    (throw (ex-info "Metadata can only be attached to an object on its own lines."
                                                    {:node node})))
                                  (if (shorthand? entry-key expr)
                                    (u/qualified-name entry-key)
                                    (str (javascript-key entry-key) ": " (render-inline expr))))))
               " }")))

(defn- literal-node?
  [node]
  (and (vector? node) (= :lit (first node))))

(defn- render-object
  [entries indent metadata]
  (let [inner-indent (+ indent 2)
        lines        (for [entry entries
                           :let [[entry-key options expr] (entry-parts entry)]]
                       (str (spaces inner-indent)
                            ;; An entry with metadata takes the long form, where render-expression refuses metadata on a
                            ;; reference.
                            (if (and (shorthand? entry-key expr) (empty? (:metadata options)))
                              (u/qualified-name entry-key)
                              (str (javascript-key entry-key)
                                   ": "
                                   (render-expression expr inner-indent (:metadata options))))))
        ;; the block comes first, so a reader meets it before the properties it describes
        body         (str/join "\n" (remove str/blank? [(when (seq metadata) (metadata-block inner-indent metadata))
                                                        (str/join ",\n" lines)]))]
    (if (str/blank? body)
      "{ }"
      (str "{\n" body "\n" (spaces indent) "}"))))

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
                     (str (spaces item-indent)
                          (render-expression expr item-indent (:metadata options)))))
         "\n" (spaces indent) "]")))

(defn- render-expression
  "Renders `node` at `indent`. `metadata`, when present, prints inside `node`, which must then be an object."
  ([node indent]
   (render-expression node indent nil))
  ([node indent metadata]
   (when (and (seq metadata) (not= :obj (first node)))
     (throw (ex-info "Metadata can only be attached to an object." {:node node})))
   (case (first node)
     :lit  (json/encode (second node))
     :ref  (reference-path (rest node))
     :call (render-inline node)
     :obj  (render-object (rest node) indent metadata)
     :arr  (render-array (rest node) indent))))

(defn- render-statement
  [statement]
  (case (first statement)
    :raw            (second statement)
    :const          (let [[const-name options expr] (entry-parts (rest statement))]
                      (str (when (:export options) "export ")
                           "const " (u/qualified-name const-name) " = "
                           (render-expression expr 0 (:metadata options)) " as const;"))))

(defn render-js
  "Renders a `[:module ...]` AST as TypeScript source."
  [[_ & statements]]
  (str (str/join "\n\n" (map render-statement statements)) "\n"))
