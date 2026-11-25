(ns metabase-enterprise.data-testing.validator
  "May this test run? [[validate]] answers, once, for the whole test: it throws a typed refusal when the answer is no,
  and when it is yes returns the SQL a run executes for each expectation written in SQL. Pure: it parses and rewrites
  SQL, and opens no connection.

  Two guards, run against the test as a whole:

  - Guard A (pre-rewrite): every table the query under test reads must have a declared input, and every declared
    input must be read, and no two inputs may be ones a reference cannot tell apart. A read with no input would leave
    that table pointing at the REAL table (via `replace-names` `:allow-unused?`) — a false-green that reads production
    data into a passing test.
  - Guard B (post-rewrite): every table the rewritten queries read must be one of the run's temp tables. A leftover
    real table means `replace-names` did not rewrite something it should have (e.g. a reference shape the parser
    could not match), and running it would hit the real table or error at execution. This covers the query under test
    and every expectation that carries the author's own SQL.

  [[ensure-single-select]] checks each SQL statement a run executes (the query under test, each SQL input and each
  expectation's SQL) and returns the text the run executes.

  [[table-label]] is here too, and is not validation: it is the one way this module renders a table in a message."
  (:require
   [clojure.string :as str]
   [metabase-enterprise.data-testing.compile :as data-testing.compile]
   [metabase-enterprise.data-testing.errors :as data-testing.errors]
   [metabase-enterprise.data-testing.schema :as data-testing.schema]
   [metabase-enterprise.data-testing.util :as data-testing.u]
   [metabase.sql-parsing.core :as sql-parsing]
   [metabase.sql-tools.core :as sql-tools]
   [metabase.util.i18n :refer [tru]]
   [metabase.util.malli :as mu]
   [metabase.util.malli.registry :as mr]))

(set! *warn-on-reflection* true)

(mu/defn table-match? :- :boolean
  "Do the tables `ref` and `decl` name the same table? Their names must be equal, case aside. Their schemas must be
  equal, case aside, unless `ref` has no schema and `decl` is in `default-schema`; a `decl` without a schema matches
  only a `ref` without one.

  Case is ignored because the parser reports a table name as a bare string: nothing here can tell a quoted
  `\"Orders\"`, which an engine reads literally, from an unquoted `ORDERS`. The rewrite replaces both with the same
  input."
  [{ref-schema :schema ref-name :name} :- ::data-testing.schema/table
   {d-schema :schema d-name :name}     :- ::data-testing.schema/table
   default-schema                      :- [:maybe :string]]
  (and (= (data-testing.u/fold-identifier d-name) (data-testing.u/fold-identifier ref-name))
       (or (= (data-testing.u/fold-identifier d-schema) (data-testing.u/fold-identifier ref-schema))
           (and (nil? ref-schema)
                (= (data-testing.u/fold-identifier d-schema)
                   (data-testing.u/fold-identifier default-schema))))))

(mu/defn table-label :- :string
  "A human/agent-facing name for a table ref: `schema.name`, or just `name` when the schema is
  unknown. For error messages — never surface the raw `{:schema :name}` map."
  [{:keys [schema name]} :- ::data-testing.compile/output-table]
  (if schema (str schema \. name) name))

(mu/defn- missing-inputs :- [:sequential ::data-testing.schema/table]
  "The tables in `referenced-tables` with no matching declared input — reads that would fall
  through to a real table. Empty means every read is faked (the safety-critical direction)."
  [inputs            :- ::data-testing.schema/inputs
   referenced-tables :- [:set ::data-testing.schema/table]
   default-schema    :- [:maybe :string]]
  (let [declared (into #{} (map :table) inputs)]
    (into [] (remove (fn [ref] (some #(table-match? ref % default-schema) declared))) referenced-tables)))

(mu/defn- unused-inputs :- [:sequential ::data-testing.schema/table]
  "The declared inputs the query under test does not read — a fake for a table the query never touches
  (usually a stale or mistyped input). Empty means the suite declares nothing extraneous. Together
  with `missing-inputs`, this makes the declared set exactly the referenced set: every read faked,
  no fake unused."
  [inputs            :- ::data-testing.schema/inputs
   referenced-tables :- [:set ::data-testing.schema/table]
   default-schema    :- [:maybe :string]]
  (into [] (comp (map :table)
                 (remove (fn [decl] (some #(table-match? % decl default-schema) referenced-tables))))
        inputs))

(mu/defn- surviving-references :- [:sequential :string]
  "Guard B: the real-table references still in the *rewritten* query, as labels for the author.
  After the rewrite every reference should be a temp table we created; a leftover means
  `replace-names` did not remap something and running it would read the real table or error at
  execution. Two ways a reference survives, both caught here:

  - a real *table* reference (`rewritten-tables` not in `temp-tables`) — a relation the rewrite
    missed entirely;
  - a *column qualified by a table name* that is no longer a FROM alias (`dangling-qualifiers`,
    from the parser's `:missing-table-alias` errors) — e.g. `people.id` after `FROM people` was
    rewritten to a temp table, which the table-level parse does not see as a reference.

  Empty means the rewrite was total. Deduplicated, sorted, rendered as names for the 400 message."
  [rewritten-tables    :- [:set ::data-testing.schema/table]
   temp-tables         :- [:set :string]
   dangling-qualifiers :- [:set :string]]
  (->> (concat (->> rewritten-tables
                    (remove (fn [{:keys [name]}] (contains? temp-tables name)))
                    (map table-label))
               dangling-qualifiers)
       distinct
       sort
       vec))

(mu/defn- colliding-inputs :- [:sequential :string]
  "The labels of the declared `inputs` that a query cannot tell apart, and so would be replaced by one another's temp
  table.

  Two inputs collide when a reference could resolve to either: the same table declared twice, once in either case, or
  the same table declared once bare and once in the default schema. The rewrite maps each reference to one temp table,
  so a collision would silently drop one input's fixture and read the other's.

  Names are compared case-agnostically, which refuses a pair an engine could tell apart — Postgres can hold both
  `orders` and `\"Orders\"`. Refusing a test whose author can rename its way out is the better failure than running one
  whose second fixture is never read."
  [inputs         :- ::data-testing.schema/inputs
   default-schema :- [:maybe :string]]
  (let [fold-key   (fn [{:keys [schema table]}]
                     {:schema (data-testing.u/fold-identifier schema)
                      :table  (data-testing.u/fold-identifier table)})
        input-keys (fn [{{:keys [schema name]} :table}]
                     (into #{} (map fold-key) (data-testing.compile/table-keys schema name default-schema)))
        colliding  (->> (map input-keys inputs)
                        (mapcat identity)
                        frequencies
                        (keep (fn [[table-key n]] (when (< 1 n) table-key)))
                        set)]
    (into []
          (comp (filter (fn [input] (some colliding (input-keys input))))
                (map (comp table-label :table)))
          inputs)))

(mr/def ::sql-source
  "Whose SQL a refusal names: nil for the query under test, `[:input table]` for the input standing in for `table`, or
  `[:expectation name]`."
  [:maybe [:or
           [:tuple [:= :input] ::data-testing.schema/table]
           [:tuple [:= :expectation] :string]]])

(defn- sql-source-label
  "`source`, a [[::sql-source]], as a message names it."
  [[kind x :as source]]
  (case (when source kind)
    nil          (tru "the query under test")
    :input       (tru "input {0}" (table-label x))
    :expectation (tru "expectation {0}" (pr-str x))))

(mu/defn- check-rewrite
  "Throw unless every table `rewritten`, the rewritten SQL of `source`, reads is one of `temp-tables`. `source` is nil, the
  query under test, or an expectation."
  [driver      :- :keyword
   rewritten   :- :string
   temp-tables :- [:set :string]
   source      :- [:maybe [:tuple [:= :expectation] :string]]]
  (when-let [surviving (seq (surviving-references
                             (data-testing.compile/referenced-tables driver rewritten)
                             temp-tables
                             (data-testing.compile/dangling-qualifiers driver rewritten)))]
    (throw (data-testing.errors/ex
            ::data-testing.errors/unremapped-reference
            (if source
              (tru "The SQL of {0} reads table(s) this test does not stand in for: {1}. An expectation may only read the output of the query under test and its declared inputs."
                   (sql-source-label source) (str/join ", " surviving))
              (tru "The test could not fully remap the query under test to test tables; these reference(s) remain: {0}. Alias each source table and qualify its columns by the alias (e.g. `FROM my_table t ... t.col`), not by the table name."
                   (str/join ", " surviving)))
            (cond-> {:references (vec surviving)}
              source (assoc :expectation (second source)))))))

(defn- refusal-reason
  "Why the statement check refused SQL, as `reason` and `detail` from the parser, in words its author can act on."
  [reason detail]
  (case reason
    "multiple-statements"    (tru "it holds more than one statement")
    "not-a-select"           (tru "it is not a SELECT")
    "writes-or-locks"        (tru "it writes or locks, as a data-modifying CTE, SELECT ... INTO or FOR UPDATE does")
    ;; A reason nested under "rebuild-differs" comes without its detail.
    "session-function"       (if detail
                               (tru "it calls {0}, which changes the session" detail)
                               (tru "it calls a function that changes the session"))
    "sql-executing-function" (if detail
                               (tru "it calls {0}, which runs SQL text" detail)
                               (tru "it calls a function that runs SQL text"))
    "dynamic-function-call"  (tru "it calls a function by a name the check cannot read")
    "external-table"         (tru "it reads a file or a URL as a table")
    "statement-word"         (if detail
                               (tru "it holds {0}, which the database can read as the start of another statement" detail)
                               (tru "it holds a word that the database can read as the start of another statement"))
    "executable-comment"     (tru "it holds a /*! comment, whose text the database runs as SQL")
    "bare-dash-comment"      (tru "it holds -- with no space after it, which the database does not read as a comment")
    "lone-carriage-return"   (tru "it holds a carriage return with no newline after it, where the check and the database end a comment differently")
    "unicode-identifier"     (tru "it holds a U&\"...\" name, whose escapes the check cannot read")
    "backslash-quote"        (tru "it, or the SQL that Metabase rewrites it into to run, holds a backslash before a quote, which some database settings read as an escaped quote; write the backslash another way, such as chr(92) on Postgres or CHAR(92) on MySQL")
    "unparseable"            (tru "it does not parse")
    "rebuild-differs"        (if detail
                               (tru "the SQL that Metabase rewrites it into to run reads differently: {0}"
                                    (refusal-reason detail nil))
                               (tru "the SQL that Metabase rewrites it into to run does not read back as the same SQL, as when a -- comment opens the body of a CTE; write such a comment as /* ... */"))
    (tru "it holds something the check refuses")))

(defn- unsupported-form-refusal
  "The `::data-testing.errors/unsupported-sql` refusal of the SQL of `source` for the parser's `reason` and `detail`,
  or nil when `reason` names no form whose rebuild has another value."
  [reason detail source]
  (case reason
    ;; Data tests do not support these forms yet: VER-183 (Postgres numbers), VER-184 (MySQL DIV, LOG10 and !).
    "number-literal"
    (data-testing.errors/ex
     ::data-testing.errors/unsupported-sql
     (tru "The SQL of {0} holds the number {1}. Data tests do not support numbers written in hexadecimal, binary or octal, or with underscores or letters among the digits, yet."
          (sql-source-label source) detail)
     {:reason reason :detail detail})

    "div-operator"
    (data-testing.errors/ex
     ::data-testing.errors/unsupported-sql
     (tru "The SQL of {0} uses the DIV operator, which Metabase rewrites, in the SQL it runs, as a division that rounds where DIV truncates. Data tests do not support DIV yet."
          (sql-source-label source))
     {:reason reason})

    "log10-function"
    (data-testing.errors/ex
     ::data-testing.errors/unsupported-sql
     (tru "The SQL of {0} calls LOG10, which Metabase rewrites, in the SQL it runs, as LOG(10, x), whose value can differ in the last digits. Data tests do not support LOG10 yet."
          (sql-source-label source))
     {:reason reason})

    "exclamation-operator"
    (data-testing.errors/ex
     ::data-testing.errors/unsupported-sql
     (tru "The SQL of {0} uses the ! operator, which Metabase rewrites, in the SQL it runs, as NOT, which binds less tightly. Data tests do not support the ! operator yet."
          (sql-source-label source))
     {:reason reason})

    nil))

(mu/defn ensure-supported-forms :- :nil
  "Throws `::data-testing.errors/unsupported-sql` when `sql`, the SQL of `source` as its author wrote it, uses a form
  whose rebuild has another value. [[ensure-single-select]] refuses these forms too, but a table rewrite rebuilds the
  SQL it is given, so the rewrite of `sql` no longer holds them. A form in SQL that the check refuses for another
  reason first is left to [[ensure-single-select]], which reads the rewrite."
  [driver :- :keyword
   sql    :- :string
   source :- ::sql-source]
  (let [{:keys [verdict reason detail]} (sql-tools/validate-executable-stmt driver sql "read-only")]
    (when-let [refusal (when (= :disallowed verdict)
                         (unsupported-form-refusal reason detail source))]
      (throw refusal))))

(mu/defn ensure-single-select :- :string
  "Returns the SQL a run executes for `sql`: SQLGlot's rebuild of `sql` in `driver`'s dialect. `sql` must be one
  SELECT that passes the `\"read-only\"` check of [[sql-tools/validate-executable-stmt]], which refuses anything that
  writes or locks (a data-modifying CTE, `SELECT ... INTO`, `FOR UPDATE`) and checks the rebuild too.

  Throws `::data-testing.errors/not-a-single-select` when `sql` is not such a statement,
  `::data-testing.errors/unsupported-sql` when it uses a form whose rebuild has another value,
  `::data-testing.errors/unparseable-source` when it does not parse, and `::data-testing.errors/uncheckable-sql` when
  it holds a list of values too long to parse whole, or `driver` has no SQLGlot dialect. Each refusal names `source`."
  [driver :- :keyword
   sql    :- :string
   source :- ::sql-source]
  (let [{:keys [verdict error reason detail] rebuilt :sql} (sql-tools/validate-executable-stmt driver sql "read-only")]
    (case verdict
      :allowed
      rebuilt

      :disallowed
      (throw (or (unsupported-form-refusal reason detail source)
                 (data-testing.errors/ex
                  ::data-testing.errors/not-a-single-select
                  (tru "The SQL check refuses the SQL of {0}: {1}. A data test runs only a single SELECT that writes nothing and does not change the session."
                       (sql-source-label source) (refusal-reason reason detail))
                  (cond-> {}
                    reason (assoc :reason reason)
                    detail (assoc :detail detail)))))

      :unknown
      (if error
        (throw (data-testing.errors/ex
                ::data-testing.errors/unparseable-source
                (tru "The SQL of {0} could not be parsed: {1}"
                     (sql-source-label source) (sql-parsing/parse-error-message (ex-info error {})))
                {}))
        (throw (data-testing.errors/ex
                ::data-testing.errors/uncheckable-sql
                (case reason
                  "unknown-dialect" (tru "The SQL of {0} cannot be checked: the SQL check cannot read this database''s SQL."
                                         (sql-source-label source))
                  (tru "The SQL of {0} holds a list of values too long for the SQL check to parse."
                       (sql-source-label source)))
                {:reason reason}))))))

(mu/defn- check-expectation-sql :- :string
  "The SQL the run executes for the expectation named `expectation-name`, whose SQL is `sql`: `sql` reading the temp
  tables of `replacements` and `output-token`, otherwise as written. Throws unless it is one SELECT that passes
  [[ensure-single-select]] and reads only `temp-tables`. Its SQL is the author's, so SQL the parser cannot read is a refusal naming the
  expectation rather than the parser's own escape."
  [driver           :- :keyword
   expectation-name :- :string
   sql              :- :string
   replacements     :- ::data-testing.compile/table-replacements
   output-token     :- [:maybe ::data-testing.compile/output-token]
   temp-tables      :- [:set :string]]
  (ensure-supported-forms driver
                          (cond-> sql output-token (data-testing.compile/replace-output-token output-token))
                          [:expectation expectation-name])
  (try
    (let [query (data-testing.compile/replace-tables driver sql replacements output-token)]
      (ensure-single-select driver query [:expectation expectation-name])
      (check-rewrite driver query temp-tables [:expectation expectation-name])
      query)
    (catch Exception e
      (cond
        (sql-parsing/parse-error? e)
        (throw (data-testing.errors/ex
                ::data-testing.errors/unparseable-source
                (tru "The SQL of {0} could not be parsed: {1}"
                     (sql-source-label [:expectation expectation-name]) (sql-parsing/parse-error-message e))
                {:expectation expectation-name}))

        (= ::data-testing.errors/unreplaceable-reference (:error-type (ex-data e)))
        (throw (ex-info (tru "In the SQL of {0}: {1}" (sql-source-label [:expectation expectation-name]) (ex-message e))
                        (assoc (ex-data e) :expectation expectation-name)))

        :else
        (throw e)))))

(def ^:private placeholder
  "A `{{...}}` placeholder, with the name inside its braces as the group, whitespace around it excluded."
  #"\{\{\s*([^{}]*?)\s*\}\}")

(mu/defn- check-placeholders :- :nil
  "Throw unless every placeholder in the SQL of expectation `expectation-name` is `output-token`. Whitespace inside
  the braces does not matter and case does, as in [[data-testing.compile/replace-tables]]."
  [expectation-name :- :string
   sql              :- :string
   output-token     :- ::data-testing.compile/output-token]
  (let [token-name (second (re-find placeholder output-token))]
    (when-let [unknown (seq (into []
                                  (comp (remove (fn [[_ placeholder-name]] (= token-name placeholder-name)))
                                        (map first)
                                        (distinct))
                                  (re-seq placeholder sql)))]
      (throw (data-testing.errors/ex
              ::data-testing.errors/unknown-placeholder
              (tru "Expectation \"{0}\" uses placeholders a test does not know: {1}. Write {2} for the output of the query under test."
                   expectation-name (str/join ", " unknown) output-token)
              {:placeholders  (vec unknown)
               :response/keys #{:placeholders}})))))

(mr/def ::column-read
  "A column that SQL reads, with the schema and name of its table, all three spelled as Metabase's metadata spells
  them."
  [:map {:closed true}
   [:schema [:maybe :string]]
   [:name   :string]
   [:column :string]])

(mu/defn- missing-input-columns :- [:sequential [:map
                                                 [:table    ::data-testing.schema/table]
                                                 [:columns  [:sequential :string]]
                                                 [:declared [:map-of :string :string]]]]
  "For each rows input, the columns that it lacks, spelled as their table spells them; an input that lacks none is
  left out. An input lacks a column of `columns-read` when the input's table matches the column's table, as
  [[table-match?]] matches with the input's table as `ref`, and no name that the input declares has the same
  [[data-testing.u/column-key]] as the column.
  `:declared` maps a column the input lacks to the input's spelling of it, when the two differ only in case."
  [inputs         :- ::data-testing.schema/inputs
   columns-read   :- [:set ::column-read]
   default-schema :- [:maybe :string]
   ignore-case?   :- :boolean]
  (into []
        (keep (fn [{:keys [table columns format]}]
                (when (= :rows format)
                  (let [declared (into #{} (map #(data-testing.u/column-key ignore-case? (:name %))) columns)
                        missing  (into (sorted-set)
                                       ;; The input is `ref`, so an input without a schema stands for its table in the
                                       ;; default schema; Guard A has already refused one for a qualified reference.
                                       (comp (filter #(table-match? table (select-keys % [:schema :name]) default-schema))
                                             (map :column)
                                             (remove #(contains? declared (data-testing.u/column-key ignore-case? %))))
                                       columns-read)]
                    (when (seq missing)
                      {:table    table
                       :columns  (vec missing)
                       :declared (into {}
                                       (keep (fn [column]
                                               (some #(when (= (data-testing.u/fold-identifier %)
                                                               (data-testing.u/fold-identifier column))
                                                        [column %])
                                                     (map :name columns))))
                                       missing)})))))
        inputs))

(mu/defn validate :- [:map-of :string :string]
  "Refuse the test unless it is complete against the query it tests, every query it will run reads only the run's
  temp tables, and it has at least one expectation. When nothing is refused, returns, by expectation name, the SQL a
  run executes for each expectation written in SQL; otherwise throws a typed refusal from
  [[metabase-enterprise.data-testing.errors]].

  `referenced-tables` are the tables the query under test reads, parsed before any replacement; `rewritten-query`
  is that query after it; `replacements` is the map both it and the expectations are rewritten with, whose values name
  the temp tables everything may read; `output-token`, when given, is the placeholder for the output that expectation
  SQL may write; `default-schema` is the schema an unqualified reference resolves to in the database under test.

  `columns-read`, when given, are the columns of tables that the query under test reads; a rows input is refused when
  its table has a column among them that the input does not declare. `ignore-case?` says whether the database ignores
  case in column names."
  [driver :- :keyword
   {:keys [inputs expectations referenced-tables rewritten-query replacements output-token default-schema
           columns-read ignore-case?]}
   :- [:map {:closed true}
       [:inputs              ::data-testing.schema/inputs]
       [:expectations        ::data-testing.schema/expectations]
       [:referenced-tables   [:set ::data-testing.schema/table]]
       [:rewritten-query :string]
       [:replacements        ::data-testing.compile/table-replacements]
       [:output-token        {:optional true} [:maybe ::data-testing.compile/output-token]]
       [:default-schema      [:maybe :string]]
       [:columns-read        {:optional true} [:maybe [:set ::column-read]]]
       [:ignore-case?        {:optional true} :boolean]]]
  (when-let [missing (seq (missing-inputs inputs referenced-tables default-schema))]
    (throw (data-testing.errors/ex
            ::data-testing.errors/missing-inputs
            (tru "The query under test reads table(s) with no declared test input: {0}. Add an input for each."
                 (str/join ", " (map table-label missing)))
            {:tables (mapv table-label missing)
             :response/keys #{:tables}})))
  (when-let [unused (seq (unused-inputs inputs referenced-tables default-schema))]
    (throw (data-testing.errors/ex
            ::data-testing.errors/unused-inputs
            (tru "Test input(s) declared for table(s) the query under test does not read: {0}. Remove them."
                 (str/join ", " (map table-label unused)))
            {:tables (mapv table-label unused)
             :response/keys #{:tables}})))
  (when-let [colliding (seq (colliding-inputs inputs default-schema))]
    (throw (data-testing.errors/ex
            ::data-testing.errors/duplicate-input-table
            (tru "Duplicate test inputs; each input table may be declared only once: {0}"
                 (str/join ", " colliding))
            {:tables (vec colliding)
             :response/keys #{:tables}})))
  (when-let [missing (seq (missing-input-columns inputs (or columns-read #{}) default-schema
                                                 (boolean ignore-case?)))]
    (throw (data-testing.errors/ex
            ::data-testing.errors/missing-input-columns
            (tru "Test input(s) lack column(s) that the query under test reads: {0}. Declare each in the input for its table, spelled as the table spells it."
                 (str/join "; " (for [{:keys [table columns declared]} missing]
                                  (str (table-label table) ": "
                                       (str/join ", " (for [column columns]
                                                        (if-let [spelled (declared column)]
                                                          (tru "{0} (declared as {1}, which differs in case)" column spelled)
                                                          column)))))))
            {:tables        (mapv (comp table-label :table) missing)
             :columns       (into {} (map (juxt (comp table-label :table) :columns)) missing)
             :response/keys #{:tables :columns}})))
  (let [temp-tables        (into #{} (map :table) (vals replacements))
        _                  (check-rewrite driver rewritten-query temp-tables nil)
        expectation->query (into {}
                                 (keep (fn [{:keys [name sql]}]
                                         (when sql
                                           (when output-token
                                             (check-placeholders name sql output-token))
                                           [name (check-expectation-sql driver name sql replacements output-token
                                                                        temp-tables)])))
                                 expectations)]
    (when (empty? expectations)
      (throw (data-testing.errors/ex
              ::data-testing.errors/no-expectations
              (tru "The test has no expectations, so it checks nothing. Add at least one.")
              {})))
    expectation->query))
