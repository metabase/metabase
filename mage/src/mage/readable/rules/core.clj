(ns mage.readable.rules.core
  "Rules for clojure.core: definitions, local bindings, control flow, threading macros, collections and interop."
  (:require
   [clojure.string :as str]
   [mage.readable.doc :as d]
   [mage.readable.names :as names]
   [mage.readable.parse :as p]
   [mage.readable.translate :as t]
   [rewrite-clj.node :as n]))

(set! *warn-on-reflection* true)

(defn- core [& names] (set (map #(symbol "clojure.core" (str %)) names)))

(defn- x [ctx node] (t/expr (t/xctx ctx) node))

;;; ------------------------------------------------ ns ----------------------------------------------------------

(defn- import-lines [ctx node]
  (let [[_ _name & clauses] (p/forms node)]
    (vec
     (mapcat
      (fn [clause]
        (let [clause (p/unwrap-meta clause)]
          (if-not (p/list-node? clause)
            []
            (let [[k & specs] (p/forms clause)]
              (case (:k k)
                (:require :require-macros)
                (mapcat (fn spec-lines [spec]
                          (let [spec (p/unwrap-meta spec)]
                            (case (p/tag spec)
                              :token  [(str "import \"" (p/sym spec) "\";")]
                              :reader-macro
                              (let [[_ body] (p/forms spec)]
                                (mapcat (fn [[pk pv]]
                                          (map #(str % "  // only on " (name (:k pk)))
                                               (mapcat spec-lines (if (and (= :list (p/tag pv)) (p/symbol-node? (first (p/forms pv))))
                                                                    [pv]
                                                                    (p/forms pv)))))
                                        (partition 2 (p/forms body))))
                              (:vector :list)
                              (let [[lib & opts] (p/forms spec)
                                    opts (into {} (map (fn [[k v]] [(:k k) v]) (partition-all 2 opts)))
                                    lib  (str (p/sym lib))
                                    as   (some-> (or (:as opts) (:as-alias opts)) p/sym str)
                                    refer (:refer opts)]
                                (cond-> []
                                  as    (conj (str "import * as " (names/ns->js as) " from \"" lib "\";"))
                                  (and refer (p/vector-node? refer))
                                  (conj (str "import { " (str/join ", " (map #(t/sym-doc ctx (p/sym %)) (filter p/symbol-node? (p/forms refer))))
                                             " } from \"" lib "\";"))
                                  (and refer (not (p/vector-node? refer)))
                                  (conj (str "import * from \"" lib "\";  // (refer :all)"))
                                  (and (not as) (not refer))
                                  (conj (str "import \"" lib "\";"))))
                              [])))
                        specs)

                :import
                (mapcat (fn [spec]
                          (let [spec (p/unwrap-meta spec)]
                            (if (p/symbol-node? spec)
                              (let [s (str (p/sym spec))]
                                [(str "import { " (last (str/split s #"\.")) " } from \"" s "\";")])
                              (let [[pkg & classes] (p/forms spec)]
                                (when (and pkg (p/symbol-node? pkg))
                                  [(str "import { " (str/join ", " (map #(str (p/sym %)) classes)) " } from \""
                                        (p/sym pkg) "\";")])))))
                        specs)

                :refer-clojure
                [(str "// (hides these clojure.core names so this namespace can define its own: "
                      (str/join " " (map n/string (mapcat p/forms (filter p/vector-node? specs)))) ")")]

                [])))))
      clauses))))

(t/defstmt (core 'ns)
  (fn [ctx node _args]
    (let [[_ name-node & more] (p/forms node)
          doc (first (filter p/string-node? more))]
      (-> []
          (cond-> doc (conj (t/jsdoc (p/string-value doc))))
          (conj (str "// namespace " (p/sym (p/unwrap-meta name-node))))
          (into (import-lines ctx node))))))

;;; ------------------------------------------------ def / defn -------------------------------------------------

(defn parse-defn
  "Pull apart `(defn name :- ret? doc? attrs? [params] body)` / multi-arity forms. Returns
  {:name sym, :flags #{}, :ret schema-node, :doc str, :arities [{:params vnode :node parent :skip n}]}"
  [node]
  (let [fs              (p/forms node)
        [name-node metas] (p/meta-target (second fs))
        flags           (:flags (p/meta-flags metas))
        rest-fs         (drop 2 fs)
        [ret rest-fs]   (if (= :- (:k (first rest-fs))) [(second rest-fs) (drop 2 rest-fs)] [nil rest-fs])
        [doc rest-fs]   (if (and (p/string-node? (first rest-fs)) (next rest-fs))
                          [(p/string-value (first rest-fs)) (rest rest-fs)]
                          [nil rest-fs])
        rest-fs         (if (p/map-node? (first rest-fs)) (rest rest-fs) rest-fs)
        skip            (- (count fs) (count rest-fs))]
    {:name    (p/sym name-node)
     :flags   flags
     :ret     ret
     :doc     doc
     :hint    (:hint (p/meta-flags (second (p/meta-target (first rest-fs)))))
     :arities (if (p/vector-node? (p/unwrap-meta (first rest-fs)))
                [{:params (p/unwrap-meta (first rest-fs)) :node node :skip (inc skip)}]
                (for [arity rest-fs :when (p/list-node? arity)]
                  {:params (first (p/forms arity)) :node arity :skip 1}))}))

(def ^:dynamic *return-doc*
  "Hook (set by the Malli rules): (fn [ctx schema-node] {:type doc, :description str-or-nil})."
  nil)

(defn function-stmts
  "Statements for a named function definition parsed by [[parse-defn]]. `keyword` is e.g. \"function\"."
  [ctx {:keys [name flags ret doc arities hint]} {:keys [prefix-comment keyword]
                                                  :or   {keyword "function"}}]
  (let [private? (or (:private flags) (:private-fn flags))
        {rtype :type rdesc :description} (cond
                                           (and ret *return-doc*) (*return-doc* ctx ret)
                                           ret                    {:type (t/schema-type ctx ret)}
                                           hint                   {:type (str hint)})
        sigs     (vec (for [{:keys [params node skip]} arities]
                        (assoc (t/signature ctx params (p/entries node skip)) :pvec params)))
        ensures  (distinct (mapcat :ensures sigs))
        doc      (cond-> (or doc "")
                   rdesc          (str (when doc "\n\n") "Returns: " rdesc)
                   (seq ensures)  (str (when (or doc rdesc) "\n\n") (str/join "\n" (map #(str "Ensures: " %) ensures))))]
    (-> []
        (cond-> (not (str/blank? doc)) (conj (t/jsdoc doc)))
        (cond-> prefix-comment (conj prefix-comment))
        (into (for [{pdocs :docs prelude :prelude pnames :names ents :ents ret-type :ret-type} sigs
                    :let [c (assoc ctx :recur {:kind :fn :name name})
                          rtype (or rtype ret-type)]]
                [(when private? "private ") keyword " " (t/sym-doc ctx name)
                 (d/bracket "(" pdocs ")")
                 (when rtype [": " rtype])
                 " "
                 (t/body-block (t/at c :return) ents pnames prelude)])))))

(t/defstmt (core 'defn 'defn-)
  (fn [ctx node _args]
    (let [parsed (parse-defn node)
          k      (t/resolve-head ctx node)]
      (function-stmts ctx (cond-> parsed (= k 'clojure.core/defn-) (update :flags conj :private-fn)) {}))))

(t/defstmt (core 'defmacro)
  (fn [ctx node _args]
    (let [{:keys [name doc arities]} (parse-defn node)]
      (-> []
          (cond-> doc (conj (t/jsdoc doc)))
          (conj "// macro: rewrites its arguments at compile time; body shown as Clojure")
          (into (for [{:keys [params node skip]} arities]
                  ["macro " (t/sym-doc ctx name) (d/bracket "(" (:docs (t/params ctx params)) ")") " "
                   (d/block (vec (for [e (p/entries node skip) :when (= :form (:type e))]
                                   (t/raw-doc (:node e)))))]))))))

(t/defstmt (core 'def 'defonce)
  (fn [ctx node args]
    (let [[name-node & more] args
          [target metas] (p/meta-target name-node)
          {:keys [flags hint]} (p/meta-flags metas)
          [doc value] (if (and (p/string-node? (first more)) (next more)) [(p/string-value (first more)) (second more)] [nil (first more)])
          nm (t/sym-doc ctx (p/sym target))]
      (-> []
          (cond-> doc (conj (t/jsdoc doc)))
          (conj [(when (:private flags) "private ")
                 (cond (:dynamic flags) "let " (nil? value) "let " :else "const ")
                 nm
                 (when hint [": " (str hint)])
                 (when value [" = " (x ctx value)])
                 ";"
                 (cond
                   (:dynamic flags) "  // dynamic: can be temporarily rebound with `binding`"
                   (= 'clojure.core/defonce (t/resolve-head ctx node)) "  // defonce: not re-evaluated on reload")])))))

(t/defstmt (core 'declare)
  (fn [ctx _node args]
    [(str "// declared here, defined later: " (str/join ", " (map #(t/sym-doc ctx (p/sym (p/unwrap-meta %))) args)))]))

(t/defstmt (core 'set!)
  (fn [ctx _node [target value]]
    (if (= '*warn-on-reflection* (p/sym target))
      []
      (t/emit ctx [(x ctx target) " = " (x ctx value)]))))

(t/defstmt (core 'comment)
  (fn [_ctx node _args]
    ["// (comment ...) block: REPL scratch code, never runs"
     (t/raw-doc node)]))

;;; ------------------------------------------------ fn ----------------------------------------------------------

(defn- fn-expr [ctx node]
  (let [fs     (rest (p/forms node))
        named  (when (p/symbol-node? (first fs)) (p/sym (first fs)))
        fs     (if named (rest fs) fs)
        skip   (if named 2 1)
        ctx    (assoc ctx :recur {:kind :fn :name named})]
    (if (p/vector-node? (first fs))
      (let [a (t/arrow ctx (first fs) (p/entries node (inc skip)))]
        (if named ["function " (t/sym-doc ctx named) (drop 1 a)] a))
      (t/call-docs "overloaded" (vec (for [arity fs :when (p/list-node? arity)]
                                       (t/arrow ctx (first (p/forms arity)) (p/entries arity 1))))))))

(t/defexpr (core 'fn 'fn*) (fn [ctx node _args] (fn-expr ctx node)))

(t/defstmt (core 'letfn)
  (fn [ctx node [fns-vec]]
    (-> []
        (into (for [f (p/forms fns-vec)
                    :let [[fname pvec] (p/forms f)
                          {pdocs :docs prelude :prelude pnames :names} (t/params ctx pvec)]]
                ["function " (t/sym-doc ctx (p/sym fname)) (d/bracket "(" pdocs ")") " "
                 (t/body-block (t/at ctx :return) (p/entries f 2) pnames prelude)]))
        (into (t/body-stmts ctx (p/entries node 2))))))

;;; ------------------------------------------------ let & friends ----------------------------------------------

(declare cond-thread-stmts)

(defn binding-pairs-stmts
  "Statements for a binding vector like `let`'s (comments between bindings are kept)."
  [ctx bvec]
  (let [ents (p/entries bvec)]
    (loop [ents ents, pending nil, acc []]
      (if-let [{:keys [type node text trailing?]} (first ents)]
        (case type
          :comment (recur (rest ents) pending (if (and trailing? (seq acc))
                                                (update acc (dec (count acc)) (fn [s] [s " " text]))
                                                (conj acc text)))
          :uneval  (recur (rest ents) pending (into acc (t/raw-comment-lines "#_ (ignored) " (first (p/forms node)))))
          :form    (if pending
                     (let [pat   pending
                           value node
                           c     (t/at ctx :expr)
                           simple (:simple (t/pattern ctx pat))]
                       (recur (rest ents) nil
                              (into acc
                                    (if (and simple (t/head-is? ctx value (core 'cond-> 'cond->> 'as->)))
                                      (cond-thread-stmts ctx value simple)
                                      (t/bind-stmts ctx pat (t/expr c value))))))
                     (recur (rest ents) node acc)))
        acc))))

(t/defstmt (core 'let 'let* 'binding-let)
  (fn [ctx node [bvec]]
    (into (binding-pairs-stmts ctx bvec) (t/body-stmts ctx (p/entries node 2)))))

(defn- truthy-test
  "Test expression for `when-let` & co: `x` (Clojure truthiness: only null/false are falsey) or `x != null`."
  [_ctx some? name-doc]
  (if some? [name-doc " != null"] name-doc))

(defn- if-let-stmts [ctx node [bvec then else] {:keys [some? when?]}]
  (let [[pat value] (p/forms bvec)
        {:keys [simple]} (t/pattern ctx pat)
        tmp      (or simple "it")
        decl     (t/declare-local (assoc ctx :mutable #{}) tmp (x ctx value))
        test-doc (truthy-test ctx some? (t/sym-doc ctx (symbol tmp)))
        prelude  (when-not simple [["const " (:doc (t/pattern-doc ctx pat)) " = " (t/sym-doc ctx (symbol tmp)) ";"]])
        then-blk (if when?
                   (t/body-block ctx (p/entries node 2) [] prelude)
                   (d/block (into (vec prelude) (t/stmts (t/block-ctx ctx [then] []) then))))]
    [decl
     ["if (" test-doc ") " then-blk
      (when (and else (not when?)) [" else " (t/node-block ctx else)])]]))

(t/defstmt (core 'if-let)    (fn [ctx node args] (if-let-stmts ctx node args {})))
(t/defstmt (core 'when-let)  (fn [ctx node args] (if-let-stmts ctx node args {:when? true})))
(t/defstmt (core 'if-some)   (fn [ctx node args] (if-let-stmts ctx node args {:some? true})))
(t/defstmt (core 'when-some) (fn [ctx node args] (if-let-stmts ctx node args {:some? true :when? true})))

;;; ------------------------------------------------ Control flow ------------------------------------------------

(t/definfix (core 'if 'if-not 'when 'when-not 'cond 'case 'condp 'throw) 1)
(t/definfix (core '-> '->> 'some-> 'some->>) 1)
(t/definfix (core 'or) 2)
(t/definfix (core 'and) 3)
(t/definfix (core '= 'not= '== '< '> '<= '>= 'nil? 'some? 'true? 'false? 'identical? 'instance? 'zero? 'pos? 'neg?
                  'string? 'number? 'int? 'integer? 'fn? 'boolean? 'even? 'odd? 'contains?) 5)
(t/definfix (core '+ '- 'inc 'dec) 6)
(t/definfix (core '* '/ 'mod 'rem) 7)
(t/definfix (core 'not) 8)

(defn- negate [ctx node]
  (let [node* (p/unwrap-meta node)
        k     (t/resolve-head ctx node*)
        [a b & more] (rest (p/forms node*))]
    (condp = k
      'clojure.core/not   (x ctx a)
      'clojure.core/nil?  [(t/operand ctx a 5) " != null"]
      'clojure.core/some? [(t/operand ctx a 5) " == null"]
      'clojure.core/=     (if (and b (empty? more))
                            [(t/operand ctx a 5) " != " (t/operand ctx b 5)]
                            ["!" (t/operand ctx node 8)])
      ["!" (t/operand ctx node 8)])))

(defn- clause-else? [node]
  (or (and (p/keyword-node? node) (= :else (:k node)))
      (p/keyword-node? node)
      (true? (:value node))))

(defn if-chain
  "Render `if (t1) {..} else if (t2) {..} else {..}` from clauses [[test-doc body-fn] ...] and optional else body-fn,
  where each body-fn takes a ctx and returns a block doc."
  [ctx clauses else-fn]
  (let [parts (map-indexed (fn [i [test-doc body-fn]]
                             [(when (pos? i) " else ") "if (" test-doc ") " (body-fn ctx)])
                           clauses)]
    [(vec parts) (when else-fn [" else " (else-fn ctx)])]))

(defn- node-body [node] (fn [ctx] (t/node-block ctx node)))

(defn- if-clauses
  "Flatten nested if/cond into [[test-doc body-fn] ...] + else body-fn (for `else if` chains)."
  [ctx node]
  (let [node (p/unwrap-meta node)
        k    (t/resolve-head ctx node)
        args (rest (p/forms node))]
    (condp = k
      'clojure.core/if     (let [[tst then else] args
                                 [more else-fn] (if else (if-clauses ctx else) [[] nil])]
                             [(into [[(x ctx tst) (node-body then)]] more) else-fn])
      'clojure.core/if-not (let [[tst then else] args
                                 [more else-fn] (if else (if-clauses ctx else) [[] nil])]
                             [(into [[(negate ctx tst) (node-body then)]] more) else-fn])
      'clojure.core/cond   (let [pairs (partition-all 2 args)
                                 [normal [[_ else-body]]] (split-with #(not (clause-else? (first %))) pairs)]
                             [(vec (for [[tst body] normal] [(x ctx tst) (node-body body)]))
                              (when else-body (node-body else-body))])
      [[] (node-body node)])))

(declare ternary simple-branches?)

(defn- short-ternary
  "For `(if c a b)` in return position with short, simple branches: `return c ? a : b;` instead of if/else."
  [ctx node]
  (let [[_ _tst then else] (p/forms node)]
    (when (and else
               (#{:return :yield} (:pos ctx))
               (t/head-is? ctx node (core 'if 'if-not))
               (simple-branches? ctx [then else])
               (not-any? #(t/head-is? ctx % (core 'if 'if-not 'cond 'when 'case)) [then else]))
      (let [doc (t/expr (t/xctx ctx) node)]
        (when (<= (count (d/flat-string doc)) 60)
          (t/emit ctx doc))))))

(defn- if-stmts [ctx node _args]
  (or (short-ternary ctx node)
      (let [[clauses else-fn] (if-clauses ctx node)]
        (if (empty? clauses)
          (t/stmts ctx (second (p/forms node)))
          [(if-chain ctx clauses else-fn)]))))

(defn- ternary [test-doc then-doc else-doc]
  [:group [test-doc [:nest 2 [:line "? " then-doc :line ": " else-doc]]]])

(defn- simple-branches? [ctx nodes]
  (not-any? #(t/blockish? ctx %) nodes))

(t/defstmt (core 'if 'if-not 'cond) if-stmts)

(t/defexpr (core 'if)
  (fn [ctx _node [tst then else]]
    (if (simple-branches? ctx (remove nil? [then else]))
      (ternary (t/operand ctx tst 1) (t/operand ctx then 0) (if else (t/operand ctx else 0) "null"))
      t/decline)))

(t/defexpr (core 'if-not)
  (fn [ctx _node [tst then else]]
    (if (simple-branches? ctx (remove nil? [then else]))
      (ternary (negate ctx tst) (t/operand ctx then 0) (if else (t/operand ctx else 0) "null"))
      t/decline)))

(t/defexpr (core 'cond)
  (fn [ctx _node args]
    (let [pairs (partition-all 2 args)]
      (if-not (simple-branches? ctx (map second pairs))
        t/decline
        (let [[normal [[_ else-body]]] (split-with #(not (clause-else? (first %))) pairs)
              [c1 & cs] (vec (for [[tst v] normal] [(t/operand ctx tst 1) " ? " (t/operand ctx v 1)]))]
          [:group [c1 [:nest 2 [(for [c cs] [:line ": " c])
                                :line ": " (if else-body (t/operand ctx else-body 0) "null")]]]])))))

(t/defstmt (core 'when 'when-not)
  (fn [ctx node [tst]]
    (let [test-doc (if (= 'clojure.core/when-not (t/resolve-head ctx node)) (negate ctx tst) (x ctx tst))]
      [["if (" test-doc ") " (t/body-block ctx (p/entries node 2))]])))

(t/defexpr (core 'when 'when-not)
  (fn [ctx node [tst & body]]
    (if (and (= 1 (count body)) (simple-branches? ctx body))
      (ternary (if (= 'clojure.core/when-not (t/resolve-head ctx node)) (negate ctx tst) (t/operand ctx tst 1))
               (t/operand ctx (first body) 0) "null")
      t/decline)))

(t/defstmt (core 'do)
  (fn [ctx node _args] (t/body-stmts ctx (p/entries node 1))))

(t/defexpr (core 'do)
  (fn [ctx _node args]
    (if (and (= 1 (count args)) (not (t/blockish? ctx (first args))))
      (x ctx (first args))
      t/decline)))

(defn- case-labels
  "The `case` test constants for one clause, as a vector of docs (a list groups several constants)."
  [ctx node]
  (let [node (p/unwrap-meta node)
        one  (fn [n] (let [n (p/unwrap-meta n)]
                       (if (p/symbol-node? n) (names/js-string (str (p/sym n))) (x ctx n))))]
    (if (p/list-node? node)
      (mapv one (p/forms node))
      [(one node)])))

(t/defstmt (core 'case)
  (fn [ctx _node [value & clauses]]
    (let [pairs     (partition 2 clauses)
          default   (when (odd? (count clauses)) (last clauses))
          brk?      (contains? #{:stmt :yield} (:pos ctx))
          case-body (fn [node]
                      [:nest 2 [:hardline
                                (d/join :hardline (cond-> (t/stmts (t/block-ctx ctx [node] []) node)
                                                    brk? (conj "break;")))]])]
      [["switch (" (x ctx value) ") "
        (d/block
         (cond-> (vec (for [[lbl body] pairs
                            :let [lbls (case-labels ctx lbl)]]
                        [(d/join :hardline (mapv (fn [l] ["case " l ":"]) lbls)) (case-body body)]))
           default (conj ["default:" (case-body default)])))]])))

(t/defexpr (core 'case)
  (fn [ctx _node [value & clauses]]
    (let [pairs   (partition 2 clauses)
          default (when (odd? (count clauses)) (last clauses))]
      (if-not (simple-branches? ctx (cond-> (map second pairs) default (conj default)))
        t/decline
        (let [v (t/operand ctx value)
              [c1 & cs] (vec (for [[lbl body] pairs
                                   :let [lbls (case-labels ctx lbl)]]
                               [(d/join " || " (mapv (fn [l] [v " == " l]) lbls)) " ? " (t/operand ctx body 1)]))]
          [:group [c1 [:nest 2 [(for [c cs] [:line ": " c])
                                :line ": " (if default (t/operand ctx default 0) "throwNoMatchingCase()")]]]])))))

(t/defstmt (core 'condp)
  (fn [ctx _node [pred value & clauses]]
    (let [pairs   (partition 2 clauses)
          default (when (odd? (count clauses)) (last clauses))
          v       (x ctx value)
          eq?     (#{'= '==} (p/sym pred))
          test-of (fn [c] (if eq? [v " == " (x ctx c)] (t/call-docs (x ctx pred) [(x ctx c) v])))]
      [(if-chain ctx (vec (for [[c body] pairs] [(test-of c) (node-body body)]))
                 (when default (node-body default)))])))

;;; ------------------------------------------------ Loops -------------------------------------------------------

(defn- loop-stmts [ctx node [bvec]]
  (let [pairs  (partition 2 (p/forms bvec))
        vars   (vec (for [[pat _] pairs] (:doc (t/pattern-doc ctx pat))))
        decls  (vec (for [[pat v] pairs] ["let " (:doc (t/pattern-doc ctx pat)) " = " (x ctx v) ";"]))
        c      (assoc ctx :recur {:kind :loop :vars vars})]
    (conj decls ["while (true) " (t/body-block (t/at c :return) (p/entries node 2)
                                               (mapcat #(t/binding-names (first %)) pairs) [])])))

(t/defstmt (core 'loop)
  (fn [ctx node args]
    (if (= :return (:pos ctx))
      (loop-stmts ctx node args)
      (t/emit ctx ["(() => " (d/block (loop-stmts (t/at ctx :return) node args)) ")()"]))))

(t/defstmt (core 'recur)
  (fn [ctx _node args]
    (let [{:keys [kind vars name]} (:recur ctx)
          vals (mapv #(x ctx %) args)]
      (if (= kind :loop)
        [(if (= 1 (count vars))
           [(first vars) " = " (first vals) ";"]
           [(d/bracket "[" vars "]") " = " (d/bracket "[" vals "]") ";"])
         "continue;"]
        (t/emit ctx (t/call-docs (if name (t/sym-doc ctx name) "recur") vals))))))

(defn- seq-bindings
  "Parse a doseq/for binding vector into steps: {:bind pat :coll node} | {:let bvec} | {:when node} | {:while node}."
  [bvec]
  (loop [fs (p/forms bvec), acc []]
    (if-let [f (first fs)]
      (case (:k f)
        :let   (recur (drop 2 fs) (conj acc {:let (second fs)}))
        :when  (recur (drop 2 fs) (conj acc {:when (second fs)}))
        :while (recur (drop 2 fs) (conj acc {:while (second fs)}))
        (recur (drop 2 fs) (conj acc {:bind f :coll (second fs)})))
      acc)))

(defn- nested-for-loops
  "Nested `for (const x of xs)` loops for binding steps, with `inner` (a vector of statements) innermost."
  [ctx steps inner]
  (if-let [step (first steps)]
    (cond
      (:bind step)  [["for (const " (:doc (t/pattern-doc ctx (:bind step))) " of " (x ctx (:coll step)) ") "
                      (d/block (nested-for-loops ctx (rest steps) inner))]]
      (:let step)   (into (binding-pairs-stmts (t/block-ctx ctx [] []) (:let step)) (nested-for-loops ctx (rest steps) inner))
      (:when step)  (into [["if (!(" (x ctx (:when step)) ")) continue;"]] (nested-for-loops ctx (rest steps) inner))
      (:while step) (into [["if (!(" (x ctx (:while step)) ")) break;"]] (nested-for-loops ctx (rest steps) inner)))
    inner))

(t/defstmt (core 'doseq)
  (fn [ctx node [bvec]]
    (nested-for-loops ctx (seq-bindings bvec) (t/body-stmts (t/at ctx :stmt) (p/entries node 2)))))

(t/defstmt (core 'dotimes)
  (fn [ctx node [bvec]]
    (let [[i n] (p/forms bvec)
          iv (t/sym-doc ctx (p/sym i))]
      [["for (let " iv " = 0; " iv " < " (x ctx n) "; " iv "++) " (t/body-block (t/at ctx :stmt) (p/entries node 2))]])))

(t/defstmt (core 'while)
  (fn [ctx node [tst]]
    [["while (" (x ctx tst) ") " (t/body-block (t/at ctx :stmt) (p/entries node 2))]]))

(t/defexpr (core 'for)
  (fn [ctx _node [bvec body]]
    (let [steps (seq-bindings bvec)
          simple? (and (every? #(or (:bind %) (:when %)) steps) (:bind (first steps)))]
      (if simple?
        ;; xs.filter((x) => ...).map((x) => ...), nested bindings use flatMap
        (let [groups (reduce (fn [acc s] (if (:bind s) (conj acc [s]) (update acc (dec (count acc)) conj s))) [] steps)
              build  (fn build [groups]
                       (let [[{:keys [bind coll]} & whens] (first groups)
                             pd (:doc (t/pattern-doc ctx bind))
                             filters (for [w whens] [".filter((" pd ") => " (x ctx (:when w)) ")"])
                             last? (empty? (rest groups))
                             inner (if last? (t/expr (t/xctx ctx) body) (build (rest groups)))]
                         [(t/operand ctx coll) (vec filters)
                          (if last? ".map((" ".flatMap((") pd ") => "
                          (if (t/do-block? inner) ["(" inner ")"] inner) ")"]))]
          (build groups))
        (t/call-docs "lazySeq"
                     [["function* () "
                       (d/block (nested-for-loops ctx steps [["yield " (x ctx body) ";"]]))]]
                     true)))))

;;; ------------------------------------------------ Exceptions -------------------------------------------------

(t/defstmt (core 'try)
  (fn [ctx node _args]
    (let [ents     (p/entries node 1)
          special? (fn [e] (and (= :form (:type e)) (t/head-is? ctx (:node e) (core 'catch 'finally))))
          body     (remove special? ents)
          handlers (map :node (filter special? ents))]
      [["try " (t/body-block ctx body)
        (vec (for [h handlers
                   :let [k (t/resolve-head ctx h)
                         [_ cls bnd] (p/forms h)]]
               (if (= k 'clojure.core/catch)
                 [" catch (" (t/sym-doc ctx (p/sym bnd)) ": " (x ctx cls) ") " (t/body-block ctx (p/entries h 3))]
                 [" finally " (t/body-block (t/at ctx :stmt) (p/entries h 1))])))]])))

(t/defstmt (core 'throw)
  (fn [ctx _node [v]] [["throw " (x ctx v) ";"]]))

(t/defexpr (core 'throw)
  (fn [ctx _node [v]] ["throw " (x ctx v)]))

(t/defexpr (core 'ex-info)
  (fn [ctx _node args] (t/call-docs "new ExInfo" (t/args-docs ctx args))))

(t/defexpr (core 'ex-data) (fn [ctx _node [e]] [(t/operand ctx e) ".data"]))
(t/defexpr (core 'ex-message) (fn [ctx _node [e]] [(t/operand ctx e) ".message"]))
(t/defexpr (core 'ex-cause) (fn [ctx _node [e]] [(t/operand ctx e) ".cause"]))

;;; ------------------------------------------------ Operators ---------------------------------------------------

(defn- infix
  "`a op b op c`. Operands of the same (associative) operator aren't parenthesized."
  [ctx op prec args]
  [:group (d/join [:line op " "]
                  (mapv (fn [a] (t/operand ctx a (if (= prec (t/precedence ctx a)) (inc prec) prec))) args))])

(defn- chained-comparison [ctx op args]
  (if (<= (count args) 2)
    [(t/operand ctx (first args) 5) " " op " " (t/operand ctx (second args) 5)]
    (d/join " && " (vec (for [[a b] (partition 2 1 args)]
                          [(t/operand ctx a 5) " " op " " (t/operand ctx b 5)])))))

(t/defexpr (core 'and) (fn [ctx _node args] (if (seq args) (infix ctx "&&" 3 args) "true")))
(t/defexpr (core 'or)  (fn [ctx _node args] (if (seq args) (infix ctx "||" 2 args) "null")))
(t/defexpr (core 'not) (fn [ctx _node [a]] (negate ctx a)))

(doseq [[sym op] [['= "=="] ['== "=="] ['not= "!="] ['< "<"] ['> ">"] ['<= "<="] ['>= ">="] ['identical? "==="]]]
  (t/defexpr (core sym) (fn [ctx _node args] (chained-comparison ctx op args))))

(doseq [[sym op prec] [['+ "+" 6] ['* "*" 7] ['mod "%" 7] ['rem "%" 7]]]
  (t/defexpr (core sym) (fn [ctx _node args] (infix ctx op prec args))))

(defn- non-assoc [ctx op prec args]
  [:group (d/join [:line op " "] (into [(t/operand ctx (first args) (dec prec))]
                                       (map #(t/operand ctx % prec) (rest args))))])

(t/defexpr (core '-) (fn [ctx _node args] (if (= 1 (count args)) ["-" (t/operand ctx (first args) 8)] (non-assoc ctx "-" 6 args))))
(t/defexpr (core '/) (fn [ctx _node args] (if (= 1 (count args)) ["1 / " (t/operand ctx (first args) 7)] (non-assoc ctx "/" 7 args))))
(t/defexpr (core 'inc) (fn [ctx _node [a]] [(t/operand ctx a 5) " + 1"]))
(t/defexpr (core 'dec) (fn [ctx _node [a]] [(t/operand ctx a 5) " - 1"]))
(t/defexpr (core 'quot) (fn [ctx _node [a b]] ["Math.trunc(" (t/operand ctx a) " / " (t/operand ctx b) ")"]))
(t/defexpr (core 'max) (fn [ctx _node args] (t/call-docs "Math.max" (t/args-docs ctx args))))
(t/defexpr (core 'min) (fn [ctx _node args] (t/call-docs "Math.min" (t/args-docs ctx args))))
(t/defexpr (core 'abs) (fn [ctx _node args] (t/call-docs "Math.abs" (t/args-docs ctx args))))

(doseq [[sym op rhs] [['nil? "==" "null"] ['some? "!=" "null"] ['true? "===" "true"] ['false? "===" "false"]
                      ['zero? "==" "0"] ['pos? ">" "0"] ['neg? "<" "0"]]]
  (t/defexpr (core sym) (fn [ctx _node [a]] [(t/operand ctx a 5) " " op " " rhs])))

(t/defexpr (core 'even?) (fn [ctx _node [a]] [(t/operand ctx a) " % 2 == 0"]))
(t/defexpr (core 'odd?) (fn [ctx _node [a]] [(t/operand ctx a) " % 2 != 0"]))

(doseq [[sym ty] [['string? "string"] ['number? "number"] ['int? "number"] ['integer? "number"]
                  ['fn? "function"] ['boolean? "boolean"]]]
  (t/defexpr (core sym) (fn [ctx _node [a]] ["typeof " (t/operand ctx a) " === \"" ty "\""])))

(t/defexpr (core 'instance?) (fn [ctx _node [cls v]] [(t/operand ctx v 5) " instanceof " (x ctx cls)]))

;;; ------------------------------------------------ Strings -----------------------------------------------------

(defn template
  "A template literal from parts: strings are literal text, nodes are interpolated."
  [ctx parts]
  (str "`"
       (apply str (for [part parts]
                    (if (string? part)
                      (-> part (str/replace "\\" "\\\\") (str/replace "`" "\\`") (str/replace "${" "\\${"))
                      (str "${" (d/flat-string (x ctx part)) "}"))))
       "`"))

(defn literal-string
  "The string value of `node` if it's a string literal or `(str \"a\" \"b\" ...)` of literals, else nil."
  [ctx node]
  (let [node (p/unwrap-meta node)]
    (cond
      (p/string-node? node) (p/string-value node)
      (and (t/head-is? ctx node (core 'str)) (every? p/string-node? (rest (p/forms node))))
      (apply str (map p/string-value (rest (p/forms node))))
      :else nil)))

(t/defexpr (core 'str)
  (fn [ctx _node args]
    (cond
      (empty? args) "\"\""
      (and (= 1 (count args)) (not (p/string-node? (first args)))) ["String(" (x ctx (first args)) ")"]
      (every? p/string-node? args) (names/js-string (apply str (map p/string-value args)))
      :else (template ctx (map #(if (p/string-node? %) (p/string-value %) %) args)))))

(defn format-template
  "`(format \"a %s b %d\" x y)` as a template literal when the format only uses %s/%d, else nil."
  [ctx fmt-node args]
  (when (p/string-node? fmt-node)
    (let [fmt    (p/string-value fmt-node)
          pieces (re-seq #"%[sd%]|%[^sd%]|[^%]+|%" fmt)]
      (when (every? #(or (not (str/starts-with? % "%")) (#{"%s" "%d" "%%"} %)) pieces)
        (loop [pieces pieces, args args, acc []]
          (if-let [pc (first pieces)]
            (cond
              (= pc "%%")          (recur (rest pieces) args (conj acc "%"))
              (#{"%s" "%d"} pc)    (recur (rest pieces) (rest args) (conj acc (first args)))
              :else                (recur (rest pieces) args (conj acc pc)))
            (when (empty? args) (template ctx (map #(or % "null") acc)))))))))

(t/defexpr (core 'format)
  (fn [ctx _node [fmt & args]]
    (or (format-template ctx fmt args)
        (t/call-docs "sprintf" (t/args-docs ctx (cons fmt args))))))

(t/defexpr (core 'println 'prn 'print)
  (fn [ctx _node args] (t/call-docs "console.log" (t/args-docs ctx args))))

(t/defexpr (core 're-find)
  (fn [ctx _node [re s]] (t/call-docs [(t/operand ctx s) ".match"] [(x ctx re)])))

(doseq [[sym method] [['includes? "includes"] ['starts-with? "startsWith"] ['ends-with? "endsWith"]
                      ['lower-case "toLowerCase"] ['upper-case "toUpperCase"] ['trim "trim"]
                      ['split "split"] ['replace "replaceAll"] ['index-of "indexOf"] ['triml "trimStart"]
                      ['trimr "trimEnd"]]]
  (t/defexpr (symbol "clojure.string" (str sym))
    (fn [ctx _node [s & args]] (t/call-docs [(t/operand ctx s) "." method] (t/args-docs ctx args)))))

(t/defexpr (symbol "metabase.util" "lower-case-en")
  (fn [ctx _node [s]] [(t/operand ctx s) ".toLowerCase()"]))
(t/defexpr (symbol "metabase.util" "upper-case-en")
  (fn [ctx _node [s]] [(t/operand ctx s) ".toUpperCase()"]))

(t/defexpr 'clojure.string/join
  (fn [ctx _node args]
    (if (= 1 (count args))
      [(t/operand ctx (first args)) ".join(\"\")"]
      (t/call-docs [(t/operand ctx (second args)) ".join"] [(x ctx (first args))]))))

;;; ------------------------------------------------ Collections -------------------------------------------------

(def ^:private unary-predicates
  "clojure.core predicates that read better inlined as `(x) => x > 0` than as `isPos` when passed as a function."
  (core 'nil? 'some? 'pos? 'neg? 'zero? 'even? 'odd? 'true? 'false? 'not 'string? 'number? 'int? 'integer? 'fn?
        'boolean? 'inc 'dec))

(defn fn-arg
  "Translate `node` used as a function argument: keywords become accessor arrows, sets become membership tests, and
  simple core predicates become arrows."
  [ctx node]
  (let [node* (p/unwrap-meta node)
        k     (when (p/symbol-node? node*) (p/resolve-sym (:info ctx) (p/sym node*)))]
    (cond
      (p/keyword-node? node*) ["(x) => x" (names/prop-access (t/keyword-string ctx node*) false)]
      (p/set-node? node*)     ["(x) => " (x ctx node*) ".has(x)"]
      (and k (unary-predicates k) (not (some-> (:declared ctx) deref (contains? (str (p/sym node*))))))
      ["(x) => " (x (update ctx :renames assoc "x" "x") (n/list-node [node* (n/whitespace-node " ") (n/token-node 'x)]))]
      :else                   (x ctx node))))

(defn chain-step
  "`recv.method(...)`, breaking before the `.` when it doesn't fit. The suffix is remembered in metadata so that
  threading macros can lay out a whole chain together."
  [recv-doc suffix-doc]
  [recv-doc (with-meta [:group [:nest 2 [:softline suffix-doc]]] {:chain-suffix suffix-doc})])

(defn- chain-suffix
  "If `doc` (with its receiver already stripped) is a single method-call suffix, the bare suffix doc."
  [doc]
  (let [parts (remove #(or (nil? %) (= "" %)) (if (and (vector? doc) (not (keyword? (first doc)))) doc [doc]))]
    (when (= 1 (count parts))
      (:chain-suffix (meta (first parts))))))

(defn method-call
  "`coll.method(args)` with `coll` parenthesized if needed."
  ([ctx coll method arg-docs] (method-call ctx coll method arg-docs nil))
  ([ctx coll method arg-docs hug?]
   (chain-step (t/operand ctx coll) (t/call-docs ["." method] arg-docs hug?))))

(defn method-call-doc
  "`recv.method(args)` for an already-translated receiver doc."
  [recv-doc method arg-docs]
  (chain-step recv-doc (t/call-docs ["." method] arg-docs)))

(defn- fnish? [ctx node] (t/huggable-node? ctx node))

(doseq [[sym method] [['map "map"] ['mapv "map"] ['filter "filter"] ['filterv "filter"] ['mapcat "flatMap"]
                      ['every? "every"] ['remove "reject"] ['map-indexed "mapIndexed"] ['sort-by "sortBy"]
                      ['group-by "groupBy"] ['keep-indexed "keepIndexed"] ['take-while "takeWhile"]
                      ['drop-while "dropWhile"] ['partition-by "partitionBy"]]]
  (t/defexpr (core sym)
    (fn [ctx _node args]
      (if (= 2 (count args))
        (method-call ctx (second args) method [(fn-arg ctx (first args))] (fnish? ctx (first args)))
        t/decline))))

(t/defexpr (core 'keep)
  (fn [ctx _node args]
    (if (= 2 (count args))
      [(method-call ctx (second args) "map" [(fn-arg ctx (first args))] (fnish? ctx (first args)))
       ".filter((x) => x != null)"]
      t/decline)))

(t/defexpr (core 'reduce)
  (fn [ctx _node args]
    (case (count args)
      2 (method-call ctx (second args) "reduce" [(fn-arg ctx (first args))])
      3 (method-call ctx (nth args 2) "reduce" [(fn-arg ctx (first args)) (x ctx (second args))])
      t/decline)))

(t/defexpr (core 'first)  (fn [ctx _node [c]] [(t/operand ctx c) "[0]"]))
(t/defexpr (core 'second) (fn [ctx _node [c]] [(t/operand ctx c) "[1]"]))
(t/defexpr (core 'last)   (fn [ctx _node [c]] [(t/operand ctx c) ".at(-1)"]))
(t/defexpr (core 'rest)   (fn [ctx _node [c]] [(t/operand ctx c) ".slice(1)"]))
(t/defexpr (core 'nth)    (fn [ctx _node [c i d]]
                            (if d t/decline [(t/operand ctx c) "[" (x ctx i) "]"])))
(t/defexpr (core 'count)  (fn [ctx _node [c]] [(t/operand ctx c) ".length"]))
(t/defexpr (core 'keys)   (fn [ctx _node [m]] ["Object.keys(" (x ctx m) ")"]))
(t/defexpr (core 'vals)   (fn [ctx _node [m]] ["Object.values(" (x ctx m) ")"]))
(t/defexpr (core 'vec)    (fn [ctx _node [c]] ["[..." (x ctx c) "]"]))
(t/defexpr (core 'set)    (fn [ctx _node [c]] ["new Set(" (x ctx c) ")"]))
(t/defexpr (core 'vector 'list) (fn [ctx _node args] (d/bracket "[" (t/args-docs ctx args) "]")))
(t/defexpr (core 'hash-set) (fn [ctx _node args] ["new Set(" (d/bracket "[" (t/args-docs ctx args) "]") ")"]))
(t/defexpr (core 'boolean) (fn [ctx _node [v]] ["Boolean(" (x ctx v) ")"]))
(t/defexpr (core 'identity) (fn [ctx _node [v]] (t/call-docs "identity" [(x ctx v)])))

(defn- key-doc
  "Object key for a key node: `a` for :a, `[expr]` otherwise."
  [ctx node]
  (let [node* (p/unwrap-meta node)]
    (if (p/keyword-node? node*)
      (names/prop-key (t/keyword-string ctx node*))
      ["[" (x ctx node) "]"])))

(defn- access-doc
  "`obj?.k` for keyword k, `obj?.[k]` otherwise."
  [ctx obj-doc key-node]
  (let [key* (p/unwrap-meta key-node)]
    (if (p/keyword-node? key*)
      [obj-doc (names/prop-access (t/keyword-string ctx key*) false)]
      [obj-doc "[" (x ctx key-node) "]"])))

(t/defexpr (core 'get)
  (fn [ctx _node [m k dflt]]
    (let [acc (access-doc ctx (t/operand ctx m) k)]
      (if dflt ["(" acc " ?? " (x ctx dflt) ")"] acc))))

(t/defexpr (core 'get-in)
  (fn [ctx _node [m path dflt]]
    (if-not (p/vector-node? path)
      t/decline
      (let [acc (reduce #(access-doc ctx %1 %2) (t/operand ctx m) (p/forms path))]
        (if dflt ["(" acc " ?? " (x ctx dflt) ")"] acc)))))

(defn spread-object
  "`{ ...base, k: v }` from a base doc (or nil) and [key-doc value-doc] entries."
  [base-docs entries]
  (d/bracket "{" (into (mapv (fn [b] ["..." b]) base-docs)
                       (for [[k v] entries] (if (and (string? k) (= k v)) k [k ": " v])))
             "}" true))

(t/defexpr (core 'assoc)
  (fn [ctx _node [m & kvs]]
    (spread-object [(x ctx m)] (for [[k v] (partition 2 kvs)] [(key-doc ctx k) (x ctx v)]))))

(t/defexpr (core 'merge)
  (fn [ctx _node args]
    (d/bracket "{"
               (vec (mapcat (fn [a]
                              (let [a* (p/unwrap-meta a)]
                                (if (p/map-node? a*)
                                  (for [[k v] (partition 2 (p/forms a*))
                                        :let [kd (key-doc ctx k) vd (x ctx v)]]
                                    (if (and (string? kd) (= kd vd)) kd [kd ": " vd]))
                                  [["..." (x ctx a)]])))
                            args))
               "}" true)))

(defn- synthetic-call
  "A list node `(f arg ...)` built from existing nodes, for rules that rewrite into another call."
  [f & args]
  (n/list-node (interpose (n/whitespace-node " ") (cons f args))))

(t/defexpr (core 'update)
  (fn [ctx _node [m k f & args]]
    (let [k*  (p/unwrap-meta k)
          cur (if (p/keyword-node? k*) (synthetic-call k m) (synthetic-call (n/token-node 'get) m k))]
      (spread-object [(x ctx m)] [[(key-doc ctx k) (x ctx (apply synthetic-call f cur args))]]))))

(t/defexpr (core 'dissoc)
  (fn [ctx _node [m & ks]] (t/call-docs "omit" (into [(x ctx m)] (t/args-docs ctx ks)))))

(t/defexpr (core 'select-keys)
  (fn [ctx _node [m ks]] (t/call-docs "pick" [(x ctx m) (x ctx ks)])))

(t/defexpr (core 'contains?)
  (fn [ctx _node [coll k]]
    (let [k* (p/unwrap-meta k)]
      (if (p/keyword-node? k*)
        [(names/js-string (t/keyword-string ctx k*)) " in " (t/operand ctx coll 5)]
        [(t/operand ctx coll) ".has(" (x ctx k) ")"]))))

(t/defexpr (core 'into)
  (fn [ctx _node [to & more]]
    (let [to* (p/unwrap-meta to)
          empty-lit? (and (n/inner? to*) (empty? (p/forms to*)))]
      (cond
        (and empty-lit? (= 1 (count more)) (p/vector-node? to*)) ["[..." (x ctx (first more)) "]"]
        (and empty-lit? (= 1 (count more)) (p/set-node? to*))    ["new Set(" (x ctx (first more)) ")"]
        (and empty-lit? (= 1 (count more)) (p/map-node? to*))    ["Object.fromEntries(" (x ctx (first more)) ")"]
        :else t/decline))))

(t/defexpr (core 'apply)
  (fn [ctx _node [f & args]]
    (t/call-docs (fn-arg ctx f)
                 (conj (t/args-docs ctx (butlast args)) ["..." (x ctx (last args))]))))

(t/defexpr (core 'partial)
  (fn [ctx _node [f & args]]
    ["(...args) => " (t/call-docs (fn-arg ctx f) (conj (t/args-docs ctx args) "...args"))]))

(t/defexpr (core 'constantly)
  (fn [ctx _node [v]] ["() => " (t/operand ctx v)]))

(t/defexpr (core 'complement)
  (fn [ctx _node [f]] ["(...args) => !" (t/call-docs (fn-arg ctx f) ["...args"])]))

(t/defexpr (core 'comp)
  (fn [ctx _node fs]
    (if (empty? fs)
      "identity"
      ["(x) => " (reduce (fn [inner f] (t/call-docs (fn-arg ctx f) [inner])) "x" (reverse fs))])))

(t/defexpr (core 'juxt)
  (fn [ctx _node fs]
    ["(x) => " (d/bracket "[" (mapv #(t/call-docs (fn-arg ctx %) ["x"]) fs) "]")]))

;;; ------------------------------------------------ Atoms & state ----------------------------------------------

(t/defexpr (core 'deref) (fn [ctx _node [a]] [(t/operand ctx a) ".value"]))
(t/defexpr (core 'reset! 'vreset!) (fn [ctx _node [a v]] [(t/operand ctx a) ".value = " (x ctx v)]))
(t/defexpr (core 'swap! 'vswap!)
  (fn [ctx _node [a f & args]]
    [(t/operand ctx a) ".value = "
     (x ctx (apply synthetic-call f (synthetic-call (n/token-node 'deref) a) args))]))

;;; ------------------------------------------------ Threading --------------------------------------------------

(def ^:private placeholder "%PIPE%")

(defn- thread-step
  "Insert the threaded value (a placeholder symbol `ph`) into a step form, first or last."
  [step ph last?]
  (let [step* (p/unwrap-meta step)
        ph-node (n/token-node (symbol ph))]
    (if (p/list-node? step*)
      (let [kids (vec (n/children step*))
            head-idx (first (keep-indexed (fn [i c] (when (p/significant? c) i)) kids))]
        (if last?
          (n/list-node (conj kids (n/whitespace-node " ") ph-node))
          (n/list-node (concat (subvec kids 0 (inc head-idx)) [(n/whitespace-node " ") ph-node] (subvec kids (inc head-idx))))))
      (synthetic-call step* ph-node))))

(defn- strip-leading
  "If the first text in `doc` starts with `prefix`, return the doc without it; else nil."
  [doc prefix]
  (cond
    (string? doc) (when (str/starts-with? doc prefix) (subs doc (count prefix)))
    (and (vector? doc) (#{:nest :group :if-break} (first doc))) nil
    (vector? doc) (loop [i 0]
                    (when (< i (count doc))
                      (let [el (nth doc i)]
                        (cond
                          (or (nil? el) (= "" el)) (recur (inc i))
                          (and (vector? el) (#{:nest :group} (first el)))
                          (when-let [inner (strip-leading (if (= :group (first el)) (second el) (nth el 2)) prefix)]
                            (assoc doc i (if (= :group (first el)) [:group inner] [:nest (second el) inner])))
                          :else
                          (when-let [inner (strip-leading el prefix)]
                            (assoc doc i inner))))))
    :else nil))

(defn- thread-expr
  "Threading macros. Steps whose translation starts with the threaded value (`%.map(f)`, `%?.k`) are chained
  directly onto it; other steps become Hack-style pipeline steps `|> f(%, 1)` with `%` marking where the value
  goes. A single-step thread just substitutes the value in."
  [ctx head-node steps {:keys [last? nil-safe?]}]
  (let [pctx   (update (t/xctx ctx) :renames assoc placeholder "%")
        pipe   (if nil-safe? "?|> " "|> ")
        head   (t/operand ctx head-node)]
    (if (and (= 1 (count steps)) (not nil-safe?))
      (let [sub-ctx (update (t/xctx ctx) :renames assoc placeholder
                            (d/flat-string (if (t/needs-parens? ctx head-node) head (x ctx head-node))))]
        (x sub-ctx (thread-step (first steps) placeholder last?)))
      (loop [steps steps, chain [], pipes []]
        (if-let [step (first steps)]
          (let [step-node (thread-step step placeholder last?)
                sdoc  (x pctx step-node)
                ;; only primary expressions (member access, method calls) can be chained; an operator step like
                ;; `% + 1` would bind wrongly to anything chained after it
                sfx   (when (and (empty? pipes) (nil? (t/precedence pctx step-node)))
                        (strip-leading sdoc "%"))
                cs    (some-> sfx chain-suffix)
                sfx   (or cs sfx)
                sfx   (if (and sfx nil-safe?)
                        (or (some->> (strip-leading sfx ".") (vector "?."))
                            (some->> (strip-leading sfx "[") (vector "?.["))
                            sfx)
                        sfx)]
            (if (and sfx (not (str/blank? (d/flat-string sfx))))
              (recur (rest steps) (conj chain (if cs [:nest 2 [:softline sfx]] sfx)) pipes)
              (recur (rest steps) chain (conj pipes [:nest 2 [:line pipe sdoc]]))))
          [:group [head chain pipes]])))))

(t/defexpr (core '->)      (fn [ctx _node [h & steps]] (thread-expr ctx h steps {})))
(t/defexpr (core '->>)     (fn [ctx _node [h & steps]] (thread-expr ctx h steps {:last? true})))
(t/defexpr (core 'some->)  (fn [ctx _node [h & steps]] (thread-expr ctx h steps {:nil-safe? true})))
(t/defexpr (core 'some->>) (fn [ctx _node [h & steps]] (thread-expr ctx h steps {:last? true :nil-safe? true})))

(defn cond-thread-stmts
  "`cond->`, `cond->>` and `as->` as a sequence of reassignments to a local `target`:
      let acc = x;
      if (c) acc = f(acc, 1);
  When `target` is given (a `let` binding name) the statements assign that name directly and return nothing."
  ([ctx node] (cond-thread-stmts ctx node nil))
  ([ctx node target]
   (let [k      (t/resolve-head ctx node)
         [init & more] (rest (p/forms node))
         as?    (= k 'clojure.core/as->)
         nm     (cond as? (str (p/sym (first more))) target target :else "acc")
         more   (if as? (rest more) more)
         js     (t/sym-doc ctx (symbol nm))
         c      (update (t/xctx ctx) :renames assoc placeholder js)
         last?  (= k 'clojure.core/cond->>)
         some?  (#{'clojure.core/some-> 'clojure.core/some->>} k)
         step   (fn [s] (x c (if as? s (thread-step s placeholder (or last? (= k 'clojure.core/some->>))))))
         body   (cond
                  (or as? some?) (for [s more]
                                   [(when some? ["if (" js " == null) " (if target "{ /* stop */ }" "return null;") " "])
                                    js " = " (step s) ";"])
                  :else          (for [[tst s] (partition 2 more)]
                                   ["if (" (x ctx tst) ") " js " = " (step s) ";"]))]
     (cond-> (into [["let " js " = " (x ctx init) ";"]] body)
       (not target) (into (t/emit ctx js))))))

(t/defstmt (core 'cond-> 'cond->> 'as->)
  (fn [ctx node _args]
    (if (= :stmt (:pos ctx)) t/decline (cond-thread-stmts ctx node))))

(t/defstmt (core 'doto)
  (fn [ctx _node [obj & steps]]
    (let [obj*    (p/unwrap-meta obj)
          simple? (or (p/symbol-node? obj*) (p/keyword-node? obj*))
          js      (if simple? (d/flat-string (x ctx obj)) "obj")
          c       (update (t/xctx ctx) :renames assoc placeholder js)]
      (-> (if simple? [] [["const obj = " (x ctx obj) ";"]])
          (into (for [s steps] [(x c (thread-step s placeholder false)) ";"]))
          (into (when (#{:return :yield} (:pos ctx)) (t/emit ctx js)))))))

;;; ------------------------------------------------ Scoped resources -------------------------------------------

(defn scoped
  "Statements for a macro that sets something up for the duration of its body (`with-open`, `binding`,
  `with-redefs`, `mt/with-temp`, ...), rendered with TypeScript's `using` declarations:

      using _ = withSettings({ ... });   // undone when the enclosing block ends
      ...body...

  In tail position the body is flattened into the current block; otherwise it gets its own `{ }` block."
  [ctx using-stmts body-ents]
  (let [inner (t/body-stmts ctx body-ents)
        all   (into (vec using-stmts) inner)]
    (if (or (#{:return :yield} (:pos ctx)) (:last? ctx))
      all
      [(d/block all)])))

(t/defstmt (core 'with-open)
  (fn [ctx node [bvec]]
    (scoped ctx
            (for [[pat v] (partition 2 (p/forms bvec))]
              ["using " (:doc (t/pattern-doc ctx pat)) " = " (x ctx v) ";"])
            (p/entries node 2))))

(t/defstmt (core 'binding)
  (fn [ctx node [bvec]]
    (scoped ctx
            (for [[s v] (partition 2 (p/forms bvec))]
              ["using _ = bind(" (x ctx s) ", " (x ctx v) ");"])
            (p/entries node 2))))

(t/defstmt (core 'with-redefs)
  (fn [ctx node [bvec]]
    (scoped ctx
            (for [[s v] (partition 2 (p/forms bvec))]
              ["using _ = mock(" (x ctx s) ", " (x ctx v) ");"])
            (p/entries node 2))))

(t/defstmt (core 'locking)
  (fn [ctx node [lock]]
    (scoped ctx [["using _ = lock(" (x ctx lock) ");"]] (p/entries node 2))))

;;; ------------------------------------------------ Multimethods & misc ----------------------------------------

(t/defstmt (core 'defmulti)
  (fn [ctx _node [name-node & more]]
    (let [[doc more] (if (p/string-node? (first more)) [(p/string-value (first more)) (rest more)] [nil more])
          more       (if (p/map-node? (first more)) (rest more) more)
          dispatch   (first more)]
      (-> []
          (cond-> doc (conj (t/jsdoc doc)))
          (conj ["const " (t/sym-doc ctx (p/sym (p/unwrap-meta name-node))) " = multimethod("
                 (fn-arg ctx dispatch) ");"
                 "  // implementations are chosen by the dispatch value (see `.implement(...)` below)"])))))

(defn method-stmts
  "`name.implement(dispatchValue, (params) => { ... })` for defmethod-like forms."
  [ctx node {:keys [name-doc qualifier dispatch-node params-node skip ret-schema]}]
  (let [{pdocs :docs prelude :prelude pnames :names ents :ents} (t/signature ctx params-node (p/entries node skip))]
    [[name-doc "." (if qualifier (names/camel (name qualifier)) "implement") "("
      (x ctx dispatch-node) ", "
      (d/bracket "(" pdocs ")")
      (when ret-schema [": " (t/schema-type ctx ret-schema)])
      " => "
      (t/body-block (t/at ctx :return) ents pnames prelude)
      ");"]]))

(t/defstmt (core 'defmethod)
  (fn [ctx node [name-node dispatch pvec]]
    (method-stmts ctx node {:name-doc (x ctx name-node) :dispatch-node dispatch :params-node pvec :skip 4})))

(t/defstmt (core 'extend-protocol 'extend-type 'defprotocol 'defrecord 'deftype)
  (fn [ctx node _args]
    (t/note! :raw (str (t/resolve-head ctx node)))
    [(str "// " (name (t/resolve-head ctx node)) " (shown as Clojure)") (t/raw-doc node)]))

(t/defexpr (core 'reify 'proxy)
  (fn [ctx node _args]
    (t/note! :raw (str (t/resolve-head ctx node)))
    (t/raw-doc node)))

(t/defexpr (core 'new)
  (fn [ctx node [cls]] (t/call-nodes ctx ["new " (x ctx cls)] node 2)))

(t/defexpr (core '.)
  (fn [ctx _node [obj member & args]]
    (let [member* (p/unwrap-meta member)]
      (if (p/list-node? member*)
        (let [[m & margs] (p/forms member*)]
          (method-call ctx obj (str (p/sym m)) (t/args-docs ctx margs)))
        (method-call ctx obj (str (p/sym member*)) (t/args-docs ctx args))))))
