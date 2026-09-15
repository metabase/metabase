(ns metabase.transform-testing.validator
  "Pure validation: is a test suite complete against the transform it tests?

  Every table the transform reads must have a declared input, or the run is rejected. Without this,
  `replace-names` (with `:allow-unused? true`) silently leaves an undeclared table pointing at the
  REAL table — a false-green that reads production data into a passing test. Comprehensive-or-error,
  per the Slack thread; a future `don't-replace` marker for stable dimensions is out of scope.

  Pure: the runner passes in the transform's referenced tables (parsed from its compiled query)
  and the suite's declared inputs; this compares them, driver-aware for schema defaulting. No I/O."
  (:require
   [metabase.driver.sql.normalize :as sql.normalize]
   [metabase.transform-testing.schema :as transform-testing.schema]
   [metabase.util.i18n :refer [tru]]
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

(mu/defn check-inputs-complete!
  "Throw a 400 unless every table in `referenced-tables` is covered by a declared input in `inputs`.
  `::unused-input` (a declared input the transform does not read) is a warning concern handled
  elsewhere; this only enforces coverage — the safety-critical direction."
  [driver            :- :keyword
   inputs            :- ::transform-testing.schema/inputs
   referenced-tables :- [:set [:map [:schema [:maybe :string]] [:name :string]]]]
  (let [declared (into #{} (map :table) inputs)
        missing  (remove #(covered? driver declared %) referenced-tables)]
    (when (seq missing)
      (throw (ex-info (tru "The transform reads table(s) with no declared test input: {0}"
                           (pr-str (vec missing)))
                      {:status-code 400 :missing (vec missing)})))))
