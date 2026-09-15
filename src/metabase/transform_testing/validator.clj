(ns metabase.transform-testing.validator
  "Pure validation: is a test suite complete against the transform it tests?

  Every table the transform reads must have a declared input, else running it would leave that
  table pointing at the REAL table (via `replace-names` `:allow-unused?`) — a false-green that
  reads production data into a passing test. Comprehensive-or-error, per the Slack thread; a
  future `don't-replace` marker for stable dimensions is out of scope.

  Pure and HTTP-agnostic: reports *what* is missing as data; the runner decides that missing
  inputs are a 400. The runner passes in the transform's referenced tables (parsed from its
  compiled query) and the suite's declared inputs; this compares them, driver-aware for schema
  defaulting. No I/O."
  (:require
   [metabase.driver.sql.normalize :as sql.normalize]
   [metabase.transform-testing.schema :as transform-testing.schema]
   [metabase.util.malli :as mu]))

(mu/defn- covered? :- :boolean
  "Is the referenced table `ref` satisfied by some `declared` input table? Matches by name, with
  schema equal, or the reference bare (nil schema) against a declared table in the driver's default
  schema — the same defaulting `table-replacements` uses when it rewrites."
  [driver   :- :keyword
   declared :- [:set [:map [:schema [:maybe :string]] [:name :string]]]
   {ref-schema :schema ref-name :name} :- [:map [:schema [:maybe :string]] [:name :string]]]
  (let [default-schema (sql.normalize/default-schema driver)]
    (boolean
     (some (fn [{d-schema :schema d-name :name}]
             (and (= d-name ref-name)
                  (or (= d-schema ref-schema)
                      (and (nil? ref-schema) (= d-schema default-schema)))))
           declared))))

(mu/defn missing-inputs :- [:sequential [:map [:schema [:maybe :string]] [:name :string]]]
  "The tables in `referenced-tables` with no covering declared input in `inputs` — the run's
  uncovered reads. Empty means the suite is complete. `::unused-input` (a declared input the
  transform does not read) is a separate, non-blocking concern handled elsewhere."
  [driver            :- :keyword
   inputs            :- ::transform-testing.schema/inputs
   referenced-tables :- [:set [:map [:schema [:maybe :string]] [:name :string]]]]
  (let [declared (into #{} (map :table) inputs)]
    (into [] (remove #(covered? driver declared %)) referenced-tables)))
