(ns metabase.app-db.snapshot-test-util.dump-util
  "What the dialects' dumps have in common: spotting the statements that create views, and folding a dump tool's
  line-oriented output back into whole statements."
  (:require
   [clojure.string :as str]))

(set! *warn-on-reflection* true)

(def ^:private create-view-pattern
  (re-pattern (str "(?is)^\\s*CREATE\\s+"
                   "(?:OR\\s+REPLACE\\s+)?"
                   ;; the clauses MySQL allows between CREATE and VIEW, in the order it allows them
                   "(?:ALGORITHM\\s*=\\s*\\w+\\s+)?"
                   "(?:DEFINER\\s*=\\s*\\S+\\s+)?"
                   "(?:SQL\\s+SECURITY\\s+\\w+\\s+)?"
                   "VIEW\\b")))

(defn creates-view?
  "Whether `sql` creates a view, including with the `ALGORITHM`, `DEFINER` and `SQL SECURITY` clauses MySQL allows."
  [sql]
  (boolean (re-find create-view-pattern sql)))

(defn split-views
  "Split `stmts` into `[others views]`, where `views` are the statements that [[creates-view?]].
  Relative order is kept within each group, since a view may read from an earlier one."
  [stmts]
  [(remove creates-view? stmts) (filter creates-view? stmts)])

(defn- literals-closed?
  "Whether `text` has no unterminated string literal.
  A doubled quote (`''`) never counts, and with `backslash-escapes?` neither does a backslashed one (`\\'`)."
  [text backslash-escapes?]
  ;; MySQL escapes with a backslash. Postgres, with standard_conforming_strings on as it is by default, treats a
  ;; backslash as an ordinary character, so a string ending in one ends in `\'`. Backslash pairs go first, so that a
  ;; literal backslash at the end of a MySQL string is not read as escaping its quote.
  (-> (cond-> text
        backslash-escapes? (-> (str/replace "\\\\" "")
                               (str/replace "\\'" "")))
      (str/replace "''" "")
      (->> (re-seq #"'") count even?)))

(defn lines->statements
  "Fold the line-oriented output of a dump tool into whole statements, without their trailing `;`.
  A statement ends on a line whose trimmed text ends in `;` and that closes every string literal it opened.
  Comments, client directives and session settings between statements are dropped.
  Pass `:backslash-escapes? true` for a dialect whose strings escape a quote with a backslash, as MySQL's do."
  [lines & {:keys [backslash-escapes?]}]
  (loop [[line & more] lines, current [], acc []]
    (cond
      (nil? line)
      (cond-> acc (seq current) (conj (str/join "\n" current)))

      ;; dump-tool noise, not schema
      (and (empty? current)
           (or (str/blank? line)
               (re-matches #"^\s*(--|/\*!|\\).*" line)
               (re-matches #"(?i)^\s*SET\s+.*" line)
               (re-matches #"(?i)^\s*SELECT pg_catalog\.set_config.*" line)))
      (recur more current acc)

      :else
      (let [current (conj current line)
            text    (str/join "\n" current)]
        (if (and (literals-closed? text backslash-escapes?) (str/ends-with? (str/trimr line) ";"))
          (recur more [] (conj acc (str/replace text #";\s*$" "")))
          (recur more current acc))))))
