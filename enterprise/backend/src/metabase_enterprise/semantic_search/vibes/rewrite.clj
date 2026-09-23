(ns metabase-enterprise.semantic-search.vibes.rewrite
  "The `RERANK BASED ON VIBES` statement rewrite. SQLite's loadable-extension API cannot add grammar, so the clause
  is rewritten into plain SQL before SQLite sees it (see `local/order_by_vibes_plan.md` §1.5).

      <select> RERANK BASED ON VIBES [ ( <prompt-expr> ) ] [ ASC | DESC ] [ LIMIT n [ OFFSET m ] ]

  becomes

      WITH <original CTEs,>
           __vibes_cand   AS MATERIALIZED (SELECT row_number() OVER () AS __vibes_id, * FROM (<select body>)),
           __vibes_roster AS MATERIALIZED (SELECT json_group_object(__vibes_id, json_object('c1', \"c1\", ...)) AS j
                                           FROM __vibes_cand)
      SELECT \"c1\", ... FROM __vibes_cand, __vibes_roster
      ORDER BY vibes(<prompt-expr>, __vibes_id, __vibes_roster.j) DESC, __vibes_id ASC [LIMIT ...]

  Bare `VIBES` (no prompt expression) means `(SELECT prompt FROM user_prompt)`. Bind parameters keep their
  order: the select's `?`s come first, then the prompt's."
  (:require
   [clojure.string :as str]))

(set! *warn-on-reflection* true)

;;; --------------------------------------------------- Tokenizer ---------------------------------------------------

(def ^:private prefilter
  "Cheap test for a statement that may carry the clause. Anything else is passed through untouched."
  #"(?is)\brerank\b")

(defn candidate?
  "Might `sql` carry a `RERANK` clause? Cheap; false positives are resolved by [[rewrite-rerank]]."
  [sql]
  (boolean (and (string? sql) (re-find prefilter sql))))

(defn- word-char? [^Character c]
  (or (Character/isLetterOrDigit c) (= c \_)))

(defn- keyword-at?
  "Is the word starting at `i` (case-insensitively) `word`, as a whole word?"
  [^String s ^long i ^String word]
  (let [n (count s)
        e (+ i (count word))]
    (and (<= e n)
         (.regionMatches s true i word 0 (count word))
         (or (zero? i) (not (word-char? (.charAt s (dec i)))))
         (or (= e n) (not (word-char? (.charAt s e)))))))

(defn- skip-quoted
  "Index just past the quoted region starting at `i` (whose opening char is `open`, closing `close`). A doubled
  closing char inside is an escape. Unterminated → end of string."
  ^long [^String s ^long i ^Character close]
  (let [n (count s)]
    (loop [j (inc i)]
      (cond
        (>= j n)                      n
        (not= (.charAt s j) close)    (recur (inc j))
        (and (< (inc j) n)
             (= (.charAt s (inc j)) close)) (recur (+ j 2))
        :else                         (inc j)))))

(defn- skip-comment
  "Index just past the comment starting at `i`, or nil when there is none there."
  [^String s ^long i]
  (let [n (count s)]
    (cond
      (.startsWith s "--" i) (let [nl (.indexOf s "\n" (int i))] (if (neg? nl) n (inc nl)))
      (.startsWith s "/*" i) (let [e (.indexOf s "*/" (int (+ i 2)))] (if (neg? e) n (+ e 2)))
      :else                  nil)))

(defn- top-level-keywords
  "`[[index word] ...]` of the depth-0 keywords of `s` that are in `words` (a set of lower-case words), in order.
  Skips string literals, quoted identifiers, `[...]` identifiers, backticks and comments."
  [^String s words]
  (let [n (count s)]
    (loop [i 0, depth 0, acc []]
      (if (>= i n)
        acc
        (let [c (.charAt s i)]
          (cond
            (skip-comment s i)    (recur (long (skip-comment s i)) depth acc)
            (= c \')              (recur (skip-quoted s i \') depth acc)
            (= c \")              (recur (skip-quoted s i \") depth acc)
            (= c \`)              (recur (skip-quoted s i \`) depth acc)
            (= c \[)              (recur (skip-quoted s i \]) depth acc)
            (= c \()              (recur (inc i) (inc depth) acc)
            (= c \))              (recur (inc i) (max 0 (dec depth)) acc)
            (and (zero? depth)
                 (word-char? c)
                 (or (zero? i) (not (word-char? (.charAt s (dec i))))))
            (let [e    (loop [j i] (if (and (< j n) (word-char? (.charAt s j))) (recur (inc j)) j))
                  word (str/lower-case (subs s i e))]
              (recur (long e) depth (if (contains? words word) (conj acc [i word]) acc)))
            :else                 (recur (inc i) depth acc)))))))

;;; ---------------------------------------------------- Parsing ----------------------------------------------------

(defn- bad-clause [msg sql]
  (throw (ex-info (str "Invalid RERANK clause: " msg)
                  {:type ::bad-clause :sql sql})))

(def ^:private clause-re
  ;; RERANK BASED ON VIBES [(expr)] [ASC|DESC] [LIMIT ... [OFFSET ...]] [;]
  #"(?is)^\s*rerank\s+based\s+on\s+vibes\b(.*)$")

(defn- split-prompt-expr
  "If `rest` starts with a parenthesised expression, `[expr remainder]`; else `[nil rest]`."
  [^String rest]
  (let [t (str/triml rest)]
    (if-not (str/starts-with? t "(")
      [nil t]
      (let [n     (count t)
            close (loop [i 1, depth 1]
                    (when (< i n)
                      (let [c (.charAt t i)]
                        (cond
                          (= c \') (recur (skip-quoted t i \') depth)
                          (= c \") (recur (skip-quoted t i \") depth)
                          (= c \() (recur (inc i) (inc depth))
                          (= c \)) (if (= depth 1) i (recur (inc i) (dec depth)))
                          :else    (recur (inc i) depth)))))]
        (when-not close
          (bad-clause "unbalanced parentheses in the prompt expression" rest))
        [(str/trim (subs t 1 close)) (subs t (inc close))]))))

(def ^:private tail-re
  #"(?is)^\s*(asc|desc)?\s*(limit\s+.+?)?\s*;?\s*$")

(defn parse-rerank
  "Parse `sql` into `{:select :prompt-expr :direction :limit}` when it ends in a `RERANK BASED ON VIBES` clause, or
  nil when it carries none. `:select` is the statement without the clause (and without a trailing `;`),
  `:prompt-expr` the SQL text of the prompt (`(SELECT prompt FROM user_prompt)` for bare `VIBES`), `:direction`
  `\"DESC\"` (default) or `\"ASC\"`, `:limit` the `LIMIT ...` text or nil. Throws on a malformed clause."
  [^String sql]
  (when (candidate? sql)
    (when-let [[i _] (first (top-level-keywords sql #{"rerank"}))]
      (let [select (str/trim (subs sql 0 i))
            clause (subs sql i)
            [_ rest] (or (re-matches clause-re clause)
                         (bad-clause "expected RERANK BASED ON VIBES" sql))
            [expr tail] (split-prompt-expr rest)
            [_ dir limit] (or (re-matches tail-re tail)
                              (bad-clause (str "unexpected text after VIBES: " (str/trim tail)) sql))]
        (when (str/blank? select)
          (bad-clause "nothing to rerank before RERANK" sql))
        (when (and expr (str/blank? expr))
          (bad-clause "empty prompt expression" sql))
        {:select      select
         :prompt-expr (or expr "(SELECT prompt FROM user_prompt)")
         :direction   (if dir (str/upper-case dir) "DESC")
         :limit       (some-> limit str/trim)}))))

(defn split-with-clause
  "Split a select into `[cte-list body]`: the text of its `WITH` list (nil when there is none, without the `WITH`
  keyword) and the statement it prefixes."
  [^String select]
  (let [kws (top-level-keywords select #{"with" "select" "values"})]
    (if (and (seq kws)
             (= "with" (second (first kws)))
             (zero? (count (str/trim (subs select 0 (ffirst kws))))))
      (if-let [[j _] (second kws)]
        (let [[i _] (first kws)
              ctes  (str/trim (subs select (+ i 4) j))
              ctes  (if (str/starts-with? (str/lower-case ctes) "recursive")
                      (str/trim (subs ctes 9))
                      ctes)]
          [ctes (subs select j)])
        (throw (ex-info "WITH clause without a following SELECT" {:type ::bad-clause :sql select})))
      [nil select])))

;;; ---------------------------------------------------- Rewrite ----------------------------------------------------

(defn quote-identifier
  "`\"name\"`, with embedded double quotes doubled."
  [^String label]
  (str \" (str/replace label "\"" "\"\"") \"))

(defn- sql-string-literal
  "`'text'`, with embedded single quotes doubled."
  [^String s]
  (str \' (str/replace s "'" "''") \'))

(defn- roster-object [labels]
  (str "json_object("
       (str/join ", " (map #(str (sql-string-literal %) ", " (quote-identifier %)) labels))
       ")"))

(defn rewrite-rerank
  "Rewrite `sql` if it ends in a `RERANK BASED ON VIBES` clause, else return nil. `column-names-fn` is called with
  the select (the statement minus the clause) and must return its output column labels in order, e.g. via
  `PreparedStatement.getMetaData()`. Throws on a malformed clause or when the select has no columns."
  [sql column-names-fn]
  (when-let [{:keys [select prompt-expr direction limit]} (parse-rerank sql)]
    (let [labels (vec (column-names-fn select))
          _      (when (empty? labels)
                   (throw (ex-info "RERANK: the select has no output columns" {:type ::bad-clause :sql sql})))
          [ctes body] (split-with-clause select)
          quoted (map quote-identifier labels)]
      (str "WITH " (when ctes (str ctes ",\n     "))
           "__vibes_cand AS MATERIALIZED (SELECT row_number() OVER () AS __vibes_id, * FROM (" body ")),\n"
           "     __vibes_roster AS MATERIALIZED (SELECT json_group_object(__vibes_id, " (roster-object labels)
           ") AS j FROM __vibes_cand)\n"
           "SELECT " (str/join ", " quoted) "\n"
           "FROM __vibes_cand, __vibes_roster\n"
           "ORDER BY vibes(" prompt-expr ", __vibes_id, __vibes_roster.j) " direction ", __vibes_id ASC"
           (when limit (str "\n" limit))))))
