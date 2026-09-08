(ns dev.security-lint.ast
  "Node helpers for authoring security rules.

  Rules are handed a rewrite-clj node for the call form they matched and use the predicates here to inspect its
  shape. Nothing in this namespace knows about clj-kondo, SARIF, or any particular vulnerability -- it is the
  vocabulary that rule authors write against."
  (:refer-clojure :exclude [accessor])
  (:require
   [dev.security-lint.vocabulary :as vocab]
   [rewrite-clj.node :as n]))

(set! *warn-on-reflection* true)

(defn ->str
  "Source text of `node`. Handy in tests and finding messages."
  [node]
  (n/string node))

(defn- discarded?
  "A `#_` form. It is not whitespace to rewrite-clj, but it is not code either: `(f #_a b)` has one argument."
  [node]
  (= :uneval (n/tag node)))

(defn children
  "Significant children of `node`: no whitespace, no comments, no `#_` forms."
  [node]
  (when (n/inner? node)
    (remove #(or (n/whitespace-or-comment? %) (discarded? %)) (n/children node))))

(defn call?
  "True if `node` is a list form or a `#(...)` literal, i.e. a candidate function/macro call. nil is not.

  `#(f %)` is a call to `f` as far as a rule is concerned: the same argument shapes, one invocation away. Treating
  only `:list` as a call left every trigger inside a fn literal unmatched."
  [node]
  (and node (boolean (#{:list :fn} (n/tag node)))))

(defn head-sym
  "The head symbol of a call form, or nil if `node` isn't a call headed by a symbol.

  Returns the symbol as written, so it may be namespace-qualified (`shell/sh`) or bare (`str`)."
  [node]
  (when (call? node)
    (let [head (first (children node))]
      (when (and head (= :token (n/tag head)))
        (let [v (n/sexpr head)]
          (when (symbol? v) v))))))

(defn args
  "Argument nodes of a call form -- significant children after the head. Empty for non-calls."
  [node]
  (if (call? node)
    (vec (rest (children node)))
    []))

(defn arg
  "The `n`th argument node (0-indexed) of a call form, or nil."
  [node n]
  (nth (args node) n nil))

(defn vector-node?
  "True if `node` is a vector literal."
  [node]
  (and node (= :vector (n/tag node))))

(defn string-value
  "The value of a string literal node, or nil if `node` isn't one."
  [node]
  (when (and node (#{:token :multi-line} (n/tag node)) (string? (n/sexpr node)))
    (n/sexpr node)))

(defn literal-string?
  "True if `node` is a string literal."
  [node]
  (boolean
   (and node
        (#{:token :multi-line} (n/tag node))
        (string? (n/sexpr node)))))

(defn literal?
  "True if `node` is a compile-time constant -- string, number, keyword, boolean or nil.

  A symbol is not a literal: its value is unknown statically, which is what makes it interesting to a security
  rule."
  [node]
  (boolean
   (and node
        (#{:token :multi-line} (n/tag node))
        (let [v (n/sexpr node)]
          (or (string? v) (number? v) (keyword? v) (boolean? v) (nil? v))))))

(defn map-node?
  "True if `node` is a map literal."
  [node]
  (and node (= :map (n/tag node))))

(defn keyword-node?
  "True if `node` is a keyword literal."
  [node]
  (and node (= :token (n/tag node)) (keyword? (n/sexpr node))))

(defn unmeta
  "Strip metadata wrappers from `node`.

  `(defn ^:private f [x] ...)` parses with the name inside a `:meta` node, so anything that reads a form
  positionally has to look through one first."
  [node]
  (if (and node (#{:meta :meta*} (n/tag node)))
    (recur (last (children node)))
    node))

(defn symbol-node?
  "True if `node` is a bare symbol."
  [node]
  (and node (= :token (n/tag node)) (symbol? (n/sexpr node))))

(defn truthy-literal?
  "True if `node` is literally `true`. Distinguishes an explicitly enabled flag from an absent or computed one."
  [node]
  (boolean (and node (= :token (n/tag node)) (true? (n/sexpr node)))))

(defn map-entries
  "Key/value node pairs of a map literal. Empty for anything else."
  [node]
  (if (map-node? node)
    (->> (children node) (partition 2) (mapv vec))
    []))

(defn destructured-keys
  "What a destructuring map binds, by key: `{:keys [a b] c :c :as m}` gives `{:a <a> :b <b> :c <c> :as <m>}`,
  each value the symbol node bound. `:strs` and `:syms` bind by the same names. Empty for anything but a map."
  [node]
  (if (map-node? node)
    (into {}
          (for [[k v] (map-entries node)
                :let  [k (unmeta k) v (unmeta v)]
                pair  (cond
                        (and (keyword-node? k) (contains? #{:keys :strs :syms} (n/sexpr k)) (vector-node? v))
                        (for [sym (children v) :let [sym (unmeta sym)] :when (symbol-node? sym)]
                          [(keyword (name (n/sexpr sym))) sym])

                        (and (keyword-node? k) (= :as (n/sexpr k)) (symbol-node? v))
                        [[:as v]]

                        (and (symbol-node? k) (keyword-node? v))
                        [[(keyword (name (n/sexpr v))) k]])]
            pair))
    {}))

(defn map-get
  "The value node for keyword `k` in a map literal, or nil."
  [node k]
  (some (fn [[kn vn]]
          (when (and (keyword-node? kn) (= k (n/sexpr kn))) vn))
        (map-entries node)))

(defn kwargs
  "Trailing keyword options in `arg-nodes`, as a map of keyword -> value node.

  Macros like `defsetting` take positional arguments followed by keyword options; this finds where the options
  start and pairs them up, dropping a trailing keyword that has no value."
  [arg-nodes]
  (let [args (vec arg-nodes)
        start (first (keep-indexed (fn [i nd] (when (keyword-node? nd) i)) args))]
    (if (nil? start)
      {}
      (into {} (for [[kn vn] (partition 2 (subvec args start))
                     :when (keyword-node? kn)]
                 [(n/sexpr kn) vn])))))

(defn- dead-code?
  "Forms the compiler never sees: `#_`, `(comment ...)`, and quoted data. A rule matching inside one of these
  reports a vulnerability in code that does not run."
  [node]
  (or (discarded? node)
      (= :quote (n/tag node))
      (and (call? node) (= 'comment (head-sym node)))))

(defn find-nodes
  "Every node in `node`'s tree (including itself) satisfying `pred`, never descending into dead code."
  [pred node]
  (letfn [(walk [nd]
            (when-not (dead-code? nd)
              (concat (when (pred nd) [nd])
                      (when (n/inner? nd) (mapcat walk (children nd))))))]
    (walk node)))

(def ^:dynamic *interpolating-fns*
  "See [[dev.security-lint.vocabulary/interpolating-fns]]. Dynamic so a rule can rebind it."
  vocab/interpolating-fns)

(defn- interpolating-head? [sym]
  (boolean
   (when sym
     (or (contains? *interpolating-fns* sym)
         ;; any alias for clojure.string, e.g. (s/join ...) or (cstr/join ...)
         (and (namespace sym) (= "join" (name sym)))))))

(defn dynamic-string?
  "True if `node` builds a string from at least one value that isn't known statically.

  This is the core heuristic behind the injection rules: `(str \"ls \" x)` is dynamic, `(str \"a\" \"b\")` is not."
  [node]
  (boolean
   (and (call? node)
        (interpolating-head? (head-sym node))
        (some (complement literal?) (args node)))))

(defn normalized-text
  "Source text of `node` with formatting removed: one space between significant children, no comments, no `#_`
  forms, no commas. Two spellings of the same code produce the same text, so a fingerprint over it survives a
  reformat. String contents are untouched."
  [node]
  (letfn [(norm [nd]
            (if (n/inner? nd)
              (n/replace-children nd (vec (interpose (n/spaces 1) (map norm (children nd)))))
              nd))]
    (n/string (norm node))))

(defn vector-head
  "The keyword a vector literal starts with, or nil. `[:raw \"...\"]` is a HoneySQL form headed by `:raw`."
  [node]
  (when (vector-node? node)
    (let [h (first (children node))]
      (when (keyword-node? h) (n/sexpr h)))))

(defn meta-marks
  "The keywords a metadata wrapper sets: `^:allow-subquery` and `^{:allow-subquery true}` both mark
  `:allow-subquery`. A `^Type` hint or a `^\"tag\"` contributes nothing."
  [node]
  (when (and node (#{:meta :meta*} (n/tag node)))
    (let [m (first (children node))]
      (cond
        (keyword-node? m) #{(n/sexpr m)}
        (map-node? m)     (into #{} (comp (map first) (filter keyword-node?) (map n/sexpr)) (map-entries m))
        :else             #{}))))

(defn shape-nodes
  "The nodes a shape rule can match, paired with the marks written on them: keyword-headed vectors and any form
  carrying metadata marks, `[node #{marks}]`, never inside dead code. What [[marked-nodes]] returns for every
  node, for only the nodes that matter -- one pair per node of every tree was a fifth of the rule pass."
  [node]
  (letfn [(walk [nd marks]
            (when-not (dead-code? nd)
              (if (#{:meta :meta*} (n/tag nd))
                (walk (last (children nd)) (into marks (meta-marks nd)))
                (let [here (when (or (seq marks) (vector-head nd)) [[nd marks]])]
                  (if (n/inner? nd)
                    (concat here (mapcat #(walk % #{}) (children nd)))
                    here)))))]
    (walk node #{})))

(defn marked-nodes
  "Every node in `node`'s tree paired with the marks written on it: `[node #{marks}]`, never descending into
  dead code.

  A form's marks come from the metadata wrappers directly around it, so `^:allow-raw-sql [:raw x]` yields the
  vector with `#{:allow-raw-sql}`; the wrapper node itself is not returned. Rules that watch forms by shape
  ([[vector-head]]) or by marker read both from this one walk."
  [node]
  (letfn [(walk [nd marks]
            (when-not (dead-code? nd)
              (if (#{:meta :meta*} (n/tag nd))
                (walk (last (children nd)) (into marks (meta-marks nd)))
                (cons [nd marks]
                      (when (n/inner? nd) (mapcat #(walk % #{}) (children nd)))))))]
    (walk node #{})))

(defn accessor
  "The `[map-node key]` an accessor form reads: `(:card_id m)`, `(get m :card_id)`, `(get-in m [:x :card_id])` --
  the last key of a `get-in` path. Nil for any other form."
  [node]
  (when (call? node)
    (let [[h a b] (children node)
          head    (head-sym node)]
      (cond
        (and (keyword-node? h) a)
        [a (n/sexpr h)]

        (and head (= 'get (symbol (name head))) b (keyword-node? b))
        [a (n/sexpr b)]

        (and head (= 'get-in (symbol (name head))) b (vector-node? b)
             (keyword-node? (last (children b))))
        [a (n/sexpr (last (children b)))]))))
