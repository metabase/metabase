(ns metabase.util.malli.typescript.type
  (:refer-clojure :exclude [array])
  (:require
   [clojure.string :as str]))

(set! *warn-on-reflection* true)

(defn primitive
  "Return a primitive TypeScript type node."
  [name]
  {:kind :primitive, :name name})

(defn literal
  "Return a TypeScript literal type node."
  [value]
  {:kind :literal, :value value})

(defn raw
  "Return a raw TypeScript type node.

  Raw nodes are an escape hatch for existing explicit `:typescript` metadata."
  [typescript]
  {:kind :raw, :typescript typescript})

(defn unknown
  "Return the TypeScript unknown type node."
  []
  {:kind :unknown})

(defn- flatten-kind
  [kind nodes]
  (mapcat #(if (= kind (:kind %)) (:members %) [%]) nodes))

(defn union
  "Return a normalized TypeScript union node. Unknown absorbs every other member."
  [members]
  (let [members (vec (distinct (flatten-kind :union members)))]
    (cond
      (some #(= :unknown (:kind %)) members) (unknown)
      (empty? members)                         (unknown)
      (= 1 (count members))                    (first members)
      :else                                    {:kind :union, :members members})))

(defn intersection
  "Return a normalized TypeScript intersection node."
  [members]
  (let [members (vec (distinct (flatten-kind :intersection members)))]
    (cond
      (empty? members)      (unknown)
      (= 1 (count members)) (first members)
      :else                 {:kind :intersection, :members members})))

(defn array
  "Return an array node whose values have `element` type."
  [element]
  {:kind :array, :element element})

(defn generic
  "Return a generic TypeScript type node."
  [name arguments]
  {:kind :generic, :name name, :arguments (vec arguments)})

(defn tuple
  "Return a tuple node. `rest` is the repeated element type, not an array node."
  ([items]
   (tuple items nil))
  ([items rest]
   {:kind :tuple, :items (vec items), :rest rest}))

(defn object
  "Return an object node.

  Properties have `:name`, `:type`, and optional `:optional?` keys."
  ([properties]
   (object properties nil))
  ([properties index-signature]
   {:kind :object
    :properties (vec properties)
    :index-signature index-signature}))

(defn function-type
  "Return a function type node.

  Parameters have `:name`, `:type`, and optional `:optional?` or `:rest?` keys.
  An optional `:predicate` (set via [[function-predicate]]) narrows a parameter
  instead of declaring a plain return type."
  [parameters return]
  {:kind :function, :parameters (vec parameters), :return return})

(defn function-predicate
  "Return `function-node` as a type predicate that narrows the parameter at
  `parameter-index` to `type-node`, rendering as `(p: A) => p is B`."
  [function-node parameter-index type-node]
  (assoc function-node :predicate {:parameter parameter-index, :type type-node}))

(defn ref-type
  "Return a registry reference type node."
  [schema-keyword]
  {:kind :ref, :schema-keyword schema-keyword})

(defn key-transform-type
  "Return a node applying the named key-transform helper (e.g. `Camel`) to `inner`."
  [helper-name inner]
  {:kind :key-transform, :name helper-name, :inner inner})

(def ^:private precedence
  {:function     10
   :union        20
   :intersection 30
   :array        40
   :primitive    100
   :literal      100
   :raw          100
   :unknown      100
   :tuple        100
   :object       100
   :generic      100
   :key-transform 100
   :ref          100})

(declare render*)

(defn- compound-raw?
  [typescript]
  (boolean (re-find #"\s(?:\||&|=>)\s" typescript)))

(defn- finite-typescript-number?
  [value]
  (and (number? value)
       (not (ratio? value))
       (Double/isFinite (double value))))

(defn- render-child
  [node parent-precedence options]
  (let [{:keys [text precedence]} (render* node options)]
    (if (< precedence parent-precedence)
      (str "(" text ")")
      text)))

(defn- render-property
  [{:keys [name type optional?]} options]
  (str name (when optional? "?") ": " (render-child type 0 options)))

(defn- render-parameter
  [{:keys [name type optional? rest?]} options]
  (str (when rest? "...")
       name
       (when optional? "?")
       ": "
       (render-child (if rest? (array type) type) 0 options)))

(defn- render-tuple-item
  [item options]
  (if (and (map? item) (contains? item :type))
    (let [{:keys [name type optional?]} item]
      (if name
        (str name (when optional? "?") ": " (render-child type 0 options))
        (str (render-child type 0 options) (when optional? "?"))))
    (render-child item 0 options)))

(defn- render*
  [node {:keys [ref-name] :as options}]
  (let [kind (:kind node)]
    {:precedence (if (and (= kind :raw) (compound-raw? (:typescript node)))
                   0
                   (get precedence kind 0))
     :text
     (case kind
       :primitive
       (:name node)

       :literal
       (let [value (:value node)]
         (cond
           (string? value)                   (pr-str value)
           (keyword? value)                  (pr-str (cond->> (name value)
                                                       (namespace value) (str (namespace value) "/")))
           (char? value)                     (pr-str (str value))
           (boolean? value)                  (str value)
           (nil? value)                      "null"
           (finite-typescript-number? value) (str value)
           :else
           (throw (ex-info "Unsupported TypeScript literal" {:value value}))))

       :raw
       (:typescript node)

       :unknown
       "unknown"

       :union
       (->> (:members node)
            (map #(render-child % (precedence :union) options))
            (str/join " | "))

       :intersection
       (->> (:members node)
            (map #(render-child % (precedence :intersection) options))
            (str/join " & "))

       :array
       (let [element (:element node)
             element-text (render-child element (precedence :array) options)
             ;; A readonly array/tuple in element position must be parenthesized:
             ;; `readonly (readonly A[])[]`, not a double modifier.
             element-text (if (and (:readonly? element)
                                   (contains? #{:array :tuple} (:kind element)))
                            (str "(" element-text ")")
                            element-text)]
         (str (when (:readonly? node) "readonly ")
              element-text "[]"))

       :generic
       (let [arguments (str/join ", " (map #(render-child % 0 options) (:arguments node)))]
         (cond
           (and (:readonly? node) (= "Set" (:name node))) (str "ReadonlySet<" arguments ">")
           (:readonly? node)                    (str "Readonly<" (:name node) "<" arguments ">>")
           :else                                (str (:name node) "<" arguments ">")))

       :tuple
       (str (when (:readonly? node) "readonly ")
            "["
            (str/join
             ", "
             (cond-> (mapv #(render-tuple-item % options) (:items node))
               (:rest node) (conj (str "..." (render-child (array (:rest node)) 0 options)))))
            "]")

       :object
       (let [entries (cond-> (mapv #(render-property % options) (:properties node))
                       (:index-signature node)
                       (conj (str "[key: "
                                  (render-child (:key (:index-signature node)) 0 options)
                                  "]: "
                                  (render-child (:value (:index-signature node)) 0 options))))
             body (if (seq entries)
                    (str "{\n\t" (str/join ";\n\t" entries) ";\n}")
                    "{}")]
         (if (:readonly? node)
           (str "Readonly<" body ">")
           body))

       :function
       (let [predicate (:predicate node)]
         (str "("
              (str/join ", " (map #(render-parameter % options) (:parameters node)))
              ") => "
              (if-let [{:keys [parameter type]} predicate]
                (if-let [parameter-name (:name (get (:parameters node) parameter))]
                  (str parameter-name " is " (render-child type (precedence :function) options))
                  (render-child (:return node) (precedence :function) options))
                (render-child (:return node) (precedence :function) options))))

       :key-transform
       (str (:name node) "<" (render-child (:inner node) 0 options) ">")

       :ref
       (if ref-name
         (ref-name (:schema-keyword node))
         (throw (ex-info "Cannot render a TypeScript ref without :ref-name" {:node node})))

       (throw (ex-info "Unsupported TypeScript type node" {:node node})))}))

(defn render
  "Render a TypeScript type node to source text."
  ([node]
   (render node {}))
  ([node options]
   (:text (render* node options))))
