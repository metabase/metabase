(ns metabase.transform-testing.validator
  "Pure validation: is a transform test complete against the transform it tests?

  Two guards, both pure and both reporting *what* is wrong as data (the runner decides the 400):

  - Guard A (pre-rewrite, [[missing-inputs]] / [[unused-inputs]]): every table the transform reads
    must have a declared input, else the rewrite would leave that table pointing at the REAL table
    (via `replace-names` `:allow-unused?`) — a false-green that reads production data into a passing
    test. Comprehensive-or-error, per the Slack thread.
  - Guard B (post-rewrite, [[surviving-tables]]): after the rewrite, every table reference must be
    one of the temp tables we created. A leftover real table means `replace-names` did not rewrite
    something it should have (e.g. a reference shape the parser could not match); running it would
    hit the real table or error at execution. Reject rather than run.

  No I/O; the runner passes in already-parsed table references."
  (:require
   [metabase.driver.sql.normalize :as sql.normalize]
   [metabase.transform-testing.schema :as transform-testing.schema]
   [metabase.util.malli :as mu]))

(mu/defn- table-match? :- :boolean
  "Do a query's referenced table `ref` and a declared input `decl` name the same table? Matches by
  name, with schema equal, or the reference bare (nil schema) against a declared table in the
  driver's `default-schema` — the one-directional defaulting `table-replacements` uses when it
  rewrites (a bare read resolves to the default schema; a bare declaration does not cover a
  qualified read). The single matching rule for both completeness directions."
  [driver :- :keyword
   {ref-schema :schema ref-name :name}   :- [:map [:schema [:maybe :string]] [:name :string]]
   {d-schema :schema d-name :name}       :- [:map [:schema [:maybe :string]] [:name :string]]]
  (and (= d-name ref-name)
       (or (= d-schema ref-schema)
           (and (nil? ref-schema) (= d-schema (sql.normalize/default-schema driver))))))

(mu/defn table-label :- :string
  "A human/agent-facing name for a table ref: `schema.name`, or just `name` when the schema is
  unknown. For error messages — never surface the raw `{:schema :name}` map."
  [{:keys [schema name]} :- [:map [:schema [:maybe :string]] [:name :string]]]
  (if schema (str schema \. name) name))

(mu/defn missing-inputs :- [:sequential [:map [:schema [:maybe :string]] [:name :string]]]
  "The tables in `referenced-tables` with no matching declared input — reads that would fall
  through to a real table. Empty means every read is faked (the safety-critical direction)."
  [driver            :- :keyword
   inputs            :- ::transform-testing.schema/inputs
   referenced-tables :- [:set [:map [:schema [:maybe :string]] [:name :string]]]]
  (let [declared (into #{} (map :table) inputs)]
    (into [] (remove (fn [ref] (some #(table-match? driver ref %) declared))) referenced-tables)))

(mu/defn unused-inputs :- [:sequential [:map [:schema [:maybe :string]] [:name :string]]]
  "The declared inputs the transform does not read — a fake for a table the query never touches
  (usually a stale or mistyped input). Empty means the suite declares nothing extraneous. Together
  with `missing-inputs`, this makes the declared set exactly the referenced set: every read faked,
  no fake unused."
  [driver            :- :keyword
   inputs            :- ::transform-testing.schema/inputs
   referenced-tables :- [:set [:map [:schema [:maybe :string]] [:name :string]]]]
  (into [] (comp (map :table)
                 (remove (fn [decl] (some #(table-match? driver % decl) referenced-tables))))
        inputs))

(mu/defn surviving-references :- [:sequential :string]
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
  [rewritten-tables    :- [:set [:map [:schema [:maybe :string]] [:name :string]]]
   temp-tables         :- [:set :string]
   dangling-qualifiers :- [:set :string]]
  (->> (concat (->> rewritten-tables
                    (remove (fn [{:keys [name]}] (contains? temp-tables name)))
                    (map table-label))
               dangling-qualifiers)
       distinct
       sort
       vec))
