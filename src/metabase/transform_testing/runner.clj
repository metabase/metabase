(ns metabase.transform-testing.runner
  "Orchestrates a transform test run over the module's separated concerns. The runner is the only
  namespace that resolves from the app db or owns the connection lifecycle; it hands ordinary
  arguments to each concern (no marshaled plan object) and owns the HTTP decisions.

    db           — app-db reads (transform, database)
    compile      — pure: source → SQL + referenced tables (once), then rewrites to temp tables
    validator    — pure: those referenced tables are all faked, else reject (Guard A)
    executor     — the one place warehouse I/O lives: create/drop temp tables, run read-backs
    expectations — check each expectation against the output temp table (via executor)

  Flow — compile the source once, then thread that one result so the guard and the rewrite agree:

    resolve (app-db)
      → compile-source (pure)           : the transform's SQL + the tables it reads
      → validate referenced-tables       : reject (400) any read with no declared input   [pure]
      → build temp names + replacements   : compile the inputs and rewrite the source      [pure]
      → open ONE connection (executor)    : create temp inputs + output, check, drop on exit

  Everything before the connection is pure; a bad test is rejected before any temp table exists."
  (:require
   [clojure.string :as str]
   [metabase.api.common :as api]
   [metabase.driver :as driver]
   [metabase.driver.util :as driver.u]
   [metabase.sql-parsing.core :as sql-parsing]
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
        compiled-source (try
                          (transform-testing.compile/compile-source driver transform)
                          (catch Exception e
                            (if (sql-parsing/parse-error? e)
                              ;; Surface the parser's own diagnostic (error type + Line/Col + caret) —
                              ;; it names the offending token, the one thing that lets an author fix
                              ;; their SQL. It is a syntax diagnostic about their own query: no data,
                              ;; no schema — safe to return. Prefer the cause's bare message over the
                              ;; "sqlglot call failed: " wrapper.
                              (api/check-400 false
                                             (tru "The transform source SQL could not be parsed for test input validation: {0}"
                                                  (or (some-> (ex-cause e) ex-message) (ex-message e))))
                              (throw e))))
        ;; --- validate (pure): the declared inputs must be exactly the tables the transform reads.
        ;;     Both directions are 400s; checks the same referenced-tables the rewrite will remap. ---
        refs      (:referenced-tables compiled-source)
        missing   (transform-testing.validator/missing-inputs driver inputs refs)
        _         (api/check-400 (empty? missing)
                                 (tru "The transform reads table(s) with no declared test input: {0}. Add an input for each."
                                      (str/join ", " (map transform-testing.validator/table-label missing))))
        unused    (transform-testing.validator/unused-inputs driver inputs refs)
        _         (api/check-400 (empty? unused)
                                 (tru "Test input(s) declared for table(s) the transform does not read: {0}. Remove them."
                                      (str/join ", " (map transform-testing.validator/table-label unused))))
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
