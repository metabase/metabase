(ns metabase.search.query-expr
  "A structured keyword query: `and`, `or` and `not` nodes over literal leaves, compiled per engine.

  A leaf is a single term (a string with no whitespace), `{\"op\": \"phrase\", \"text\": ...}` for words that must
  appear together and in order, or `{\"op\": \"prefix\", \"text\": ...}` for a term that may start a longer word.
  Leaves are always literal: `\"or\"` is the word or, never an operator.
  Each engine advertises the subset of operators it executes; see [[schema]]."
  (:require
   [clojure.set :as set]
   [clojure.string :as str]))

(set! *warn-on-reflection* true)

;; Depth 3 covers an `and` of `or` synonym groups with a `not` inside one of them. Deeper nesting is almost always a
;; query an agent could flatten, and a model that nests deeper has usually lost track of what it is asking for.
(def max-depth
  "The most levels of `and`/`or`/`not` on any path. Leaves don't add a level."
  3)

;; Sixteen leaves fit three concepts with five synonyms each. Every leaf becomes a predicate, and the in-place engine
;; builds one `LIKE` per term per searchable column, so this keeps a query well under a hundred of them.
(def max-leaves
  "The most leaves (terms, phrases and prefixes) in one query."
  16)

(def all-ops
  "Every operator a query can use. Engines advertise a subset."
  #{"and" "or" "not" "phrase" "prefix"})

(def ^:private term
  [:re {:description   "A single term: no spaces. Combine terms with an `and` or `or` node, or use a `phrase`."
        :error/message (str "must be a single term with no spaces; combine terms with {\"op\": \"and\", ...} or "
                            "{\"op\": \"or\", ...}, or use {\"op\": \"phrase\", ...} for words that belong together")}
   #"^\S+$"])

(defn- dispatch
  [x]
  (if (string? x) ::term (:op x)))

(defn- level-schema
  "The schema for a node with `level` operator levels left beneath it, using only `ops`."
  [ops level]
  (let [child  (when (pos? level) (level-schema ops (dec level)))
        branch (fn [op min-args max-args]
                 [op [:map {:closed true}
                      [:op [:= op]]
                      [:args (cond-> [:sequential {:min min-args}]
                               max-args (update 1 assoc :max max-args)
                               true     (conj child))]]])]
    (into [:multi {:dispatch      dispatch
                   :error/message (str "must be a single term or a node whose `op` is one of: "
                                       (str/join ", " (sort (cond-> ops (zero? level) (set/difference #{"and" "or" "not"}))))
                                       " (operators nest at most " max-depth " levels)")}
           [::term term]]
          (cond-> []
            (ops "phrase")         (conj ["phrase" [:map {:closed true}
                                                    [:op [:= "phrase"]]
                                                    [:text {:description "Words that must appear together, in order."}
                                                     [:string {:min 1}]]]])
            (ops "prefix")         (conj ["prefix" [:map {:closed true}
                                                    [:op [:= "prefix"]]
                                                    [:text {:description "A term that may be the start of a longer word."}
                                                     term]]])
            (and child (ops "and")) (conj (branch "and" 2 nil))
            (and child (ops "or"))  (conj (branch "or" 2 nil))
            (and child (ops "not")) (conj (branch "not" 1 1))))))

(def ^{:arglists '([ops])} schema
  "The malli schema for a query that uses only `ops` (a subset of [[all-ops]]), nested at most [[max-depth]] levels.
  The levels are written out rather than recursive, so the JSON Schema a model sees needs no `$ref`."
  (memoize (fn [ops] (level-schema (set ops) max-depth))))

(defn- leaf?
  [expr]
  (or (string? expr) (contains? #{"phrase" "prefix"} (:op expr))))

(defn leaves
  "Every leaf in `expr`, in order."
  [expr]
  (if (leaf? expr)
    [expr]
    (mapcat leaves (:args expr))))

(defn leaf-text
  "The text a leaf matches."
  [leaf]
  (if (string? leaf) leaf (:text leaf)))

(defn limit-error
  "An error message when `expr` has more than [[max-leaves]] leaves, else nil. The schema enforces depth."
  [expr]
  (let [n (count (leaves expr))]
    (when (> n max-leaves)
      (str "The query has " n " leaves; the most is " max-leaves ". "
           "Split it into separate searches, or drop some alternatives."))))

(defn- positive-leaves
  [expr]
  (cond
    (leaf? expr)            [expr]
    (= "not" (:op expr))    []
    :else                   (mapcat positive-leaves (:args expr))))

(defn search-string
  "The texts of the leaves outside any `not`, joined with spaces. Engines that match a plain string get this: the
  in-place engine ORs its words and app-db on H2 ANDs them, which is exactly what their `or`-only and `and`-only
  queries mean."
  [expr]
  (str/join " " (map leaf-text (positive-leaves expr))))

(defn name-scoring-texts
  "The texts the name scorers (exact match, name prefix) compare a result's name against.

  They take one string, so only simple shapes get them: a single leaf, or one `and` or `or` node whose args are all
  leaves. A flat `and` compares against its texts joined with spaces. A flat `or` compares against each alternative,
  and the best match counts, because a joined string would reward a name that is literally every alternative.
  Anything deeper gets no name boost: returns an empty vector."
  [expr]
  (cond
    (leaf? expr)
    [(leaf-text expr)]

    (and (contains? #{"and" "or"} (:op expr)) (every? leaf? (:args expr)))
    (if (= "or" (:op expr))
      (mapv leaf-text (:args expr))
      [(str/join " " (map leaf-text (:args expr)))])

    :else
    []))

(defn ->tsquery
  "Compile `expr` to a HoneySQL `tsquery` expression under the text-search configuration `lang`.
  Every leaf's text is a bound parameter; nothing is spliced into the `to_tsquery` string language."
  [expr lang]
  (let [lang    ^:allow-raw-sql [:inline lang]
        combine (fn [f [q & qs]] (reduce (fn [a b] [f a b]) q qs))
        go      (fn go [e]
                  (cond
                    (string? e)          [:plainto_tsquery lang e]
                    (= "phrase" (:op e)) [:phraseto_tsquery lang (:text e)]
                    ;; quote_literal makes the term a single quoted lexeme before `:*` marks it as a prefix
                    (= "prefix" (:op e)) [:to_tsquery lang [:|| [:quote_literal (:text e)] ":*"]]
                    (= "and" (:op e))    (combine :tsquery_and (map go (:args e)))
                    (= "or" (:op e))     (combine :tsquery_or (map go (:args e)))
                    (= "not" (:op e))    [:tsquery_not (go (first (:args e)))]))]
    (go expr)))
