(ns mage.cljts.rules.malli
  "Malli schemas. Input schemas (on function parameters) become TypeScript types, since that's where a TS reader
  expects them. Return schemas become a plain-English `Returns:` line in the doc comment, with a short return type."
  (:require
   [clojure.string :as str]
   [mage.cljts.doc :as d]
   [mage.cljts.names :as names]
   [mage.cljts.parse :as p]
   [mage.cljts.rules.core :as rc]
   [mage.cljts.translate :as t]
   [rewrite-clj.node :as n]))

(set! *warn-on-reflection* true)

(def ^:private primitive-types
  {"string" "string" "int" "number" "double" "float" "number" "number" "nat-int" "number" "pos-int" "number"
   "boolean" "boolean" "keyword" "Keyword" "qualified-keyword" "Keyword" "symbol" "Symbol" "any" "any"
   "nil" "null" "uuid" "UUID" "map" "object" "some" "NonNull" "re" "RegExp"
   "string?" "string" "int?" "number" "integer?" "number" "number?" "number" "pos-int?" "number"
   "nat-int?" "number" "boolean?" "boolean" "map?" "object" "any?" "any" "keyword?" "Keyword" "nil?" "null"
   "fn?" "Function" "ifn?" "Function" "uuid?" "UUID" "sequential?" "any[]" "set?" "Set<any>"})

(defn- reverse-alias [ctx full-ns]
  (some (fn [[alias ns]] (when (= ns full-ns) alias)) (:aliases (:info ctx))))

(defn schema-name
  "A type name for a schema keyword: `::card` -> `Card`, `::lib.schema.id/table` -> `lib.schema.id.Table`."
  [ctx node]
  (let [k (:k node)]
    (cond
      (and (:auto-resolved? node) (namespace k)) (str (namespace k) "." (names/pascal (name k)))
      (:auto-resolved? node)                     (names/pascal (name k))
      (namespace k)                              (let [ns (namespace k)]
                                                   (str (or (reverse-alias ctx ns) ns) "." (names/pascal (name k))))
      :else                                      (get primitive-types (name k) (names/pascal (name k))))))

(declare type-doc)

(defn- props-and-children
  "[props-node-or-nil children] for a schema vector's arguments."
  [args]
  (if (p/map-node? (first args)) [(first args) (rest args)] [nil args]))

(defn- optional? [props]
  (boolean (when props
             (some (fn [[k v]] (and (= :optional (:k k)) (true? (:value v))))
                   (partition 2 (p/forms props))))))

(defn- union [ctx nodes]
  [:group (d/join [:line "| "] (mapv #(type-doc ctx %) nodes))])

(defn- map-type [ctx entries]
  (d/bracket "{"
             (vec (for [e entries
                        :let [e* (p/unwrap-meta e)]]
                    (if (p/vector-node? e*)
                      (let [[k & more] (p/forms e*)
                            [props [schema]] (props-and-children more)
                            key-str (if (p/keyword-node? k) (t/keyword-string ctx k) (d/flat-string (t/expr ctx k)))]
                        [(names/prop-key key-str) (when (optional? props) "?") ": "
                         (if schema (type-doc ctx schema) "any")])
                      [(names/prop-key (if (p/keyword-node? e*) (t/keyword-string ctx e*) "?")) ": any"])))
             "}" true))

(defn type-doc
  "A TypeScript type for Malli schema `node`."
  [ctx node]
  (let [node (p/unwrap-meta node)]
    (cond
      (p/keyword-node? node) (schema-name ctx node)
      (p/symbol-node? node)  (let [s (str (p/sym node))]
                               (or (get primitive-types s)
                                   (when (and (str/ends-with? s "?") (not (namespace (p/sym node))))
                                     (names/camel (subs s 0 (dec (count s)))))
                                   (t/sym-doc ctx (p/sym node))))
      (p/string-node? node)  (n/string node)
      (p/vector-node? node)
      (let [[op & args] (p/forms node)
            [_props children] (props-and-children args)
            op-name (when (p/keyword-node? op) (name (:k op)))]
        (case op-name
          "map"                          (map-type ctx children)
          "maybe"                        [(type-doc ctx (first children)) " | null"]
          ("or" "orn")                   (union ctx (if (= op-name "orn") (map #(last (p/forms %)) children) children))
          ("and" "merge")                [:group (d/join [:line "& "] (mapv #(type-doc ctx %) children))]
          "enum"                         [:group (d/join [:line "| "] (mapv #(t/expr ctx %) children))]
          "="                            (t/expr ctx (first children))
          ("sequential" "vector" "*" "+" "cat")
          (let [inner (type-doc ctx (first children))]
            (if (or (> (count children) 1) (d/has-hardline? inner) (vector? inner))
              ["Array<" inner ">"]
              [inner "[]"]))
          "set"                          ["Set<" (type-doc ctx (first children)) ">"]
          "tuple"                        (d/bracket "[" (mapv #(type-doc ctx %) children) "]")
          "map-of"                       ["Record<" (type-doc ctx (first children)) ", " (type-doc ctx (second children)) ">"]
          ("ref" "schema")               (type-doc ctx (first children))
          "?"                            [(type-doc ctx (first children)) " | undefined"]
          "multi"                        (union ctx (map #(last (p/forms %)) children))
          "not"                          ["Exclude<any, " (type-doc ctx (first children)) ">"]
          "fn"                           ["any /* where " (d/flat-string (rc/fn-arg ctx (first children))) " */"]
          ("string" "int" "double" "boolean" "keyword" "uuid" "any" "nil" "re" "qualified-keyword" "symbol")
          (get primitive-types op-name)
          (t/raw-doc node)))
      :else (t/raw-doc node))))

;;; ------------------------------------------------ English descriptions ----------------------------------------

(declare describe)

(defn- describe-map [ctx entries]
  (let [parts (for [e entries
                    :let [e* (p/unwrap-meta e)]
                    :when (p/vector-node? e*)
                    :let [[k & more] (p/forms e*)
                          [props [schema]] (props-and-children more)]]
                (str (if (p/keyword-node? k) (t/keyword-string ctx k) "?")
                     " (" (when (optional? props) "optional ") (if schema (describe ctx schema) "anything") ")"))]
    (if (seq parts)
      (str "a map with " (str/join ", " parts))
      "a map")))

(defn describe
  "A short English description of Malli schema `node`, used for return values."
  [ctx node]
  (let [node (p/unwrap-meta node)]
    (cond
      (p/keyword-node? node) (let [nm (schema-name ctx node)]
                               (if (= nm "null") "nil" nm))
      (p/symbol-node? node)  (d/flat-string (type-doc ctx node))
      (p/vector-node? node)
      (let [[op & args] (p/forms node)
            [_ children] (props-and-children args)
            op-name (when (p/keyword-node? op) (name (:k op)))]
        (case op-name
          "map"                    (describe-map ctx children)
          "maybe"                  (str (describe ctx (first children)) ", or nil")
          ("or" "multi" "orn")     (str/join " or " (map #(describe ctx (if (#{"multi" "orn"} op-name) (last (p/forms %)) %)) children))
          ("and" "merge")          (str/join " that is also " (map #(describe ctx %) children))
          "enum"                   (str "one of " (str/join ", " (map #(d/flat-string (t/expr ctx %)) children)))
          ("sequential" "vector" "*" "+") (str "a list of " (describe ctx (first children)))
          "set"                    (str "a set of " (describe ctx (first children)))
          "tuple"                  (str "a tuple of [" (str/join ", " (map #(describe ctx %) children)) "]")
          "map-of"                 (str "a map from " (describe ctx (first children)) " to " (describe ctx (second children)))
          (d/flat-string (type-doc ctx node))))
      :else (d/flat-string (type-doc ctx node)))))

(defn return-doc
  "For a return schema: a short type, plus an English description when the schema is too involved to read as a
  type name."
  [ctx node]
  (let [ty (type-doc ctx node)
        s  (d/flat-string ty)]
    (if (and (<= (count s) 40) (not (d/has-hardline? ty)))
      {:type ty}
      {:type (let [node* (p/unwrap-meta node)
                   op    (when (p/vector-node? node*) (some-> (first (p/forms node*)) :k name))]
               (case op
                 "map"                             "object"
                 ("sequential" "vector" "set")     "Array<…>"
                 "Result"))
       :description (describe ctx node)})))

(alter-var-root #'t/*schema-type* (constantly type-doc))
(alter-var-root #'rc/*return-doc* (constantly return-doc))

;;; ------------------------------------------------ Rules -------------------------------------------------------

(t/defstmt '#{metabase.util.malli/defn metabase.util.malli/defn-}
  (fn [ctx node _args]
    (let [parsed (rc/parse-defn node)]
      (rc/function-stmts ctx (cond-> parsed
                               (= 'metabase.util.malli/defn- (t/resolve-head ctx node)) (update :flags conj :private-fn))
                         {}))))

(t/defexpr 'metabase.util.malli/fn
  (fn [ctx node _args]
    (let [fs    (rest (p/forms node))
          fs    (if (p/symbol-node? (first fs)) (rest fs) fs)
          [ret fs] (if (= :- (:k (first fs))) [(second fs) (drop 2 fs)] [nil fs])
          pvec  (first fs)
          skip  (- (count (p/forms node)) (count (rest fs)))
          a     (t/arrow ctx pvec (p/entries node skip))]
      (if ret
        (let [[head arrow-sym & body] a] [head ": " (:type (return-doc ctx ret)) arrow-sym body])
        a))))

(t/defstmt 'metabase.util.malli.registry/def
  (fn [ctx _node [k & more]]
    (let [[doc schema] (if (and (p/string-node? (first more)) (next more))
                         [(p/string-value (first more)) (second more)]
                         [nil (first more)])]
      (-> []
          (cond-> doc (conj (t/jsdoc doc)))
          (conj ["type " (if (p/keyword-node? k) (schema-name ctx k) (d/flat-string (t/expr ctx k)))
                 " = " (type-doc ctx schema) ";"])))))

(t/defstmt 'metabase.util.malli/defmethod
  (fn [ctx node [name-node dispatch & more]]
    (let [[ret more] (if (= :- (:k (first more))) [(second more) (drop 2 more)] [nil more])]
      (rc/method-stmts ctx node {:name-doc     (t/expr ctx name-node)
                                 :dispatch-node dispatch
                                 :params-node  (first more)
                                 :ret-schema   ret
                                 :skip         (- (count (p/forms node)) (count (rest more)))}))))
