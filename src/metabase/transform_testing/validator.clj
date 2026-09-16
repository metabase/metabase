(ns metabase.transform-testing.validator
  "May this transform test run? [[validate]] answers, once, for the whole test, and throws a typed refusal when the
  answer is no. Pure: it parses and rewrites SQL, and opens no connection.

  Two guards, run against the test as a whole:

  - Guard A (pre-rewrite): every table the transform reads must have a declared input, and every declared input must
    be read, and no two inputs may be ones a reference cannot tell apart. A read with no input would leave that table
    pointing at the REAL table (via `replace-names` `:allow-unused?`) — a false-green that reads production data into
    a passing test.
  - Guard B (post-rewrite): every table the rewritten queries read must be one of the run's temp tables. A leftover
    real table means `replace-names` did not rewrite something it should have (e.g. a reference shape the parser
    could not match), and running it would hit the real table or error at execution. This covers the transform and
    every expectation that carries the author's own SQL.

  [[table-label]] is here too, and is not validation: it is the one way this module renders a table in a message."
  (:require
   [clojure.string :as str]
   [metabase.sql-parsing.core :as sql-parsing]
   [metabase.transform-testing.compile :as transform-testing.compile]
   [metabase.transform-testing.errors :as transform-testing.errors]
   [metabase.transform-testing.schema :as transform-testing.schema]
   [metabase.transform-testing.util :as transform-testing.u]
   [metabase.util.i18n :refer [tru]]
   [metabase.util.malli :as mu]))

(set! *warn-on-reflection* true)

(mu/defn- table-match? :- :boolean
  "Do a query's referenced table `ref` and a declared input `decl` name the same table? Matches by name, with schema
  equal, or the reference bare (nil schema) against a declared table in `default-schema` — the one-directional
  defaulting `table-replacements` uses when it rewrites (a bare read resolves to the default schema; a bare
  declaration does not cover a qualified read).

  Names match case-agnostically. The parser reports a reference as a bare string, so nothing here can tell a quoted
  `\"Orders\"` — which an engine reads literally — from an unquoted `ORDERS`, and counting them as the same table is
  the safe direction: it can only make this guard accept, and the rewrite's own guard still refuses a reference it
  did not remap."
  [{ref-schema :schema ref-name :name} :- ::transform-testing.schema/table
   {d-schema :schema d-name :name}     :- ::transform-testing.schema/table
   default-schema                      :- [:maybe :string]]
  (and (= (transform-testing.u/fold-identifier d-name) (transform-testing.u/fold-identifier ref-name))
       (or (= (transform-testing.u/fold-identifier d-schema) (transform-testing.u/fold-identifier ref-schema))
           (and (nil? ref-schema)
                (= (transform-testing.u/fold-identifier d-schema)
                   (transform-testing.u/fold-identifier default-schema))))))

(mu/defn table-label :- :string
  "A human/agent-facing name for a table ref: `schema.name`, or just `name` when the schema is
  unknown. For error messages — never surface the raw `{:schema :name}` map."
  [{:keys [schema name]} :- ::transform-testing.schema/table]
  (if schema (str schema \. name) name))

(mu/defn- missing-inputs :- [:sequential ::transform-testing.schema/table]
  "The tables in `referenced-tables` with no matching declared input — reads that would fall
  through to a real table. Empty means every read is faked (the safety-critical direction)."
  [inputs            :- ::transform-testing.schema/inputs
   referenced-tables :- [:set ::transform-testing.schema/table]
   default-schema    :- [:maybe :string]]
  (let [declared (into #{} (map :table) inputs)]
    (into [] (remove (fn [ref] (some #(table-match? ref % default-schema) declared))) referenced-tables)))

(mu/defn- unused-inputs :- [:sequential ::transform-testing.schema/table]
  "The declared inputs the transform does not read — a fake for a table the query never touches
  (usually a stale or mistyped input). Empty means the suite declares nothing extraneous. Together
  with `missing-inputs`, this makes the declared set exactly the referenced set: every read faked,
  no fake unused."
  [inputs            :- ::transform-testing.schema/inputs
   referenced-tables :- [:set ::transform-testing.schema/table]
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
  [rewritten-tables    :- [:set ::transform-testing.schema/table]
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
  [inputs         :- ::transform-testing.schema/inputs
   default-schema :- [:maybe :string]]
  (let [fold-key   (fn [{:keys [schema table]}]
                     {:schema (transform-testing.u/fold-identifier schema)
                      :table  (transform-testing.u/fold-identifier table)})
        input-keys (fn [{{:keys [schema name]} :table}]
                     (into #{} (map fold-key) (transform-testing.compile/table-keys schema name default-schema)))
        colliding  (->> (map input-keys inputs)
                        (mapcat identity)
                        frequencies
                        (keep (fn [[table-key n]] (when (< 1 n) table-key)))
                        set)]
    (into []
          (comp (filter (fn [input] (some colliding (input-keys input))))
                (map (comp table-label :table)))
          inputs)))

(mu/defn- check-rewrite
  "Throw unless every table `rewritten` reads is one of `temp-tables`. `source` names the query for the author: nil is
  the transform under test, a string is the expectation that carries the SQL."
  [driver      :- :keyword
   rewritten   :- :string
   temp-tables :- [:set :string]
   source      :- [:maybe :string]]
  (when-let [surviving (seq (surviving-references
                             (transform-testing.compile/referenced-tables driver rewritten)
                             temp-tables
                             (transform-testing.compile/dangling-qualifiers driver rewritten)))]
    (throw (transform-testing.errors/ex
            ::transform-testing.errors/unremapped-reference
            (if source
              (tru "Expectation {0} reads table(s) this test does not stand in for: {1}. An expectation may only read the transform''s output and its declared inputs."
                   (pr-str source) (str/join ", " surviving))
              (tru "The transform test could not fully remap the source to test tables; these reference(s) remain: {0}. Alias each source table and qualify its columns by the alias (e.g. `FROM my_table t ... t.col`), not by the table name."
                   (str/join ", " surviving)))
            (cond-> {:references (vec surviving)}
              source (assoc :expectation source))))))

(mu/defn- check-expectation-sql
  "Throw unless the expectation named `expectation-name` reads only `temp-tables` once rewritten. Its SQL is the
  author's, so SQL the parser cannot read is a refusal naming the expectation rather than the parser's own escape."
  [driver           :- :keyword
   expectation-name :- :string
   sql              :- :string
   replacements     :- ::transform-testing.compile/table-replacements
   temp-tables      :- [:set :string]]
  (try
    (check-rewrite driver
                   (transform-testing.compile/replace-tables driver sql replacements)
                   temp-tables
                   expectation-name)
    (catch Exception e
      (if (sql-parsing/parse-error? e)
        (throw (transform-testing.errors/ex
                ::transform-testing.errors/unparseable-source
                (tru "Expectation {0} has SQL that could not be parsed: {1}"
                     (pr-str expectation-name) (or (some-> (ex-cause e) ex-message) (ex-message e)))
                {:expectation expectation-name}))
        (throw e)))))

(mu/defn validate :- :nil
  "Refuse the test unless it is complete against the transform it tests and every query it will run reads only the
  run's temp tables. Returns nil when there is nothing to refuse, and otherwise throws a typed refusal from
  [[metabase.transform-testing.errors]].

  `referenced-tables` are the tables the transform's source reads, parsed before any replacement; `rewritten-transform`
  is that source after it; `replacements` is the map both it and the expectations are rewritten with, whose values name
  the temp tables everything may read; `default-schema` is the schema an unqualified reference resolves to in the
  database under test."
  [driver :- :keyword
   {:keys [inputs expectations referenced-tables rewritten-transform replacements default-schema]}
   :- [:map {:closed true}
       [:inputs              ::transform-testing.schema/inputs]
       [:expectations        ::transform-testing.schema/expectations]
       [:referenced-tables   [:set ::transform-testing.schema/table]]
       [:rewritten-transform :string]
       [:replacements        ::transform-testing.compile/table-replacements]
       [:default-schema      [:maybe :string]]]]
  (when-let [missing (seq (missing-inputs inputs referenced-tables default-schema))]
    (throw (transform-testing.errors/ex
            ::transform-testing.errors/missing-inputs
            (tru "The transform reads table(s) with no declared test input: {0}. Add an input for each."
                 (str/join ", " (map table-label missing)))
            {:tables (mapv table-label missing)})))
  (when-let [unused (seq (unused-inputs inputs referenced-tables default-schema))]
    (throw (transform-testing.errors/ex
            ::transform-testing.errors/unused-inputs
            (tru "Test input(s) declared for table(s) the transform does not read: {0}. Remove them."
                 (str/join ", " (map table-label unused)))
            {:tables (mapv table-label unused)})))
  (when-let [colliding (seq (colliding-inputs inputs default-schema))]
    (throw (transform-testing.errors/ex
            ::transform-testing.errors/duplicate-input-table
            (tru "Duplicate test inputs; each input table may be declared only once: {0}"
                 (str/join ", " colliding))
            {:tables (vec colliding)})))
  (let [temp-tables (into #{} (map :table) (vals replacements))]
    (check-rewrite driver rewritten-transform temp-tables nil)
    (doseq [{:keys [name sql]} expectations
            :when              sql]
      (check-expectation-sql driver name sql replacements temp-tables)))
  nil)
