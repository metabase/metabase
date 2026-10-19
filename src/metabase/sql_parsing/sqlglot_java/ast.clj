(ns metabase.sql-parsing.sqlglot-java.ast
  "Wrappers for the common node operations of the Java port of sqlglot (`com.metabase:sqlglot-core`): parse,
  generate, walk, read and set arguments, build nodes. Function names follow the sqlglot Python API they stand in for
  (`sql_tools.py` is the reference).

  The other `metabase.sql-parsing.sqlglot-java.*` namespaces use these and also call the port's `Scope`, `Qualify`,
  `Lineage` and expression classes directly. The boundary is that directory, as [[metabase.sql-parsing.sqlglot-java]]
  describes."
  (:require
   [clojure.string :as str]
   [metabase.util :as u])
  (:import
   (com.metabase.sqlglot SqlGlot)
   (com.metabase.sqlglot.ast Ast AstNode Expr Expressions$Identifier Expressions$Table)
   (com.metabase.sqlglot.reference Generator ParseError Tokenizer)
   (com.metabase.sqlglot.reference.dialects Dialect)
   (com.metabase.sqlglot.tokens Token)
   (java.util List Map)
   (java.util.stream Stream)))

(set! *warn-on-reflection* true)

;;; ------------------------------------------------ parse and generate ------------------------------------------------

(defn parse
  "Every statement in `sql`, as `sqlglot.parse` returns them: nil for the empty statement a stray semicolon leaves."
  ^List [^String sql ^String dialect]
  (SqlGlot/parse sql dialect))

(defn parse-one
  "The single statement in `sql` (`sqlglot.parse_one`)."
  ^Expr [^String sql ^String dialect]
  (SqlGlot/parseOne sql dialect))

(defn sql
  "`expr` as SQL in `dialect` (`Expression.sql`)."
  ^String [^Expr expr ^String dialect]
  (SqlGlot/generate expr dialect))

(defn pretty-sql
  "`expr` as pretty-printed SQL in `dialect`, generated in place (`Dialect.generate(copy=False, pretty=True)`)."
  ^String [^Expr expr ^String dialect]
  (.sqlPretty (Generator/forDialect dialect) expr))

(defn tokenize
  "`sql` as `[token-type text start]` triples (`sqlglot.tokenize`)."
  [^String sql ^String dialect]
  (mapv (fn [^Token token] [(str (.type token)) (.text token) (.start token)])
        (.tokenize (Tokenizer. dialect) sql)))

;;; ------------------------------------------------------- nodes -------------------------------------------------------

(defn arg
  "The value of `node`'s argument `k` (`node.args.get(k)`)."
  [^Expr node ^String k]
  (when node
    (.get node k)))

(defn text
  "The text of `node`'s argument `k`, or \"\" when it has none (`node.text(k)`, behind `.table`, `.db`, `.catalog`)."
  ^String [^Expr node ^String k]
  (.text node k))

(defn node-name
  "`node.name`."
  ^String [^Expr node]
  (.name node))

(defn node-alias
  "`node.alias`, \"\" when it has none."
  ^String [^Expr node]
  (.alias node))

(defn this
  "`node.this`."
  [^Expr node]
  (.get node "this"))

(defn expressions
  "`node.expressions`."
  [^Expr node]
  (vec (.expressions node)))

(defn parent
  "`node.parent`."
  ^Expr [^Expr node]
  (.parent node))

(defn args
  "`node.args`, as a map of argument name to value."
  ^Map [^Expr node]
  (.args node))

(defn set-arg!
  "Set `node`'s argument `k` to `value` (`node.set(k, value)`). Returns `node`."
  ^Expr [^Expr node ^String k value]
  (.set node k value))

(defn replace!
  "Replace `node` in its tree with `replacement` (`node.replace(replacement)`)."
  [^Expr node replacement]
  (.replace node replacement))

(defn copy
  "A deep copy of `node`."
  ^Expr [^Expr node]
  (.copy node))

(defn- stream-seq [^Stream stream]
  (iterator-seq (.iterator stream)))

(defn find-all
  "Every node of one of `classes` under `node`, `node` included, breadth first (`node.find_all(*classes)`)."
  [^Expr node & classes]
  (stream-seq (.findAll node true ^"[Ljava.lang.Class;" (into-array Class classes))))

(defn walk
  "Every node under `node`, `node` included, breadth first (`node.walk()`)."
  [^Expr node]
  (stream-seq (.walk node)))

(defn iter-expressions
  "`node`'s child nodes (`node.iter_expressions()`)."
  [^Expr node]
  (vec (.iterExpressions node)))

(defn quoted?
  "Whether `node` is a quoted identifier."
  [node]
  (and (instance? Expressions$Identifier node)
       (boolean (arg node "quoted"))))

(defn sql-name
  "The SQL name of the function `node` is (`Func.sql_name()`)."
  ^String [^Expr node]
  (let [definition (.definition node)]
    (or (first (.sqlNames definition))
        (-> (.name definition)
            (str/replace #"([a-z0-9])([A-Z])" "$1_$2")
            u/upper-case-en))))

;;; ---------------------------------------------------- builders ----------------------------------------------------

(defn create
  "A new node of the expression type `type-name` with `args` (`exp.<type-name>(**args)`)."
  (^Expr [^String type-name]
   (Ast/create type-name))
  (^Expr [^String type-name ^Map args]
   (Ast/create type-name args)))

(defn identifier
  "An identifier node (`exp.Identifier(this=name, quoted=quoted?)`)."
  ^Expr [^String name quoted?]
  (Ast/identifier name (boolean quoted?)))

(defn to-identifier
  "`name` as an identifier, quoted unless it is safe bare (`exp.to_identifier`)."
  ^Expr [^String name]
  (identifier name (not (Dialect/safeIdentifier name))))

(defn to-table
  "`table-name` as a Table node (`exp.to_table`): parsed in the default dialect, or, when that fails, split on dots
  into catalog, schema and table identifiers."
  ^Expr [^String table-name]
  (try
    (SqlGlot/parseOne table-name nil Expressions$Table)
    (catch ParseError e
      (let [[catalog db this] (take-last 3 (concat [nil nil] (str/split table-name #"\." 3)))]
        (when (str/blank? this)
          (throw e))
        (create "Table" (cond-> {"this" (to-identifier this)}
                          db      (assoc "db" (to-identifier db))
                          catalog (assoc "catalog" (to-identifier catalog))))))))

;;; ------------------------------------------------------ errors ------------------------------------------------------

(defn python-error
  "An exception for a failure `sql_tools.py` raises itself, which [[metabase.sql-parsing.sqlglot-java/parser]] reports
  under the Python error name `error-type`, e.g. `\"ValueError\"`."
  [error-type message]
  (ex-info message {::python-error-type error-type}))

(defn python-error-type
  "The Python error name of an exception made by [[python-error]], else nil."
  [e]
  (::python-error-type (ex-data e)))

(defn lower
  "`s` lower-cased, nil for nil."
  [s]
  (some-> s u/lower-case-en))

(defn instance-of-any?
  "Whether `node` is an instance of one of `classes`."
  [classes node]
  (some #(instance? ^Class % node) classes))

(defn ast-class
  "The port's class for the expression type `type-name`, e.g. `\"Select\"`."
  ^Class [^String type-name]
  (Class/forName (str "com.metabase.sqlglot.ast.Expressions$" type-name)))

(defn ast-node?
  "Whether `x` is one of the port's AST nodes, which must never leave the shim."
  [x]
  (instance? AstNode x))
