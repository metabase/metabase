(ns mage.readable.translate
  "The translation engine: turns rewrite-clj nodes into layout docs (see [[mage.readable.doc]]).

  Clojure is expression-oriented and TypeScript isn't, so every translation happens in a *position*, `(:pos ctx)`:

    :stmt    a statement whose value is ignored          `foo();`
    :return  the value is the enclosing function's result `return foo();`
    :yield   the value of a `do { ... }` expression block `foo()`
    :expr    inside an expression                         `foo()`

  Rules are registered per resolved head symbol (e.g. `toucan2.core/select`) with [[defexpr]] (returns a doc) and/or
  [[defstmt]] (returns a vector of statement docs). A rule may return [[decline]] to fall back to the generic
  translation. Anything without a rule becomes a plain function call, and anything that can't be translated at all
  is shown as raw Clojure in a ``clj`...` `` template."
  (:require
   [clojure.string :as str]
   [mage.readable.doc :as d]
   [mage.readable.names :as names]
   [mage.readable.parse :as p]
   [rewrite-clj.node :as n]))

(set! *warn-on-reflection* true)

;;; ------------------------------------------------ Rule registry ------------------------------------------------

(defonce ^:private expr-rules (atom {}))
(defonce ^:private stmt-rules (atom {}))
(defonce ^:private infix-heads (atom {}))

(declare resolve-head)

(def decline
  "Returned by a rule to say \"use the generic translation instead\"."
  ::decline)

(defn- ->syms [ks] (if (coll? ks) ks [ks]))

(defn defexpr
  "Register `f` as the expression translation for the resolved head symbol(s) `ks`. `f` is (fn [ctx node args])."
  [ks f]
  (swap! expr-rules into (map (fn [k] [k f])) (->syms ks)))

(defn defstmt
  "Register `f` as the statement translation for the resolved head symbol(s) `ks`. `f` is (fn [ctx node args]) and
  returns a vector of statement docs for `(:pos ctx)`."
  [ks f]
  (swap! stmt-rules into (map (fn [k] [k f])) (->syms ks)))

(defn definfix
  "Mark head symbol(s) whose translation is an operator expression with precedence `prec` (higher binds tighter,
  like JS: ternary 1, || 2, && 3, == 5, + 6, * 7, unary 8), so they get parenthesized where needed."
  [ks prec]
  (swap! infix-heads into (map (fn [k] [k prec])) (->syms ks)))

(defn precedence
  "The operator precedence of `node`'s translation, or nil for primary expressions (calls, literals)."
  [ctx node]
  (let [node (p/unwrap-meta node)
        k    (resolve-head ctx node)]
    (cond
      (= :fn (p/tag node))                                                 0
      (nil? k)                                                             nil
      (contains? @infix-heads k)                                           (get @infix-heads k)
      (and (contains? @stmt-rules k) (not (contains? @expr-rules k)))       0
      :else                                                                nil)))

;;; ------------------------------------------------ Stats (coverage reporting) -----------------------------------

(def ^:dynamic *stats*
  "When bound to an atom, translation records which heads fell back to generic calls or raw Clojure."
  nil)

(defn note!
  "Record a fallback of `kind` (:generic, :raw, :error) for key `k`."
  [kind k]
  (when *stats*
    (swap! *stats* update-in [kind k] (fnil inc 0))))

;;; ------------------------------------------------ Context helpers ----------------------------------------------

(defn at
  "`ctx` with position `pos` (:stmt, :expr, :return, ...)."
  [ctx pos]
  (assoc ctx :pos pos))
(defn xctx
  "`ctx` in expression position."
  [ctx]
  (assoc ctx :pos :expr))

(defn resolve-head
  "The resolved symbol at the head of list node `node`, or nil."
  [ctx node]
  (when (p/list-node? node)
    (let [head (some-> (first (p/forms node)) p/unwrap-meta)]
      (when-let [s (and head (p/sym head))]
        (when-not (or (contains? (:renames ctx) (str s))
                      ;; a local binding shadowing e.g. a clojure.core name
                      (and (nil? (namespace s)) (some-> (:declared ctx) deref (contains? (str s)))))
          (p/resolve-sym (:info ctx) s))))))

(defn head-is?
  "Is `node` a list whose head resolves to one of the symbols in the set `ks`?"
  [ctx node ks]
  (contains? ks (resolve-head ctx (p/unwrap-meta node))))

(defn blockish?
  "Does `node` translate to statements rather than an expression (e.g. `let`, `doseq`)?"
  [ctx node]
  (let [k (resolve-head ctx (p/unwrap-meta node))]
    (and k (contains? @stmt-rules k) (not (contains? @expr-rules k)))))

(defn do-block?
  "Is `doc` a `do { ... }` expression block (see [[block-expr]])?"
  [doc]
  (boolean (:do-block (meta doc))))

;;; ------------------------------------------------ Leaf rendering -----------------------------------------------

(def ^:private operator-values
  "Clojure operators used as values (e.g. `(reduce + xs)`)."
  {"+" "add" "-" "subtract" "*" "multiply" "/" "divide" "=" "equals" "not=" "notEquals" "==" "numEquals"
   "<" "lt" ">" "gt" "<=" "lte" ">=" "gte"})

(defn- java-class-name? [^String s]
  (boolean (re-find #"(^|\.)[A-Z][A-Za-z0-9_$]*$" s)))

(defn sym-doc
  "Render a symbol as a TypeScript-ish identifier or member expression."
  [ctx s]
  (let [s-str (str s)]
    (or (get (:renames ctx) s-str)
        (let [ns-part   (namespace s)
              name-part (name s)]
          (cond
            (and ns-part (java-class-name? ns-part)) (str ns-part "." name-part)
            ns-part                                  (str (names/ns->js ns-part) "." (names/camel name-part))
            (= s-str "nil")                          "null"
            (contains? operator-values s-str)        (operator-values s-str)
            (str/includes? s-str ".")                (str/replace s-str #"^(clojure\.lang|java\.lang)\." "") ; Java classes
            :else                                    (names/camel s-str))))))

(defn keyword-string
  "The full name of keyword node `node` (no colon)."
  [ctx node]
  (p/keyword-string (:info ctx) node))

(defn model-name
  "For `:model/Card`, \"Card\"; otherwise nil."
  [ctx node]
  (when (p/keyword-node? node)
    (let [s (keyword-string ctx node)]
      (when (str/starts-with? s "model/")
        (subs s (count "model/"))))))

(defn- keyword-doc [ctx node]
  (or (model-name ctx node)
      (names/js-string (keyword-string ctx node))))

(defn- escape-template [s]
  (-> s (str/replace "`" "\\`") (str/replace "${" "\\${")))

(defn string-doc
  "Single-line strings keep their source spelling; multi-line strings become template literals."
  [node]
  (let [lines (:lines node)]
    (if (<= (count lines) 1)
      (n/string node)
      (str "`" (escape-template (str/join "\n" lines)) "`"))))

(defn- token-doc [ctx node]
  (cond
    (p/string-node? node)  (string-doc node)
    (p/keyword-node? node) (keyword-doc ctx node)
    (p/symbol-node? node)  (sym-doc ctx (p/sym node))
    :else
    (let [v (:value node)
          s (n/string node)]
      (cond
        (nil? v)     "null"
        (char? v)    (names/js-string (str v))
        (number? v)  (str/replace s #"[MN]$" "")
        (boolean? v) (str v)
        :else        s))))

(defn- dedent-source
  "Source text of `node`, with continuation lines dedented by the node's starting column."
  [node]
  (let [text   (n/string node)
        col    (or (:col (p/position node)) 1)
        [l & ls] (str/split text #"\n" -1)
        strip  (fn [^String line]
                 (let [spaces (count (re-find #"^ *" line))]
                   (subs line (min spaces (dec col)))))]
    (cons l (map strip ls))))

(defn raw-doc
  "Show `node` as untranslated Clojure: ``clj`(...)` ``. This is the escape hatch."
  [node]
  (let [ls (map #(str/replace % "`" "\\`") (dedent-source node))]
    (if (= 1 (count ls))
      (str "clj`" (first ls) "`")
      [(str "clj`" (first ls)) :hardline (d/lines (butlast (rest ls))) (when (> (count ls) 2) :hardline)
       (str (last ls) "`")])))

(defn raw-comment-lines
  "Comment lines showing `node`'s source, for `#_` discards."
  [prefix node]
  (let [[l & ls] (dedent-source node)]
    (into [(str "// " prefix l)] (map #(str "// " %) ls))))

(defn jsdoc
  "A JSDoc comment for docstring `s`."
  [s]
  (let [ls     (str/split-lines (str/replace (str/trim s) "*/" "*\\/"))
        indent (->> (rest ls)
                    (remove str/blank?)
                    (map #(count (re-find #"^ *" %)))
                    (reduce min 1000))
        ls     (cons (first ls) (map #(if (str/blank? %) "" (subs % (min indent (count %)))) (rest ls)))]
    (if (= 1 (count ls))
      (str "/** " (first ls) " */")
      (d/lines (concat ["/**"] (map #(str/trimr (str " * " %)) ls) [" */"])))))

;;; ------------------------------------------------ Core dispatch ------------------------------------------------

(declare expr stmts plain-map-literal)

(defn needs-parens?
  "Would `node`'s translation need parentheses as an operand of an operator with precedence `parent-prec`
  (default: a method receiver, which binds tightest)?"
  ([ctx node] (needs-parens? ctx node 100))
  ([ctx node parent-prec]
   (let [q (precedence ctx node)]
     (boolean (and q (<= q parent-prec))))))

(defn operand
  "Translate `node` as an operand of an operator with precedence `parent-prec` (default: a method receiver),
  parenthesizing if needed."
  ([ctx node] (operand ctx node 100))
  ([ctx node parent-prec]
   (let [doc (expr (xctx ctx) node)]
     (if (or (needs-parens? ctx node parent-prec) (do-block? doc))
       ["(" doc ")"]
       doc))))

(defn emit
  "Wrap an expression doc as statement(s) for `(:pos ctx)`."
  [ctx doc]
  (case (:pos ctx)
    :return [["return " doc ";"]]
    :yield  [doc]
    :stmt   [[doc ";"]]
    :expr   doc))

(defn- attach-trailing [stmts text]
  (if (empty? stmts)
    [text]
    (update stmts (dec (count stmts)) (fn [s] [s " " text]))))

(defn entry-items
  "Turn entries (see [[mage.readable.parse/entries]]) into bracket items, grouping every `group-size` forms and
  translating each group with `f` (which receives a vector of nodes). Comments become leading/trailing comments."
  [ents group-size f]
  (loop [ents ents, pending-lead [], group [], items []]
    (if-let [{:keys [type node text trailing?]} (first ents)]
      (case type
        :form    (let [group (conj group node)]
                   (if (= group-size (count group))
                     (recur (rest ents) [] [] (conj items {:doc (f group) :lead pending-lead}))
                     (recur (rest ents) pending-lead group items)))
        :comment (if (and trailing? (seq items) (empty? group) (not (:trail (peek items))))
                   (recur (rest ents) pending-lead group (update items (dec (count items)) assoc :trail text))
                   (recur (rest ents) (conj pending-lead text) group items))
        :uneval  (recur (rest ents) (into pending-lead (raw-comment-lines "#_ (ignored) " (first (p/forms node))))
                        group items))
      (let [items (if (seq group) (conj items {:doc (f group) :lead pending-lead}) items)]
        (if (and (seq pending-lead) (seq items) (not (seq group)))
          (update items (dec (count items)) update :trail
                  (fn [t] (d/join :hardline (cond->> pending-lead t (cons t)))))
          items)))))

(defn- huggable-doc?
  "Docs that read well hugged as a last argument: object/array literals and arrow functions."
  [doc]
  (letfn [(opens-with? [d opener]
            (and (vector? d) (= :group (first d)) (vector? (second d)) (= opener (first (second d)))))]
    (and (vector? doc)
         (or (opens-with? doc "{")
             (opens-with? doc "[")
             (and (opens-with? (first doc) "(") (= " => " (second doc)))))))

(defn call-docs
  "`callee(arg, ...)`. When the last argument is a multi-line block (a callback or object literal) and the others
  are simple, it is \"hugged\": `f(a, (x) => {` ... `})`."
  ([callee items] (call-docs callee items nil))
  ([callee items hug?]
   (let [items (mapv #(if (map? %) % {:doc %}) items)
         docs  (map :doc items)
         plain (every? #(and (empty? (:lead %)) (nil? (:trail %))) items)
         hug?  (and plain (seq items)
                    (not-any? d/has-hardline? (butlast docs))
                    (or hug? (d/has-hardline? (last docs)) (huggable-doc? (last docs))))]
     (if hug?
       [callee "(" (d/join ", " (vec (butlast docs))) (when (next docs) ", ") (last docs) ")"]
       [callee (d/bracket "(" items ")")]))))

(defn huggable-node?
  "Nodes that read well as a hugged last argument: function literals and map literals."
  [ctx node]
  (let [node (p/unwrap-meta node)]
    (or (contains? #{:fn :map} (p/tag node))
        (head-is? ctx node '#{clojure.core/fn metabase.util.malli/fn}))))

(defn call-nodes
  "Translate the children of list `node` after `skip` forms as call arguments of `callee`."
  [ctx callee node skip]
  (let [ents  (p/entries node skip)
        items (entry-items ents 1 (fn [[a]] (expr (xctx ctx) a)))
        lastf (last (filter #(= :form (:type %)) ents))]
    (call-docs callee items (and lastf (huggable-node? ctx (:node lastf))))))

(defn args-docs
  "Expression docs for each of `args`."
  [ctx args]
  (mapv #(expr (xctx ctx) %) args))

;;; ------------------------------------------------ Blocks & bodies ----------------------------------------------

(defn binding-names
  "Local names bound by a binding form (symbols, including inside destructuring)."
  [node]
  (let [node (p/unwrap-meta node)]
    (cond
      (p/symbol-node? node) (let [s (str (p/sym node))] (if (= "&" s) [] [s]))
      (p/vector-node? node) (mapcat binding-names (remove p/keyword-node? (p/forms node)))
      (p/map-node? node)    (mapcat (fn [[k v]]
                                      (cond
                                        (and (:k k) (#{"keys" "strs" "syms"} (name (:k k))))
                                        (map #(let [el (p/unwrap-meta %)] (name (or (p/sym el) (:k el) "_"))) (p/forms v))
                                        (= :as (:k k))              (binding-names v)
                                        (p/keyword-node? k)          []
                                        :else                       (binding-names k)))
                                    (partition 2 (p/forms node)))
      :else [])))

(defn- flattened-let-names
  "Names bound by `let`s whose statements will be flattened into the same block as `nodes`."
  [ctx nodes]
  (mapcat (fn [node]
            (let [node (p/unwrap-meta node)
                  k    (resolve-head ctx node)]
              (condp = k
                'clojure.core/let (let [[_ bv & body] (p/forms node)]
                                    (concat (when (p/vector-node? bv)
                                              (mapcat binding-names (take-nth 2 (p/forms bv))))
                                            (flattened-let-names ctx body)))
                'clojure.core/do  (flattened-let-names ctx (rest (p/forms node)))
                nil)))
          nodes))

(defn block-ctx
  "A context for a new `{ ... }` block with statements from `nodes` and the already-declared names `params`.
  Names bound more than once in the block (Clojure shadowing) are declared with `let` and reassigned."
  [ctx nodes params]
  (let [names (concat params (flattened-let-names ctx nodes))
        dups  (set (for [[nm c] (frequencies names) :when (> c 1)] nm))]
    (assoc ctx
           :declared (atom (into (set params) (some-> (:declared ctx) deref)))
           :mutable dups)))

(defn declare-local
  "A `const name = value;` statement (or `let`/reassignment for shadowed names)."
  [ctx name-str value-doc]
  (let [js (sym-doc ctx (symbol name-str))]
    (cond
      (= "_" name-str)
      [value-doc ";"]

      (contains? (:mutable ctx) name-str)
      (if (contains? @(:declared ctx) name-str)
        [js " = " value-doc ";"]
        (do (swap! (:declared ctx) conj name-str)
            ["let " js " = " value-doc ";"]))

      :else
      (do (swap! (:declared ctx) conj name-str)
          ["const " js " = " value-doc ";"]))))

(defn body-stmts
  "Statements for body entries `ents`; the last form is translated in `(:pos ctx)`, the others as statements."
  [ctx ents]
  (let [last-form (last (keep-indexed (fn [i e] (when (= :form (:type e)) i)) ents))]
    (reduce
     (fn [acc [i {:keys [type node text trailing? blank?]}]]
       (let [acc (if (and blank? (seq acc)) (conj acc "") acc)]
         (case type
           :form    (let [last? (= i last-form)
                          c     (-> ctx
                                    (at (if last? (:pos ctx) :stmt))
                                    (assoc :last? (and last? (:last? ctx true))))]
                      (into acc (stmts c node)))
           :comment (if (and trailing? (seq acc)) (attach-trailing acc text) (conj acc text))
           :uneval  (into acc (raw-comment-lines "#_ (ignored) " (first (p/forms node)))))))
     []
     (map-indexed vector ents))))

(defn body-block
  "A `{ ... }` block for body entries in a fresh block scope."
  ([ctx ents] (body-block ctx ents [] []))
  ([ctx ents params prelude]
   (let [c (block-ctx ctx (map :node (filter #(= :form (:type %)) ents)) params)]
     (d/block (into (vec prelude) (body-stmts c ents))))))

(defn node-block
  "A `{ ... }` block for the single form `node` in position `(:pos ctx)`."
  [ctx node]
  (d/block (stmts (block-ctx ctx [node] []) node)))

(defn block-expr
  "Translate a statement-only form in expression position as a `do { ... }` block expression."
  [ctx node]
  (let [c (block-ctx (at ctx :yield) [node] [])]
    (with-meta ["do " (d/block (stmts c node))] {:do-block true})))

;;; ------------------------------------------------ Destructuring ------------------------------------------------

(declare pattern-doc)

(defn- key-name-doc
  "Object pattern entry for key string `k` bound to local `local` (with optional default doc)."
  [ctx k local default]
  (let [js  (sym-doc ctx (symbol local))
        lhs (if (= js k) js (str (names/prop-key k) ": " js))]
    (if default [lhs " = " default] lhs)))

(defn pattern
  "Translate a binding form. Returns {:simple \"name\"} for a symbol, or {:doc pattern-doc, :as \"name\"|nil}."
  [ctx node]
  (let [node (p/unwrap-meta node)]
    (cond
      (p/symbol-node? node)
      {:simple (str (p/sym node))}

      (p/vector-node? node)
      (let [fs (p/forms node)
            [items as] (loop [fs fs, items [], as nil]
                         (if-let [f (first fs)]
                           (cond
                             (= '& (p/sym f))       (recur (drop 2 fs) (conj items ["..." (:doc (pattern-doc ctx (second fs)))]) as)
                             (= :as (:k f))         (recur (drop 2 fs) items (str (p/sym (second fs))))
                             :else                  (recur (rest fs) (conj items (:doc (pattern-doc ctx f))) as))
                           [items as]))]
        {:doc (d/bracket "[" items "]") :as as})

      (p/map-node? node)
      (let [pairs    (partition 2 (p/forms node))
            defaults (into {} (for [[k v] pairs
                                    :when (= :or (:k k))
                                    [dk dv] (partition 2 (p/forms v))]
                                [(str (p/sym dk)) (expr (xctx ctx) dv)]))
            as       (some (fn [[k v]] (when (= :as (:k k)) (str (p/sym v)))) pairs)
            items    (vec (mapcat
                           (fn [[k v]]
                             (let [kk (:k k)]
                               (cond
                                 (and kk (= "keys" (name kk)) (p/vector-node? v))
                                 (for [el (map p/unwrap-meta (p/forms v))
                                       :let [local (name (or (p/sym el) (:k el)))
                                             kns   (or (namespace kk)
                                                       (some-> (or (p/sym el) (:k el)) namespace))
                                             key   (if kns (str kns "/" local) local)]]
                                   (key-name-doc ctx key local (get defaults local)))

                                 (#{:strs :syms} kk)
                                 (for [el (map p/unwrap-meta (p/forms v)) :let [local (str (p/sym el))]]
                                   (key-name-doc ctx local local (get defaults local)))

                                 (#{:as :or} kk)
                                 []

                                 :else
                                 (let [key-str (cond
                                                 (p/keyword-node? v) (keyword-string ctx v)
                                                 (p/string-node? v)  (p/string-value v)
                                                 :else               nil)
                                       sub     (pattern-doc ctx k)
                                       local   (when (p/symbol-node? (p/unwrap-meta k)) (str (p/sym (p/unwrap-meta k))))
                                       dflt    (get defaults local)]
                                   [(cond
                                      (and local key-str) (key-name-doc ctx key-str local dflt)
                                      key-str             [(names/prop-key key-str) ": " (:doc sub)]
                                      :else               ["[" (expr (xctx ctx) v) "]: " (:doc sub)])]))))
                           pairs))]
        {:doc (d/bracket "{" items "}" true) :as as})

      :else
      {:doc (raw-doc node)})))

(defn pattern-doc
  "Like [[pattern]], but always returns {:doc ...} (symbols render as their identifier)."
  [ctx node]
  (let [{:keys [simple] :as pat} (pattern ctx node)]
    (if simple {:doc (sym-doc ctx (symbol simple))} pat)))

(defn bind-stmts
  "Statements binding the binding form `pat-node` to `value-doc`."
  [ctx pat-node value-doc]
  (let [{:keys [simple doc as]} (pattern ctx pat-node)
        destructure (fn [source-doc]
                      ;; names from the pattern that are shadowed elsewhere in the block need `let`, and a pattern
                      ;; that only rebinds already-declared names is a destructuring assignment
                      (let [nms      (remove #{as} (binding-names pat-node))
                            declared @(:declared ctx)
                            stmt     (cond
                                       (and (seq nms) (every? declared nms))
                                       ["(" doc " = " source-doc ");"]
                                       (some (:mutable ctx) nms)
                                       ["let " doc " = " source-doc ";"]
                                       :else
                                       ["const " doc " = " source-doc ";"])]
                        (swap! (:declared ctx) into nms)
                        stmt))]
    (cond
      simple [(declare-local ctx simple value-doc)]
      as     [(declare-local ctx as value-doc)
              (destructure (sym-doc ctx (symbol as)))]
      :else  [(destructure value-doc)])))

;;; ------------------------------------------------ Parameters ---------------------------------------------------

(def ^:dynamic *schema-type*
  "Hook (set by the Malli rules) that renders a schema node as a TypeScript type doc: (fn [ctx node] doc)."
  nil)

(defn schema-type
  "A TypeScript type doc for schema `node` (via [[*schema-type*]], else the raw source)."
  [ctx node]
  (if-let [f *schema-type*] (f ctx node) (raw-doc node)))

(defn params
  "Translate a parameter vector (supports `& rest`, Malli `:- Schema` annotations and `^Type` hints).
  Returns {:docs [param-doc ...], :prelude [stmt ...], :names [local-name ...]}."
  [ctx pvec]
  (let [fs (p/forms (p/unwrap-meta pvec))
        ps (loop [fs fs, rest? false, acc []]
             (if-let [f (first fs)]
               (cond
                 (= '& (p/sym f))     (recur (rest fs) true acc)
                 (= :- (:k f))        (recur (drop 2 fs) rest? (update acc (dec (count acc)) assoc :schema (second fs)))
                 :else                (let [[target metas] (p/meta-target f)]
                                        (recur (rest fs) false
                                               (conj acc {:node target :rest? rest?
                                                          :hint (:hint (p/meta-flags metas))}))))
               acc))]
    (reduce
     (fn [acc {:keys [node rest? schema hint]}]
       (let [{:keys [simple doc as]} (pattern ctx node)
             type-doc (cond
                        schema (schema-type ctx schema)
                        hint   (str hint))
             base     (cond simple (sym-doc ctx (symbol simple))
                            as     (sym-doc ctx (symbol as))
                            :else  doc)
             pdoc     [(when rest? "...") base (when type-doc [": " type-doc])]]
         (-> acc
             (update :docs conj pdoc)
             (update :names into (binding-names node))
             (cond-> as (update :prelude conj ["const " doc " = " (sym-doc ctx (symbol as)) ";"])))))
     {:docs [] :prelude [] :names []}
     ps)))

(defn arrow
  "An arrow function `(params) => expr` or `(params) => { ... }` for a params vector and body entries."
  [ctx pvec body-ents]
  (let [{:keys [docs prelude names]} (params ctx pvec)
        forms (map :node (filter #(= :form (:type %)) body-ents))
        head  (d/bracket "(" docs ")")
        simple? (and (empty? prelude)
                     (= 1 (count forms))
                     (every? #(= :form (:type %)) body-ents)
                     (not (blockish? ctx (first forms))))
        edoc  (when simple? (expr (xctx (block-ctx ctx forms names)) (first forms)))]
    (if (and edoc (not (do-block? edoc)))
      [head " => " (if (= :map (p/tag (p/unwrap-meta (first forms)))) ["(" edoc ")"] edoc)]
      [head " => " (body-block (at ctx :return) body-ents names prelude)])))

;;; ------------------------------------------------ Expressions --------------------------------------------------

(defn- anon-fn-params
  "Parameters for a `#(...)` literal: `%`/`%1` -> x, `%2` -> x2, `%&` -> rest."
  [node]
  (let [syms (->> (tree-seq n/inner? n/children node)
                  (keep #(when (p/symbol-node? %) (str (p/sym %))))
                  (filter #(re-matches #"%(\d+|&)?" %))
                  set)
        maxn (reduce max 0 (for [s syms :let [m (re-matches #"%(\d+)" s)]]
                             (if (= s "%") 1 (if m (parse-long (second m)) 0))))
        one? (<= maxn 1)
        name-of (fn [i] (if one? "x" (str "x" i)))]
    {:renames (cond-> (into {} (for [i (range 1 (inc maxn))] [(str "%" i) (name-of i)]))
                (pos? maxn)            (assoc "%" (name-of 1))
                (contains? syms "%&")  (assoc "%&" "rest"))
     :params  (cond-> (mapv name-of (range 1 (inc maxn)))
                (contains? syms "%&") (conj "...rest"))}))

(defn- anon-fn [ctx node]
  (let [{:keys [renames params]} (anon-fn-params node)
        body (n/list-node (n/children node))]
    [(d/bracket "(" params ")") " => "
     (let [c    (-> (xctx ctx) (update :renames merge renames) (assoc :recur {:kind :fn :name nil}))
           edoc (expr c body)]
       (if (do-block? edoc)
         (d/block (stmts (block-ctx (at c :return) [body] []) body))
         edoc))]))

(def ^:dynamic *map-literal-hook*
  "Hook (set by the SQL rules) that may render a map literal specially (e.g. a HoneySQL query as SQL):
  (fn [ctx node] doc-or-nil)."
  nil)

(defn- map-literal [ctx node]
  (or
   (when-let [hook *map-literal-hook*] (hook ctx node))
   (plain-map-literal ctx node)))

(defn plain-map-literal
  "A map literal as a JS object literal, ignoring [[*map-literal-hook*]]."
  [ctx node]
  (d/bracket "{"
             (entry-items (p/entries node) 2
                          (fn [[k v]]
                            (let [k* (p/unwrap-meta k)
                                  kd (cond
                                       (p/keyword-node? k*) (names/prop-key (keyword-string ctx k*))
                                       (p/string-node? k*)  (n/string k*)
                                       :else                ["[" (expr (xctx ctx) k) "]"])
                                  vd (expr (xctx ctx) v)]
                              (if (and (string? kd) (= kd vd) (names/js-ident? kd)) kd [kd ": " vd]))))
             "}" true))

(defn- vector-literal [ctx node]
  (d/bracket "[" (entry-items (p/entries node) 1 (fn [[x]] (expr (xctx ctx) x))) "]"))

(def platform-names
  "Reader-conditional platform keys, as displayed."
  {"clj" "clj" "cljs" "cljs" "default" "default"})

(defn- reader-macro-expr [ctx node]
  (let [[tag-node & more] (p/forms node)
        tag (n/string tag-node)]
    (cond
      (#{"?" "?@"} tag)
      (let [pairs (partition 2 (p/forms (first more)))]
        [(when (= tag "?@") "...")
         "platform("
         (d/bracket "{" (vec (for [[k v] pairs] [(name (:k k)) ": " (expr (xctx ctx) v)])) "}" true)
         ")"])

      (= tag "inst")  ["new Date(" (expr (xctx ctx) (first more)) ")"]
      (= tag "uuid")  ["uuid(" (expr (xctx ctx) (first more)) ")"]
      (= tag "js")    (expr (xctx ctx) (first more))
      (seq more)      [(names/camel (str/replace tag #"[/.]" "-")) "(" (expr (xctx ctx) (first more)) ")"]
      :else           (raw-doc node))))

(defn- quote-expr [ctx node]
  (let [target (first (p/forms node))]
    (cond
      (p/symbol-node? target) ["sym(" (names/js-string (str (p/sym target))) ")"]
      (p/keyword-node? target) (keyword-doc ctx target)
      :else (do (note! :raw "quote") (raw-doc node)))))

(defn- generic-call [ctx node head args]
  (let [head* (p/unwrap-meta head)]
    (cond
      (p/keyword-node? head*)
      (let [[obj dflt] args
            access [(operand ctx obj) (names/prop-access (keyword-string ctx head*) false)]]
        (if dflt ["(" access " ?? " (expr (xctx ctx) dflt) ")"] access))

      (p/set-node? head*)
      [(expr (xctx ctx) head*) ".has(" (expr (xctx ctx) (first args)) ")"]

      (p/symbol-node? head*)
      (let [s   (str (p/sym head*))
            nm  (name (p/sym head*))]
        (cond
          (and (str/starts-with? nm ".-") (> (count nm) 2) (not (namespace (p/sym head*))))
          [(operand ctx (first args)) "." (subs nm 2)]

          (and (str/starts-with? nm ".") (> (count nm) 1) (not= nm "..") (not (namespace (p/sym head*))))
          (call-docs [(operand ctx (first args)) "." (subs nm 1)] (args-docs ctx (rest args)))

          (and (str/ends-with? s ".") (> (count s) 1) (not (namespace (p/sym head*))))
          (call-nodes ctx ["new " (subs s 0 (dec (count s)))] node 1)

          :else
          (do (note! :generic (str (resolve-head ctx node)))
              (call-nodes ctx (sym-doc ctx (p/sym head*)) node 1))))

      :else
      (call-nodes ctx (operand ctx head) node 1))))

(defn- list-expr [ctx node]
  (let [[head & args] (p/forms node)
        no-block? (::no-block ctx)
        ctx       (dissoc ctx ::no-block)]
    (if (nil? head)
      "[]"
      (let [k (resolve-head ctx node)
            ef (when k (get @expr-rules k))
            sf (when (and k (not no-block?)) (get @stmt-rules k))
            r  (if ef
                 (try (ef ctx node args)
                      (catch Exception _ (note! :error (str k " (rule failed; generic call used)")) decline))
                 decline)]
        (cond
          (not= r decline) r
          sf               (block-expr ctx node)
          :else            (generic-call ctx node head args))))))

(defn expr
  "Translate `node` as an expression doc."
  [ctx node]
  (let [ctx (xctx ctx)]
    (case (p/tag node)
      (:token :multi-line) (token-doc ctx node)
      :list           (list-expr ctx node)
      :vector         (vector-literal ctx node)
      :map            (map-literal ctx node)
      :set            ["new Set(" (vector-literal ctx node) ")"]
      :fn             (anon-fn ctx node)
      (:meta :meta*)  (expr ctx (p/unwrap-meta node))
      :quote          (quote-expr ctx node)
      :deref          [(operand ctx (first (p/forms node))) ".value"]
      :var            (expr ctx (first (p/forms node)))
      :regex          (str "/" (str/replace (:pattern node) #"(?<!\\)/" "\\\\/") "/")
      :reader-macro   (reader-macro-expr ctx node)
      (do (note! :raw (name (p/tag node)))
          (raw-doc node)))))

(defn- reader-cond-stmts [ctx node]
  (let [[tag-node body] (p/forms node)]
    (if-not (#{"?" "?@"} (n/string tag-node))
      (emit ctx (expr (xctx ctx) node))
      (vec (mapcat (fn [[k v]]
                     (let [platform (name (:k k))]
                       (into [(str "// ── #?(:" platform " …): only on "
                                   (case platform "clj" "the JVM" "cljs" "ClojureScript" "other platforms")
                                   " ──")]
                             (stmts ctx v))))
                   (partition 2 (p/forms body)))))))

(def ^:dynamic *stmt-fallback*
  "Hook for statement forms without a specific rule (e.g. unknown test `with-*` macros): (fn [ctx node]) -> stmts or nil."
  nil)

(defn stmts
  "Translate `node` as a vector of statement docs for `(:pos ctx)` (:stmt, :return or :yield)."
  [ctx node]
  (let [node* (p/unwrap-meta node)
        k     (resolve-head ctx node*)
        sf    (when k (get @stmt-rules k))
        r     (if sf
                (try (sf ctx node* (rest (p/forms node*)))
                     (catch Exception _ (note! :error (str k " (rule failed; generic call used)")) decline))
                decline)
        r     (if (and (= r decline) k (not (get @expr-rules k)) *stmt-fallback*)
                (or (*stmt-fallback* ctx node*) decline)
                r)]
    (cond
      (not= r decline)                  r
      (= :reader-macro (p/tag node*))   (reader-cond-stmts ctx node*)
      ;; a statement rule declined: don't let the expression side bounce back into it
      sf                                (emit ctx (expr (assoc (xctx ctx) ::no-block true) node*))
      :else                             (emit ctx (expr (xctx ctx) node)))))

;;; ------------------------------------------------ Whole files ---------------------------------------------------

(defn- top-level-stmts [ctx ents]
  (reduce
   (fn [acc {kind :type :keys [node text trailing? blank?]}]
     (let [acc (if (and blank? (seq acc)) (conj acc "") acc)]
       (case kind
         :form    (into acc (try
                              (stmts ctx node)
                              (catch Exception e
                                (note! :error (str (or (some-> (resolve-head ctx (p/unwrap-meta node)) str) (name (p/tag node)))
                                                   ": " (ex-message e)))
                                [(str "// (could not translate this form: " (str/replace (or (ex-message e) (str (type e))) #"\s+" " ") ")")
                                 (raw-doc node)])))
         :comment (if (and trailing? (seq acc)) (attach-trailing acc text) (conj acc text))
         :uneval  (into acc (raw-comment-lines "#_ (ignored) " (first (p/forms node)))))))
   []
   ents))

(defn translate-root
  "Translate a parsed file (rewrite-clj :forms node) into readable text."
  [root]
  (let [info (p/ns-info root)
        ctx  {:info info :pos :stmt :renames {} :declared (atom #{}) :mutable #{} :last? false}]
    (str (d/render (d/join :hardline (top-level-stmts ctx (p/entries root)))) "\n")))
