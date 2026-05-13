(ns metabase-enterprise.transform-optimizer.ddl.parse
  "Allowlist validator for proposed DDL statements.

  Per PLAN.md → Phase 5: anything the LLM emits in `ddl_statements[].statement`
  must be exactly one `CREATE [UNIQUE] INDEX [CONCURRENTLY] [IF NOT EXISTS]`
  on a schema-qualified table that appeared in the optimizer's context. This
  is the primary defence against prompt-injection coercing the LLM into
  emitting destructive statements: we reject *anything* that doesn't match
  the canonical CREATE-INDEX shape, regardless of how it got into the payload.

  Intentionally strict. False negatives (we reject a benign statement) are
  recoverable — the user can copy the statement manually. False positives
  (we accept a destructive statement) are not."
  (:require
   [clojure.string :as str]
   [metabase.util :as u]))

(set! *warn-on-reflection* true)

;; ---------------------------------------------------------------------------
;; Sanitisation
;;
;; Replace single-quoted strings and `-- …` line comments with spaces so a
;; semicolon hidden inside them can't be used to smuggle a second statement.
;; We intentionally do NOT handle block comments or dollar-quoted strings:
;; if the LLM uses them, the safer outcome is to reject the statement.

(defn- strip-strings-and-line-comments ^String [^String sql]
  (let [sb  (StringBuilder.)
        n   (.length sql)]
    (loop [i 0
           mode :code]
      (if (>= i n)
        (.toString sb)
        (let [c (.charAt sql i)
              c2 (when (< (inc i) n) (.charAt sql (inc i)))]
          (case mode
            :code
            (cond
              (and (= c \-) (= c2 \-))
              (recur (+ i 2) :line-comment)

              (and (= c \/) (= c2 \*))
              ;; Block comment encountered — bail by leaving the rest opaque.
              ;; The forbidden-keyword check + regex match against the
              ;; remaining text will almost certainly fail; that's fine.
              (do (.append sb \space) (recur (inc i) :code))

              (= c \$)
              ;; Dollar-quoted string — same treatment: don't try to skip,
              ;; just refuse to parse beyond it.
              (do (.append sb \space) (recur (inc i) :code))

              (= c \')
              (do (.append sb \space) (recur (inc i) :sstring))

              :else
              (do (.append sb c) (recur (inc i) :code)))

            :sstring
            (cond
              ;; '' escape inside a single-quoted string
              (and (= c \') (= c2 \'))
              (do (.append sb \space) (.append sb \space) (recur (+ i 2) :sstring))

              (= c \')
              (do (.append sb \space) (recur (inc i) :code))

              :else
              (do (.append sb \space) (recur (inc i) :sstring)))

            :line-comment
            (if (= c \newline)
              (do (.append sb \newline) (recur (inc i) :code))
              (do (.append sb \space) (recur (inc i) :line-comment)))))))))

;; ---------------------------------------------------------------------------
;; Forbidden tokens
;;
;; After sanitisation, scan for whole-word tokens that would never appear in
;; a benign CREATE INDEX. The presence of any one fails the validator.

(def ^:private forbidden-keywords
  ["DROP" "ALTER" "GRANT" "REVOKE" "TRUNCATE" "DELETE" "UPDATE" "INSERT"
   "COPY" "VACUUM" "REINDEX" "CLUSTER" "REFRESH" "CALL" "DO" "PERFORM"
   "EXECUTE" "SET" "RESET" "LISTEN" "NOTIFY" "LOCK"])

(def ^:private forbidden-keywords-re
  (re-pattern (str "(?i)\\b(?:" (str/join "|" forbidden-keywords) ")\\b")))

(defn- forbidden-keyword [^String sanitised]
  (some-> (re-find forbidden-keywords-re sanitised) u/upper-case-en))

;; ---------------------------------------------------------------------------
;; CREATE INDEX shape
;;
;; Less ambitious than a real SQL parse: recover the index name, schema, and
;; table, and assert the statement *starts* with the canonical CREATE INDEX
;; shape. Anything after the WHERE clause is treated as opaque; the planner
;; rejects malformed predicates at execution time.

;; An identifier is either bare (\w+) or double-quoted Postgres-style
;; ("…", with "" as the escape for an inner "). We accept either form for
;; the index name and for each side of the qualified table.
(def ^:private ident-pattern "(?:\"(?:[^\"]|\"\")+\"|\\w+)")

(def ^:private create-index-re
  (re-pattern
   (str "(?is)\\A\\s*CREATE\\s+(?:UNIQUE\\s+)?INDEX(?:\\s+CONCURRENTLY)?"
        "(?:\\s+IF\\s+NOT\\s+EXISTS)?\\s+"
        "(" ident-pattern ")\\s+ON\\s+(?:ONLY\\s+)?"
        "(" ident-pattern ")\\.(" ident-pattern ")\\s*.*\\z")))

(defn- unquote-ident
  "Strip a wrapping pair of double-quotes (and collapse the doubled-quote
  escape) from a Postgres identifier. No-op for bare identifiers."
  [s]
  (let [s (str s)]
    (if (and (> (count s) 1)
             (= \" (.charAt s 0))
             (= \" (.charAt s (dec (count s)))))
      (-> (subs s 1 (dec (count s)))
          (str/replace "\"\"" "\""))
      s)))

;; ---------------------------------------------------------------------------
;; Public API

(defn parse
  "Validate `statement` against the CREATE-INDEX allowlist.

  `allowed-tables` is a set/seq of `[schema table]` pairs (case-insensitive)
  drawn from the optimizer's context — only indexes on these tables are
  accepted.

  On success: `{:ok? true, :name <idx>, :schema <s>, :table <t>}`.
  On failure: `{:ok? false, :reason <kw>, :detail <string>}`."
  [statement allowed-tables]
  (let [sanitised  (strip-strings-and-line-comments (str statement))
        normalised (str/replace sanitised #"\s+" " ")
        parts      (->> (str/split normalised #";")
                        (map str/trim)
                        (remove str/blank?))
        bad-kw     (forbidden-keyword sanitised)]
    (cond
      bad-kw
      {:ok? false :reason :forbidden-keyword
       :detail (str "Statement contains forbidden keyword: " bad-kw)}

      (not= 1 (count parts))
      {:ok? false :reason :multi-statement
       :detail (format "%d statements found; only one CREATE INDEX is allowed" (count parts))}

      :else
      (if-let [[_ idx-name schema table] (re-matches create-index-re (first parts))]
        (let [idx-name*  (unquote-ident idx-name)
              schema*    (unquote-ident schema)
              table*     (unquote-ident table)
              allowed-lc (into #{}
                               (map (fn [[s t]]
                                      [(some-> s u/lower-case-en)
                                       (some-> t u/lower-case-en)]))
                               allowed-tables)]
          (if (contains? allowed-lc [(u/lower-case-en schema*) (u/lower-case-en table*)])
            {:ok? true :name idx-name* :schema schema* :table table*}
            {:ok?    false
             :reason :unknown-table
             :detail (str schema* "." table* " is not in the referenced-tables set")}))
        {:ok?    false
         :reason :not-create-index
         :detail "Statement does not match: CREATE [UNIQUE] INDEX [CONCURRENTLY] [IF NOT EXISTS] <name> ON <schema>.<table> …"}))))
