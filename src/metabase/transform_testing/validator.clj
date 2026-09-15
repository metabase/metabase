(ns metabase.transform-testing.validator
  "Pure validation: is a transform test complete against the transform it tests?

  Every table the transform reads must have a declared input, else running it would leave that
  table pointing at the REAL table (via `replace-names` `:allow-unused?`) — a false-green that
  reads production data into a passing test. Comprehensive-or-error, per the Slack thread; a
  future `don't-replace` marker for stable dimensions is out of scope.

  Pure and HTTP-agnostic: reports *what* is missing as data; the runner decides that missing
  inputs are a 400. The runner passes in the transform's referenced tables (parsed from its
  compiled query) and the transform test's declared inputs; this compares them, driver-aware for schema
  defaulting. No I/O."
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
