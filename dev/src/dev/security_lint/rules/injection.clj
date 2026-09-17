(ns dev.security-lint.rules.injection
  "Untrusted data spliced into a command, query or path.

  None of these rules have dataflow analysis behind them -- clj-kondo doesn't do taint tracking -- so they match on
  shape: a string built at runtime from something that isn't a literal, in a position where the resulting string is
  parsed as code. That is a heuristic, and `:precision` says so."
  (:require
   [clojure.string :as str]
   [dev.security-lint.ast :as ast]
   [dev.security-lint.rule :refer [defrule]]
   [dev.security-lint.taint :as taint]
   [dev.security-lint.vocabulary :as vocab]
   [rewrite-clj.node :as n]))

(set! *warn-on-reflection* true)

(defrule command-injection
  {:name        "Command built from dynamic input"
   :enabled     false
   :description (str "A shell command is assembled from a value that isn't known statically. If any part of it "
                     "reaches user input, the shell will happily interpret metacharacters in it.")
   :remediation (str "Pass each argument as its own element -- (sh \"ls\" dir) rather than "
                     "(sh \"bash\" \"-c\" (str \"ls \" dir)) -- so no shell parsing happens, and validate a "
                     "caller's value against an allow-list before it becomes an argument at all.")
   :severity    :error
   :precision   :high
   :cwe         "CWE-78"
   :triggers    #{clojure.java.shell/sh
                  babashka.process/sh
                  babashka.process/shell
                  babashka.process/process}
   :constructor-triggers #{ProcessBuilder}}
  [{:keys [node] :as ctx}]
  ;; Taint alone decides, as in `sql-injection`. `(sh "bash" "-c" cmd)` with a request value as `cmd` needs no
  ;; interpolation to be injection, and a value as its own argument -- `(sh "ls" dir)` -- is still the caller's
  ;; argument to the program: a flag, a path. The values after a keyword option -- `:in`, `:dir`, `:env` -- are
  ;; the process's input and environment, not its command line.
  (let [positional (loop [[a & more] (ast/args node), out []]
                     (cond
                       (nil? a)                              out
                       (ast/keyword-node? (ast/unmeta a))    (recur (next more) out)
                       :else                                 (recur more (conj out a))))]
    (when-let [tainted (first (filter #(taint/tainted? ctx %) positional))]
      {:message (str "Command line carries a caller-supplied value: " (ast/->str tainted))})))

(def ^:private branching
  "Forms whose value is one of their children's, looked through for the SQL vector's text."
  '#{if if-not when when-not cond do let let* if-let when-let})

(def ^:private query-last
  "Toucan's raw query functions take the query last: `(t2/query sql)`, `(t2/query conn sql)`, `(t2/query conn
  :model/X sql)`."
  '#{toucan2.core/query toucan2.core/query-one toucan2.core/reducible-query})

(def ^:private flag-then-commands
  "`(jdbc/db-do-commands db transaction? [...])`, `(jdbc/db-do-prepared db transaction? [...])`: an optional
  boolean before the commands, which shifts them one to the right."
  '#{clojure.java.jdbc/db-do-commands clojure.java.jdbc/db-do-prepared})

(defn- sql-arg
  "The argument of a query call that holds the SQL, or the `[sql & params]` vector: the second for the JDBC
  executors, past an optional transaction flag for clojure.java.jdbc's `db-do-*`, the last for Toucan's."
  [{:keys [site]} node]
  (let [trigger (:trigger site)
        args    (ast/args node)
        flag?   (fn [a] (let [a (some-> a ast/unmeta)] (and a (ast/literal? a) (boolean? (n/sexpr a)))))]
    (cond
      (contains? query-last trigger)                                        (last args)
      (and (contains? flag-then-commands trigger) (flag? (second args)))    (nth args 2 nil)
      :else                                                                 (second args))))

(defn- sql-positions
  "The nodes holding the SQL text for a query call.

  next.jdbc, clojure.java.jdbc and Toucan take `[sql & params]` (see [[sql-arg]] for where), so the SQL is the
  first element of it when it is written as a vector, or the first element of a vector bound to it or returned by
  a branch of it. Looking only here -- rather than anywhere in the subtree -- keeps a `(str ...)` used to build a
  *parameter* from being reported: `[\"... where s = ?\" schema]` binds `schema`, however it was derived.
  `db-do-commands` is the exception: its vector is a list of statements, and every element is SQL."
  [ctx node]
  (let [every-element? (= 'clojure.java.jdbc/db-do-commands (:trigger (:site ctx)))]
    (letfn [(texts [a seen]
              (let [a (ast/unmeta a)]
                (cond
                  (nil? a) nil
                  (ast/vector-node? a) (if every-element?
                                         (mapcat #(texts % seen) (ast/children a))
                                         (some-> (first (ast/children a)) (texts seen)))
                  ;; `(into [sql] params)`: the vector's own first element
                  (= 'into (some-> (ast/head-sym a) name symbol)) (texts (ast/arg a 0) seen)
                  (contains? branching (some-> (ast/head-sym a) name symbol))
                  (let [args (ast/args a)
                        branches (case (name (ast/head-sym a))
                                   ("if" "if-not" "if-let") (rest args)
                                   "cond" (take-nth 2 (rest args))
                                   [(last args)])]
                    (mapcat #(texts % seen) branches))
                  ;; a local bound to a vector: its first element is the text
                  (and (ast/symbol-node? a) (not (contains? seen a)))
                  (if-let [init (get (:local-inits ctx) ((juxt :row :col) (meta a)))]
                    (if (ast/vector-node? (ast/unmeta init))
                      (texts init (conj seen a))
                      [a])
                    [a])
                  :else [a])))]
      (texts (sql-arg ctx node) #{}))))

(defrule sql-injection
  {:name        "SQL built by string interpolation"
   :enabled     false
   :description (str "A query string is assembled with str/format instead of being parameterized. Any interpolated "
                     "value that reaches user input is executed as SQL.")
   :remediation "Use a parameterized query -- [\"select * from t where id = ?\" id] -- or build it with HoneySQL."
   :severity    :error
   :precision   :high
   :cwe         "CWE-89"
   ;; the snapshot-restore endpoints exist only when the test API is enabled
   :exempt-files [#"testing_api/"]
   :triggers    #{next.jdbc/execute!
                  next.jdbc/execute-one!
                  next.jdbc/execute-batch!
                  next.jdbc/plan
                  clojure.java.jdbc/query
                  clojure.java.jdbc/execute!
                  clojure.java.jdbc/db-do-commands
                  clojure.java.jdbc/db-do-prepared
                  clojure.java.jdbc/reducible-query
                  toucan2.core/query
                  toucan2.core/query-one
                  toucan2.core/reducible-query}}
  [{:keys [node] :as ctx}]
  ;; Taint alone decides. A parameterized query has a literal in this position, which is never tainted; a
  ;; `(str ...)` over a namespace constant or a quoted identifier is how DDL has to be written, and is not
  ;; tainted either. Requiring an interpolation *shape* here as well missed SQL built inside a callee --
  ;; `(jdbc/execute! db [(table-sql table)])` -- and a request value passed straight through as the SQL text,
  ;; which is the most direct injection there is.
  (when-let [sql (first (filter #(taint/tainted? ctx %) (sql-positions ctx node)))]
    {:tainted? true
     :message  (str "SQL text derives from a caller-supplied value: " (ast/->str sql))}))

(def ^:private path-sanitizers
  "Besides the quoting functions: a temp file or directory the code created is no path of the caller's, and a
  digest is hex -- `(io/file tmpdir (sha1 (str url token)))` cannot climb out of `tmpdir`."
  (into taint/default-sanitizers ['createTempFile 'createTempDirectory 'createTempDir #"^create-temp" #"^sha\d*$"
                                  #"^md5$" #"->hex$" 'hash 'digest 'sha1-hex 'sha256-hex
                                  ;; a `with-open` binding is a stream or a reader, not a path
                                  'with-open]))

(defn- stream-not-path?
  "`(slurp (:body req))`, `(io/input-stream (:tempfile upload))`: a stream or a file object read out of a request,
  not a path anyone chose."
  [node]
  (boolean (when-let [[_ k] (ast/accessor (ast/unmeta node))]
             (contains? #{:body :tempfile :stream :reader :input-stream} k))))

(defrule path-traversal
  {:name        "Filesystem path built from dynamic input"
   :enabled     false
   :description (str "A path is assembled from a value that isn't known statically. If it reaches user input, "
                     "`../` sequences in it escape the intended directory.")
   :remediation (str "Resolve the path and check it is still inside the intended root, or select from a fixed "
                     "allow-list of names.")
   ;; Under the call-graph policy a finding here is a path that crossed a boundary -- a request, or connection
   ;; details whose `*-path` entries any database editor writes -- and is always an error. The `:note` grade is
   ;; reachable only under `--taint any-local`, where every internal caller that builds a path from a parameter
   ;; fires too: a prompt to check provenance, not an assertion of a bug.
   :severity    {:tainted :error :otherwise :note}
   :precision   :medium
   :cwe         "CWE-22"
   ;; a developer's export tool, run by hand against a local checkout
   :exempt-files [#"audit_app/analytics_dev\.clj$"]
   :triggers    #{clojure.java.io/file
                  clojure.java.io/input-stream
                  clojure.java.io/output-stream
                  clojure.core/slurp
                  clojure.core/spit}}
  [{:keys [node] :as ctx}]
  ;; `(io/file root name)` with a caller-supplied `name` is traversal whether or not it was built with `str`;
  ;; the other four take the path first and content or options after it
  (let [args  (if (= "file" (some-> (ast/head-sym node) name)) (ast/args node) (take 1 (ast/args node)))
        args  (remove stream-not-path? args)]
    (when-let [tainted (first (filter #(taint/tainted? ctx % {:sanitizers path-sanitizers}) args))]
      {:tainted? (not (contains? (taint/origins ctx tainted) :local))
       :message  (str "Path derives from a caller-supplied value: " (ast/->str tainted))})))

(defrule redos
  {:name        "Regex compiled from caller-supplied input"
   :enabled     false
   :description (str "A pattern built from a request can be crafted to backtrack catastrophically, so a single "
                     "short input pins a CPU for an unbounded time.")
   :remediation (str "Match against a fixed pattern, or escape the input with `java.util.regex.Pattern/quote` when "
                     "it is meant to be a literal.")
   :severity    :error
   :precision   :medium
   :cwe         "CWE-1333"
   :tainted-arg 0
   :triggers    #{clojure.core/re-pattern}}
  [{:keys [tainted?]}]
  (when tainted?
    {:tainted? true :message "Regex pattern is compiled from a caller-supplied value"}))

(def ^:private bare-quote
  "A literal that is nothing but a quote character: the pieces of `(str \"`\" name \"`\")`."
  #"^\s*[`\"']\s*$")

(def ^:private quoted-placeholder
  "A format string that wraps a placeholder directly in quotes: `\"%s\"`, `'%s'`, `%s`."
  #"[`\"']%s[`\"']")

(def ^:private ddl-statement
  "A format string or prefix that starts a DDL statement. Identifiers in DDL cannot be bound as parameters, so
  they are interpolated -- correctly only through a quoting function."
  #"(?i)\b(create|drop|alter|rename|truncate)\s+(table|schema|index|view|database|column|sequence)\b")

(def ^:private prose
  "Words that occur in a message and not in SQL, and a sentence's final punctuation: `\"There's a value with the
  wrong type ('%s') in the '%s' column\"` quotes nothing, whatever namespace it is in."
  #"(?i)\b(there|was|were|already|wrong|found|failed|cannot|unable|invalid|please|must|should|because|expected|got)\b|\w[.!?]$")

(def ^:private sql-building-ns
  "Where identifier quoting and DDL happen. Quote characters around a `%s` in a REST namespace are prose --
  `\"Branch '%s' already exists\"` -- and reporting those buried the real ones under a hundred messages."
  #"^metabase(-enterprise)?\.(driver|app-db|search|transforms|query-processor\.(?!streaming))|\.db$|honey|sql|ddl|entity-retrieval|semantic")

(defrule hand-rolled-sql-quoting
  {:name        "Identifier quoted by string concatenation, or DDL built from a bare value"
   :enabled     false
   :description (str "Wrapping a name in quote characters with `str` does not escape the quote characters "
                     "already inside it, so a backtick in a table name closes the identifier and what follows "
                     "is a second statement. A DDL statement built with `format` from an unquoted value is the "
                     "same hole with no quotes at all. The value is usually stored data, not the request that "
                     "runs the statement.")
   :remediation (str "Quote identifiers with the driver's quoting function -- `sql.u/quote-name`, "
                     "`h2x/identifier`, `quote-identifier` -- which double the quote character inside the name.")
   :severity    {:tainted :error :otherwise :warning}
   :precision   :medium
   :cwe         "CWE-89"
   :taint-policy :any-local
   ;; migrations interpolate their own constants; the snapshot API exists only when the test API is enabled
   :exempt-files [#"app_db/custom_migrations" #"testing_api/"]
   :triggers    #{clojure.core/str clojure.core/format}}
  [{:keys [node ns] :as ctx}]
  (let [args     (ast/args node)
        literals (remove #(re-find prose %) (keep ast/string-value args))
        ;; `(str "`" (str/replace s "`" "``") "`")` has escaped the quote character; that is a sanitizer by
        ;; effect, not by name
        sanitizers (into vocab/sanitizers ['replace 'replace-first #"^escape" 'the-id 'long 'int])
        ;; `(name unit)` gets no exemption: not every clause's unit is validated before a driver sees it. An
        ;; allow-list assertion ahead of the splice clears it.
        dynamic  (filter #(taint/raw-value? ctx % {:sanitizers sanitizers}) args)
        quoting? (and (re-find sql-building-ns (str ns))
                      (or (some #(re-find bare-quote %) literals)
                          ;; `''%s''` is how i18n escapes a quote in a message, not SQL
                          (some #(and (re-find quoted-placeholder %) (not (str/includes? % "''"))) literals)))
        ddl?     (some #(re-find ddl-statement %) literals)]
    (when (and (seq dynamic) (or quoting? ddl?))
      {:tainted? (boolean (some #(taint/tainted? (assoc ctx :locals (:boundary-locals ctx)) % {:sanitizers sanitizers})
                                dynamic))
       :message  (str (if quoting? "Identifier quoted by concatenation around " "DDL interpolates an unquoted value ")
                      (str/join ", " (map ast/->str dynamic)))})))

(defrule unanchored-malli-regex
  {:name        "Malli :re schema whose pattern is not anchored"
   :enabled     false
   :description (str "Malli's `:re` validates with `re-find`, a substring match, so a pattern without `^`...`$` "
                     "accepts any string that contains a match, and the rest of the string is the caller's: a "
                     "schema meant to admit a timezone offset admits anything with an offset somewhere in it.")
   :remediation "Anchor the pattern: `#\"^...$\"`, or `\\\\A`...`\\\\z`."
   :severity    :warning
   :precision   :high
   :cwe         "CWE-20"
   :vector-triggers #{:re}}
  [{:keys [node]}]
  ;; a regex literal or a string: `[:re #"..."]` and `[:re "..."]` are both patterns to Malli
  (let [pattern (some->> (rest (ast/children node)) (map ast/unmeta)
                         (filter #(or (= :regex (n/tag %)) (ast/literal-string? %))) first)
        src     (some-> pattern n/string)
        body    (when pattern
                  (if (= :regex (n/tag pattern))
                    (subs src 2 (dec (count src)))
                    (ast/string-value pattern)))
        start?  (some->> body (re-find #"^(\^|\\A)"))
        end?    (some->> body (re-find #"(\$|\\z|\\Z)$"))]
    (when (and body (not (and start? end?)))
      {:message (str "Malli :re pattern is unanchored at the "
                     (cond (and (not start?) (not end?)) "start and the end"
                           (not start?)                  "start"
                           :else                         "end")
                     ", so re-find matches a substring: " src)})))
