(ns metabase.transform-testing.runner
  "Orchestrates a test-suite run over the module's separated concerns:

    db          — app-db reads (transform, database)
    validator   — pure: every read table has a declared input (else reject)
    compile     — pure: inputs and the transform become queries over temp tables
    executor    — the one place warehouse I/O lives: create/drop temp tables, run read-backs
    expectations— pure-ish: check each expectation against the output temp table

  The runner owns resolution and the connection lifecycle; it hands ordinary arguments to each
  concern (no marshaled plan object). Warehouse contact is confined to `executor` calls inside the
  single test connection; app-db contact to `db`."
  (:require
   [metabase.api.common :as api]
   [metabase.driver :as driver]
   [metabase.driver.util :as driver.u]
   [metabase.sql-tools.core :as sql-tools]
   [metabase.transform-testing.compile :as transform-testing.compile]
   [metabase.transform-testing.db :as transform-testing.db]
   [metabase.transform-testing.executor :as transform-testing.executor]
   [metabase.transform-testing.expectations :as transform-testing.expectations]
   [metabase.transform-testing.schema :as transform-testing.schema]
   [metabase.transform-testing.validator :as transform-testing.validator]
   [metabase.transforms-base.util :as transforms-base.u]
   [metabase.util.i18n :refer [tru]]
   [metabase.util.malli :as mu]))

(mu/defn- referenced-tables :- [:set [:map [:schema [:maybe :string]] [:name :string]]]
  "The tables the transform reads, from a pure parse of its compiled source query. Used both to
  validate input completeness and (by the compiler) to build the temp-table replacements — the
  reliable oracle where `table-dependencies` resolution can return empty."
  [driver    :- :keyword
   transform :- :map]
  (let [{:keys [query]} (transforms-base.u/compile-source transform nil)]
    (into #{}
          (map (fn [{:keys [schema table]}] {:schema schema :name table}))
          (sql-tools/referenced-tables-raw driver query))))

(mu/defn run-test-suite! :- ::transform-testing.schema/run-result
  "Run the test suite `suite` against temp tables and return whether all expectations passed."
  [{:keys [transform_id inputs expectations]} :- ::transform-testing.schema/transform-test-suite]
  ;; --- resolve (app-db) ---
  (let [transform (api/check-404 (transform-testing.db/transform transform_id))
        _         (api/check-400 (transforms-base.u/query-transform? transform)
                                 (tru "Only query transforms can be tested."))
        database  (api/check-404 (transform-testing.db/database
                                  (transforms-base.u/transform-source-database transform)))
        driver    (keyword (:engine database))
        _         (api/check-400 (driver.u/supports? driver :transforms/testing database)
                                 (tru "The database of this transform does not support transform testing."))
        ;; --- validate (pure): every read table is faked; runner turns a gap into a 400 ---
        missing   (transform-testing.validator/missing-inputs
                   driver inputs (referenced-tables driver transform))
        _         (api/check-400 (empty? missing)
                                 (tru "The transform reads table(s) with no declared test input: {0}"
                                      (pr-str missing)))
        ;; --- compile (pure): temp names + queries over them ---
        input-tables (mapv (fn [_] (driver/temp-table-name driver)) inputs)
        output-table (driver/temp-table-name driver)
        replacements (transform-testing.compile/table-replacements driver transform inputs input-tables output-table)]
    ;; --- execute (I/O): one connection; temp tables live and die here ---
    (driver/do-with-test-connection
     driver database
     (fn [conn]
       (try
         (doseq [[table input] (map vector input-tables inputs)]
           (transform-testing.executor/create-temp-table!
            driver conn table (transform-testing.compile/compile-input driver input)))
         (transform-testing.executor/create-temp-table!
          driver conn output-table (transform-testing.compile/compile-transform driver transform replacements))
         ;; --- check (pure-ish): expectations against the output temp table ---
         (let [context  {:driver driver :conn conn :output-table output-table :replacements replacements}
               statuses (mapv #(transform-testing.expectations/check-expectation context %) expectations)]
           {:status (if (every? #{:passed} statuses) :passed :failed)})
         (finally
           (doseq [table (conj input-tables output-table)]
             (transform-testing.executor/drop-temp-table! driver conn table))))))))
