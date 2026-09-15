(ns metabase.transform-testing.runner
  "Orchestrates a transform test run over the module's separated concerns:

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
   [metabase.transform-testing.compile :as transform-testing.compile]
   [metabase.transform-testing.db :as transform-testing.db]
   [metabase.transform-testing.executor :as transform-testing.executor]
   [metabase.transform-testing.expectations :as transform-testing.expectations]
   [metabase.transform-testing.schema :as transform-testing.schema]
   [metabase.transform-testing.validator :as transform-testing.validator]
   [metabase.transforms-base.util :as transforms-base.u]
   [metabase.util.i18n :refer [tru]]
   [metabase.util.malli :as mu]))

(mu/defn run-transform-test! :- ::transform-testing.schema/run-result
  "Run the transform test `transform-test` against temp tables and return whether all expectations passed."
  [{:keys [transform_id inputs expectations]} :- ::transform-testing.schema/transform-test]
  ;; --- resolve (app-db) ---
  (let [transform (api/check-404 (transform-testing.db/transform transform_id))
        _         (api/check-400 (transforms-base.u/query-transform? transform)
                                 (tru "Only query transforms can be tested."))
        database  (api/check-404 (transform-testing.db/database
                                  (transforms-base.u/transform-source-database transform)))
        driver    (keyword (:engine database))
        _         (api/check-400 (driver.u/supports? driver :transforms/testing database)
                                 (tru "The database of this transform does not support transform testing."))
        ;; --- compile source once (pure): SQL + the tables it reads, before any replacement ---
        compiled-source (transform-testing.compile/compile-source driver transform)
        ;; --- validate (pure): every read table is faked; runner turns a gap into a 400.
        ;;     Checks the same referenced-tables the replacement below will remap. ---
        missing   (transform-testing.validator/missing-inputs
                   driver inputs (:referenced-tables compiled-source))
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
          driver conn output-table (transform-testing.compile/compile-transform driver compiled-source replacements))
         ;; --- check (pure-ish): expectations against the output temp table ---
         (let [context  {:driver driver :conn conn :output-table output-table :replacements replacements}
               statuses (mapv #(transform-testing.expectations/check-expectation context %) expectations)]
           {:status (if (every? #{:passed} statuses) :passed :failed)})
         (finally
           (doseq [table (conj input-tables output-table)]
             (transform-testing.executor/drop-temp-table! driver conn table))))))))
