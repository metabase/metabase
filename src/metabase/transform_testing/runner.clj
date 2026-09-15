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

  Everything before the connection is pure; a bad test is rejected before any temp table exists.

  The runner also owns the taxonomy of outcomes. A refusal — nothing ran, or the run could not
  finish — is a typed throw from `errors`, which the API layer turns into a status code. A failing
  expectation is not a refusal: it is a result, and it rides back on the expectation that produced
  it, so one bad expectation does not discard the answers of the others."
  (:require
   [clojure.string :as str]
   [metabase.api.common :as api]
   [metabase.driver :as driver]
   [metabase.driver.util :as driver.u]
   [metabase.sql-parsing.core :as sql-parsing]
   [metabase.transform-testing.compile :as transform-testing.compile]
   [metabase.transform-testing.db :as transform-testing.db]
   [metabase.transform-testing.errors :as transform-testing.errors]
   [metabase.transform-testing.executor :as transform-testing.executor]
   [metabase.transform-testing.expectations :as transform-testing.expectations]
   [metabase.transform-testing.schema :as transform-testing.schema]
   [metabase.transform-testing.validator :as transform-testing.validator]
   [metabase.transforms-base.util :as transforms-base.u]
   [metabase.util.i18n :refer [tru]]
   [metabase.util.malli :as mu]))

(set! *warn-on-reflection* true)

(defn- temp->logical
  "The map from each generated temp-table name to the name the author wrote, for rewriting warehouse
  error messages that can only speak in generated names."
  [transform input->temp output-table]
  (into {output-table (transform-testing.validator/table-label (:target transform))}
        (map (fn [[input temp]] [temp (transform-testing.validator/table-label (:table input))]))
        input->temp))

(defn- warehouse-said
  "What the warehouse told us about `e`, with every generated temp-table name replaced by the one
  the author wrote, or nil when it said nothing."
  [e names]
  (transform-testing.errors/remap-message (ex-message e) names))

(defn- rethrow-remapped
  "Rethrow `e` as `error-type` behind `message`, quoting the warehouse where it had something to say."
  [e error-type message names]
  (let [cause (warehouse-said e names)]
    (throw (transform-testing.errors/ex
            error-type
            (if cause (str message " " cause) message)
            {:cause cause}
            e))))

(defn- run-probes!
  "Run one expectation's probes on `conn`, returning `{probe-id rows}`."
  [driver conn probes]
  (update-vals probes
               (fn [{:keys [query params max-rows]}]
                 (transform-testing.executor/run-query driver conn [query (vec params)] max-rows))))

(defn- check-expectation
  "The result map for one expectation. An expectation whose own query fails is reported as an error
  on that expectation rather than failing the whole run."
  [driver conn context expectation names]
  (try
    (->> (transform-testing.expectations/probes expectation context)
         (run-probes! driver conn)
         (transform-testing.expectations/interpret expectation))
    (catch Exception e
      {:name   (:name expectation)
       :type   (:type expectation)
       :status :error
       :error  {:type    (or (:error-type (ex-data e))
                             ::transform-testing.errors/expectation-failed)
                :message (or (warehouse-said e names)
                             (tru "The expectation could not be run, and the database gave no reason."))}})))

(mu/defn run-transform-test! :- ::transform-testing.schema/run-result
  "Run the transform test `transform-test` against temp tables and report what each expectation found."
  [{:keys [transform_id inputs expectations]} :- ::transform-testing.schema/transform-test]
  ;; --- resolve (app-db) ---
  (let [transform (api/check-404 (transform-testing.db/transform transform_id))
        _         (when-not (transforms-base.u/query-transform? transform)
                    (throw (transform-testing.errors/ex
                            ::transform-testing.errors/unsupported-transform
                            (tru "Only query transforms can be tested.")
                            {:transform-id transform_id})))
        database  (api/check-404 (transform-testing.db/database
                                  (transforms-base.u/transform-source-database transform)))
        driver    (keyword (:engine database))
        _         (when-not (driver.u/supports? driver :transforms/testing database)
                    (throw (transform-testing.errors/ex
                            ::transform-testing.errors/unsupported-driver
                            (tru "The {0} database of this transform does not support transform testing."
                                 (name driver))
                            {:driver driver})))
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
                              (throw (transform-testing.errors/ex
                                      ::transform-testing.errors/unparseable-source
                                      (tru "The transform source SQL could not be parsed for test input validation: {0}"
                                           (or (some-> (ex-cause e) ex-message) (ex-message e)))
                                      {:transform-id transform_id}))
                              (throw e))))
        ;; --- validate (pure): the declared inputs must be exactly the tables the transform reads.
        ;;     Both directions are 400s; checks the same referenced-tables the rewrite will remap. ---
        refs      (:referenced-tables compiled-source)
        missing   (transform-testing.validator/missing-inputs driver inputs refs)
        _         (when (seq missing)
                    (throw (transform-testing.errors/ex
                            ::transform-testing.errors/missing-inputs
                            (tru "The transform reads table(s) with no declared test input: {0}. Add an input for each."
                                 (str/join ", " (map transform-testing.validator/table-label missing)))
                            {:tables (mapv transform-testing.validator/table-label missing)})))
        unused    (transform-testing.validator/unused-inputs driver inputs refs)
        _         (when (seq unused)
                    (throw (transform-testing.errors/ex
                            ::transform-testing.errors/unused-inputs
                            (tru "Test input(s) declared for table(s) the transform does not read: {0}. Remove them."
                                 (str/join ", " (map transform-testing.validator/table-label unused)))
                            {:tables (mapv transform-testing.validator/table-label unused)})))
        ;; --- compile (pure): temp names + queries over them ---
        ;; The association that matters: each input → the temp table built for it. Everything later
        ;; (seeding, replacements, cleanup, Guard B) is derived from this map, not from any ordering.
        ;; Reject two inputs that target the same TABLE (regardless of differing fixture SQL): they
        ;; would collide on one temp table, silently dropping a fixture. Check :table, not the whole
        ;; input. Order is incidental and deliberately not relied upon.
        _            (let [tables (map :table inputs)]
                       (api/check-400 (or (empty? tables) (apply distinct? tables))
                                      (tru "Duplicate test inputs; each input table may be declared only once.")))
        input->temp  (into {} (map (fn [input] [input (driver/temp-table-name driver)])) inputs)
        output-table (driver/temp-table-name driver)
        names        (temp->logical transform input->temp output-table)
        replacements (transform-testing.compile/table-replacements driver transform input->temp output-table)
        compiled-transform (transform-testing.compile/compile-transform driver compiled-source replacements)
        ;; --- validate (pure, Guard B): the rewrite left no real table behind. Every table the
        ;;     rewritten query reads must be one of our temp tables; a survivor means `replace-names`
        ;;     could not remap some reference (e.g. a shape the parser missed) and running it would
        ;;     read the real table or error. Reject before touching the warehouse. ---
        temp-tables  (conj (into #{} (vals input->temp)) output-table)
        surviving    (transform-testing.validator/surviving-references
                      (transform-testing.compile/referenced-tables driver (:query compiled-transform))
                      temp-tables
                      (transform-testing.compile/dangling-qualifiers driver (:query compiled-transform)))
        _            (api/check-400 (empty? surviving)
                                    (tru "The transform test could not fully remap the source to test tables; these reference(s) remain: {0}. Alias each source table and qualify its columns by the alias (e.g. `FROM my_table t ... t.col`), not by the table name."
                                         (str/join ", " surviving)))
        context      {:driver driver :output-table output-table :replacements replacements}]
    ;; --- execute (I/O): one connection; temp tables live and die here ---
    (driver/do-with-test-connection
     driver database
     (fn [conn]
       (try
         (doseq [[input temp] input->temp]
           (try
             (transform-testing.executor/create-temp-table!
              driver conn temp (transform-testing.compile/compile-input driver input))
             (catch Exception e
               (rethrow-remapped e ::transform-testing.errors/setup-failed
                                 (tru "Could not create the test input for {0}:"
                                      (transform-testing.validator/table-label (:table input)))
                                 names))))
         (try
           (transform-testing.executor/create-temp-table! driver conn output-table compiled-transform)
           (catch Exception e
             (rethrow-remapped e ::transform-testing.errors/transform-failed
                               (tru "The transform under test failed to run:")
                               names)))
         ;; --- check: every expectation reports, passing ones included ---
         (let [output-columns (transform-testing.executor/table-columns driver conn output-table)
               context        (assoc context :output-columns output-columns)
               results        (mapv (fn [expectation]
                                      (check-expectation driver conn context expectation names))
                                    expectations)]
           {:status       (if (every? #(= :passed (:status %)) results) :passed :failed)
            :expectations results
            :tables       names})
         (finally
           (doseq [table temp-tables]
             (transform-testing.executor/drop-temp-table! driver conn table))))))))
