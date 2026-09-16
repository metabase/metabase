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
   [metabase.transform-testing.compile :as transform-testing.compile]
   [metabase.transform-testing.errors :as transform-testing.errors]
   [metabase.transform-testing.schema :as transform-testing.schema]
   [metabase.util.i18n :refer [tru]]
   [metabase.util.malli :as mu]))

(set! *warn-on-reflection* true)

(defn- same-name?
  "Do `a` and `b` name the same thing? Case-agnostic, the rule the rewrite matches by."
  [^String a ^String b]
  (boolean (or (= a b)
               (and a b (.equalsIgnoreCase a b)))))

(mu/defn- table-match? :- :boolean
  "Do a query's referenced table `ref` and a declared input `decl` name the same table? Matches by name, with schema
  equal, or the reference bare (nil schema) against a declared table in `default-schema` — the one-directional
  defaulting `table-replacements` uses when it rewrites (a bare read resolves to the default schema; a bare
  declaration does not cover a qualified read). Case-agnostic, and the single matching rule for both completeness
  directions."
  [{ref-schema :schema ref-name :name} :- ::transform-testing.schema/table
   {d-schema :schema d-name :name}     :- ::transform-testing.schema/table
   default-schema                      :- [:maybe :string]]
  (and (same-name? d-name ref-name)
       (or (same-name? d-schema ref-schema)
           (and (nil? ref-schema) (same-name? d-schema default-schema)))))

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

  Two inputs collide when a reference could resolve to either: the same table declared twice, or the same table
  declared once bare and once in the driver's default schema. The rewrite maps each reference to one temp table, so a
  collision would silently drop one input's fixture and read the other's."
  [inputs         :- ::transform-testing.schema/inputs
   default-schema :- [:maybe :string]]
  (let [input-keys (fn [{{:keys [schema name]} :table}]
                     (set (transform-testing.compile/table-keys schema name default-schema)))
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
      (check-rewrite driver (transform-testing.compile/replace-tables driver sql replacements) temp-tables name)))
  nil)
