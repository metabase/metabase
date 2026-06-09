(ns metabase.warehouse-index-manager.ddl-parse
  "Allowlist validator for proposed CREATE INDEX statements.

  We only ever execute statements that match exactly:

      CREATE [UNIQUE] INDEX [CONCURRENTLY] [IF NOT EXISTS]
        <index_name> ON <schema>.<table> …

  on a schema-qualified table from the caller's allow-list. Anything that
  doesn't match this canonical shape is rejected, regardless of how it got
  into the payload. False negatives are recoverable; false positives are not.

  Lifted from `metabase-enterprise.transform-optimizer.ddl.parse` on the
  `hackathon-transform-optimizer` branch. The optimizer scoped its allow-list
  to the transform's referenced tables; this module scopes to the single
  table the endpoint is for."
  (:require
   [clojure.string :as str]
   [metabase.util :as u]))

(set! *warn-on-reflection* true)

;; ---------------------------------------------------------------------------
;; Sanitisation
;;
;; Replace single-quoted strings and `-- …` line comments with spaces so a
;; semicolon hidden inside them can't be used to smuggle a second statement.
;; Block comments and dollar-quoted strings are not handled: if the LLM/user
;; uses them, the safer outcome is to reject the statement.

(defn- strip-strings-and-line-comments ^String [^String sql]
  (let [sb (StringBuilder.)
        n  (.length sql)]
    (loop [i 0
           mode :code]
      (if (>= i n)
        (.toString sb)
        (let [c  (.charAt sql i)
              c2 (when (< (inc i) n) (.charAt sql (inc i)))]
          (case mode
            :code
            (cond
              (and (= c \-) (= c2 \-))
              (recur (+ i 2) :line-comment)

              (and (= c \/) (= c2 \*))
              (do (.append sb \space) (recur (inc i) :code))

              (= c \$)
              (do (.append sb \space) (recur (inc i) :code))

              (= c \')
              (do (.append sb \space) (recur (inc i) :sstring))

              :else
              (do (.append sb c) (recur (inc i) :code)))

            :sstring
            (cond
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
  "Validate `statement` against the CREATE INDEX allowlist.

  `allowed-tables` is a set/seq of `[schema table]` pairs (case-insensitive
  match). Only indexes whose `ON <schema>.<table>` target appears in this
  set are accepted. For the index-manager endpoints this is typically a
  single-element set: the table the endpoint is scoped to.

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
             :detail (str schema* "." table* " is not in the allowed-tables set")}))
        {:ok?    false
         :reason :not-create-index
         :detail "Statement does not match: CREATE [UNIQUE] INDEX [CONCURRENTLY] [IF NOT EXISTS] <name> ON <schema>.<table> …"}))))
