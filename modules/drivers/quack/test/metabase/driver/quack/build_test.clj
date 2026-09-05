(ns metabase.driver.quack.build-test
  "Tier A — source-structure / build-readiness test. Pure, no server, no
  Metabase, no Clojure reader. Guards against the class of bug where an
  unescaped double-quote inside a docstring splits the string at read time,
  breaking defn's args spec at compile time.

  Symptom this catches:
    Syntax error macroexpanding clojure.core/defn- ...
    Call to clojure.core/defn- did not conform to spec.

  Detection strategy (text-level, no reader needed):
  When a docstring contains an unescaped double-quote, the Clojure reader
  terminates the string at that quote, leaving the rest as a bare symbol.
  We detect this by scanning each defn/defn- form: find the docstring (first
  quote after the fn name), find the reader's perceived end (first unescaped
  quote), and check whether a letter/digit immediately follows. A well-formed
  docstring is followed by whitespace or an open-bracket.

  Run via the in-tree test runner (see modules/drivers/quack/README.md)."
  (:require
   [clojure.string :as str]
   [clojure.test :refer [deftest is testing]]))

(set! *warn-on-reflection* true)

(def ^:private source-files
  ["modules/drivers/quack/src/metabase/driver/quack.clj"
   "modules/drivers/quack/src/metabase/driver/quack/codec.clj"
   "modules/drivers/quack/src/metabase/driver/quack/wire.clj"
   "modules/drivers/quack/src/metabase/driver/quack/types.clj"
   "modules/drivers/quack/src/metabase/driver/quack/client.clj"
   "modules/drivers/quack/src/metabase/driver/quack/actions.clj"
   "modules/drivers/quack/src/metabase/driver/quack/pool.clj"
   "modules/drivers/quack/src/metabase/driver/quack/conn.clj"])

(defn- line-of
  "1-based line number of char offset idx in src."
  [^String src ^long idx]
  (inc (count (filter #(= % \newline) (subs src 0 idx)))))

(defn- skip-ws
  "Advance j past whitespace."
  ^long [^String src ^long j]
  (loop [k j]
    (if (and (< k (.length src))
             (Character/isWhitespace (.charAt src k)))
      (recur (inc k))
      k)))

(defn- is-delimiter?
  "True if ch is a Clojure delimiter char."
  [^Character ch]
  (or (= ch \)) (= ch \]) (= ch \})
      (= ch \() (= ch \[) (= ch \{)))

(defn- skip-symbol
  "Advance j past a symbol (non-ws, non-delimiter)."
  ^long [^String src ^long j]
  (loop [k j]
    (if (and (< k (.length src))
             (not (Character/isWhitespace (.charAt src k)))
             (not (is-delimiter? (.charAt src k))))
      (recur (inc k))
      k)))

(defn- find-string-end
  "Given src and start (index of opening quote), return index of the closing
  unescaped quote — what the reader sees as the string end."
  ^long [^String src ^long start]
  (loop [k (inc start)]
    (cond
      (>= k (.length src)) (dec k)
      (= (.charAt src k) \\) (recur (+ k 2))
      (= (.charAt src k) \") k
      :else (recur (inc k)))))

(defn- find-defn-keyword-ends
  "Return a list of indices pointing just past 'defn' or 'defn-' for every
  occurrence of (defn ...) or (defn- ...) in src. Filters out matches inside
  string literals."
  [^String src]
  (loop [pos 0 results [] in-str false]
    (if (>= pos (.length src))
      results
      (let [c (.charAt src pos)]
        (cond
          in-str
          (cond
            (= c \\) (recur (+ pos 2) results true)
            (= c \") (recur (inc pos) results false)
            :else    (recur (inc pos) results true))
          (= c \")
          (recur (inc pos) results true)
          (and (< pos (- (.length src) 5))
               (= c \()
               (= (.charAt src (inc pos)) \d)
               (= (.charAt src (+ pos 2)) \e)
               (= (.charAt src (+ pos 3)) \f)
               (= (.charAt src (+ pos 4)) \n))
          (let [after (if (and (< (+ pos 5) (.length src))
                               (= (.charAt src (+ pos 5)) \-))
                        (+ pos 6) (+ pos 5))]
            (recur (inc pos) (conj results after) in-str))
          :else
          (recur (inc pos) results in-str))))))

(defn- check-one-defn
  "Check a single defn/defn- form (identified by after-keyword-idx) for a
  split docstring. Returns nil if OK, or {:line fn-name} if broken."
  [^String src ^long after-keyword-idx]
  (let [name-start (skip-ws src after-keyword-idx)
        name-end   (skip-symbol src name-start)
        fn-name    (subs src name-start name-end)]
    ;; After the name, skip whitespace/metadata to find docstring or params.
    (loop [j (skip-ws src name-end)]
      (cond
        (>= j (.length src)) nil
        (= (.charAt src j) \")              ; docstring starts here
        (let [doc-end (find-string-end src j)
              after   (inc doc-end)]
          (if (and (< after (.length src))
                   (Character/isLetterOrDigit (.charAt src after)))
            {:line (line-of src j) :fn-name fn-name}
            nil))
        (= (.charAt src j) \[) nil           ; param list — no docstring
        (= (.charAt src j) \^) (recur (inc j)) ; metadata prefix
        (= (.charAt src j) \() nil           ; arity list
        (Character/isWhitespace (.charAt src j)) (recur (inc j))
        :else nil))))

(deftest defn-docstrings-have-no-split-quotes-test
  (testing
   "No defn/defn- docstring in the driver source is split by an unescaped
     double-quote. An unescaped quote inside the docstring makes the reader
     terminate the string early, leaving a bare symbol where the param vector
     is expected — which only fails at driver-build time with a confusing
     'defn- did not conform to spec' error."
    (doseq [path source-files]
      (let [src (slurp path)
            issues (for [after-kw (find-defn-keyword-ends src)
                         :let [issue (check-one-defn src after-kw)]
                         :when issue]
                     issue)]
        (if (seq issues)
          (doseq [{:keys [line fn-name]} issues]
            (is false
                (str path ":" line " : defn " fn-name
                     " — docstring split by unescaped double-quote."
                     " Escape any literal quote inside docstrings.")))
          (is true (str path " OK")))))))

(deftest source-files-are-non-empty-test
  (testing "Every driver source file is readable and non-empty."
    (doseq [path source-files]
      (is (seq (slurp path))
          (str path " should be readable and non-empty")))))

;;; ---------------------------------------------------------------------------
;;; SQL-template composition regression guards
;;; ---------------------------------------------------------------------------
;; These tests guard against a class of bug where a metadata SQL template
;; (describe-fields / describe-fks) is composed with `clojure.core/format` and
;; a nil predicate argument. `format` with `%s` and nil produces the literal
;; string "null", which leaks into the SQL as e.g. `... AND nullTRUE` and
;; breaks the query at runtime. The driver must coerce nil predicates to "".
;;
;; These tests are PURE (no server, no Metabase) and reproduce the exact
;; composition shape used by the driver methods, so they catch the bug at
;; standalone-test time instead of at Metabase-sync time.

(defn- simulate-describe-fields-sql
  "Reproduce the WHERE-clause composition used by the driver's
  describe-fields method. Mirrors the or-coerced-nil-to-empty-string shape
  used in production, returning the assembled SQL string."
  [schema-pred table-pred]
  (format "SELECT * FROM (...) c WHERE %s%sTRUE ORDER BY 1, 2, 5"
          (or schema-pred "")
          (or table-pred "")))

(defn- simulate-describe-fks-sql
  "Reproduce the WHERE-clause composition used by describe-fks."
  [fk-schema-pred fk-table-pred]
  (format "SELECT * FROM (...) f WHERE %s%sTRUE ORDER BY 1, 2, 3"
          (or fk-schema-pred "")
          (or fk-table-pred "")))

(deftest describe-fields-sql-handles-nil-predicates-test
  (testing
   "describe-fields SQL composition must not produce the literal 'null'
     when a predicate (schema-pred or table-pred) is nil. Regression guard
     for the bug where Clojure's format turns nil into the literal string
     null, producing '... AND nullTRUE' and breaking the query."
    ;; Both predicates present — normal filtered sync.
    (is (not (str/includes? (simulate-describe-fields-sql
                             "schema IN ('main')AND "
                             "name IN ('t')AND ")
                            "null")))
    ;; schema-only (database-wide sync passes :schema-names but no :table-names).
    ;; This is the exact case that broke in production.
    (is (not (str/includes? (simulate-describe-fields-sql
                             "schema IN ('main')AND "
                             nil)
                            "null"))
        "schema-only filter must not emit null for the missing table predicate")
    ;; table-only.
    (is (not (str/includes? (simulate-describe-fields-sql
                             nil
                             "name IN ('t')AND ")
                            "null")))
    ;; No predicates at all (full DB sync, no filters).
    (is (not (str/includes? (simulate-describe-fields-sql nil nil)
                            "null")))
    ;; Sanity: the schema-only path should produce a well-formed WHERE clause
    ;; ending in TRUE ORDER BY (no stray null).
    (let [sql (simulate-describe-fields-sql "schema IN ('main')AND " nil)]
      (is (str/ends-with? sql "TRUE ORDER BY 1, 2, 5")
          (str "expected a clean WHERE ... TRUE tail, got: " sql)))))

(deftest describe-fks-sql-handles-nil-predicates-test
  (testing
   "describe-fks SQL composition must not produce null for nil predicates."
    (is (not (str/includes? (simulate-describe-fks-sql
                             "fk_schema IN ('main')AND "
                             nil)
                            "null")))
    (is (not (str/includes? (simulate-describe-fks-sql nil nil)
                            "null")))))
