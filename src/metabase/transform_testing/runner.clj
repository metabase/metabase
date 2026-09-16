(ns metabase.transform-testing.runner
  "Orchestrates a transform test run over the module's separated concerns. The runner is the only
  namespace that resolves from the app db or owns the connection lifecycle; it hands ordinary
  arguments to each concern (no marshaled plan object) and owns the HTTP decisions.

    db           — app-db reads (transform, database)
    compile      — pure: source → SQL + referenced tables (once), then rewrites to temp tables
    validator    — pure: may this test run? every read faked, every rewritten query on temp tables
    executor     — the one place warehouse I/O lives: create/drop temp tables, run read-backs
    expectations — check each expectation against the output temp table (via executor)

  Flow — compile the source once, then thread that one result so the guard and the rewrite agree:

    resolve (app-db)
      → compile-source (pure)   : the transform's SQL + the tables it reads
      → name + rewrite (pure)   : a temp table per input, and the source reading them
      → validate (pure)         : reject a test that is incomplete, or whose queries would still
                                  read a real table
      → run (executor)          : one connection — create the temp tables, check, drop on exit

  Everything before the connection is pure; a bad test is rejected before any temp table exists."
  (:require
   [metabase.api.common :as api]
   [metabase.driver :as driver]
   [metabase.driver.sql.normalize :as sql.normalize]
   [metabase.driver.util :as driver.u]
   [metabase.sql-parsing.core :as sql-parsing]
   [metabase.transform-testing.compile :as transform-testing.compile]
   [metabase.transform-testing.db :as transform-testing.db]
   [metabase.transform-testing.errors :as transform-testing.errors]
   [metabase.transform-testing.executor :as transform-testing.executor]
   [metabase.transform-testing.expectations.empty]
   [metabase.transform-testing.expectations.equals]
   [metabase.transform-testing.expectations.protocol :as expectations.protocol]
   [metabase.transform-testing.schema :as transform-testing.schema]
   [metabase.transform-testing.validator :as transform-testing.validator]
   [metabase.transforms-base.util :as transforms-base.u]
   [metabase.util.i18n :refer [tru]]
   [metabase.util.malli :as mu]))

(set! *warn-on-reflection* true)

;;; Required for the [[expectations.protocol/build]] methods and result schemas each type registers.
(comment
  metabase.transform-testing.expectations.empty/keep-me
  metabase.transform-testing.expectations.equals/keep-me)

(defn- table-labels
  "The map from each temp table of the run to the table the author wrote, for rewriting warehouse error messages that
  can only speak in generated names."
  [transform input->table output-table]
  (into {output-table (transform-testing.validator/table-label (select-keys (:target transform) [:schema :name]))}
        (map (fn [[input table]] [table (transform-testing.validator/table-label (:table input))]))
        input->table))

(defn- warehouse-said
  "What the warehouse told us about `e`, with every generated temp-table name replaced by the one
  the author wrote, or nil when it said nothing."
  [e labels]
  (transform-testing.errors/remap-message (ex-message e) labels))

(defn- rethrow-remapped
  "Rethrow `e` as `error-type` behind `message`, quoting the warehouse where it had something to say."
  [e error-type message labels]
  (let [cause (warehouse-said e labels)]
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
  on that expectation rather than failing the whole run. The temp tables it needs are created
  before its probes and dropped after them."
  [driver conn context expectation labels]
  (let [temp-tables (atom {})]
    (try
      (doseq [[id query] (expectations.protocol/temp-tables expectation context)]
        (let [table (driver/temp-table-name driver)]
          (swap! temp-tables assoc id table)
          (transform-testing.executor/create-temp-table! driver conn table query)))
      (->> (expectations.protocol/probes expectation (assoc context :temp-tables @temp-tables))
           (run-probes! driver conn)
           (expectations.protocol/interpret expectation))
      (catch Exception e
        {:name   (:name expectation)
         :type   (:type expectation)
         :status :error
         :error  {:type    (or (:error-type (ex-data e))
                               ::transform-testing.errors/expectation-failed)
                  :message (or (warehouse-said e labels)
                               (tru "The expectation could not be run, and the database gave no reason."))}})
      (finally
        (doseq [table (vals @temp-tables)]
          (transform-testing.executor/drop-temp-table! driver conn table))))))

(defn- testable-transform
  "The transform `transform-id` names, if it is one a test can run."
  [transform-id]
  (let [transform (api/check-404 (transform-testing.db/transform transform-id))]
    (when-not (transforms-base.u/query-transform? transform)
      (throw (transform-testing.errors/ex
              ::transform-testing.errors/unsupported-transform
              (tru "Only query transforms can be tested.")
              {:transform-id transform-id})))
    transform))

(defn- testable-database
  "The database `transform` reads, if its driver can run a transform test."
  [transform]
  (let [database (api/check-404 (transform-testing.db/database
                                 (transforms-base.u/transform-source-database transform)))
        driver   (keyword (:engine database))]
    (when-not (driver.u/supports? driver :transforms/testing database)
      (throw (transform-testing.errors/ex
              ::transform-testing.errors/unsupported-driver
              (tru "The {0} database of this transform does not support transform testing."
                   (name driver))
              {:driver driver})))
    database))

(defn- parsed-source
  "The transform's source compiled to SQL, with the tables it reads, or a refusal naming what would not parse."
  [driver transform transform-id]
  (try
    (transform-testing.compile/compile-source driver transform)
    (catch Exception e
      (if (sql-parsing/parse-error? e)
        (throw (transform-testing.errors/ex
                ::transform-testing.errors/unparseable-source
                (tru "The transform source SQL could not be parsed for test input validation: {0}"
                     (or (some-> (ex-cause e) ex-message) (ex-message e)))
                {:transform-id transform-id}))
        (throw e)))))

(defn- create-inputs!
  "Materialize each input of `input->table` as its temp table on `conn`."
  [driver conn input->table labels]
  (doseq [[input table] input->table]
    (try
      (transform-testing.executor/create-temp-table!
       driver conn table (transform-testing.compile/compile-input driver input))
      (catch Exception e
        (rethrow-remapped e ::transform-testing.errors/setup-failed
                          (tru "Could not create the test input for {0}:"
                               (transform-testing.validator/table-label (:table input)))
                          labels)))))

(defn- create-output!
  "Run the transform under test on `conn`, materializing its output as the temp table `output-table`."
  [driver conn output-table compiled-transform labels]
  (try
    (transform-testing.executor/create-temp-table! driver conn output-table compiled-transform)
    (catch Exception e
      (rethrow-remapped e ::transform-testing.errors/transform-failed
                        (tru "The transform under test failed to run:")
                        labels))))

(defn- check-expectations
  "The result of every expectation against the output temp table, passing ones included."
  [driver conn context expectations labels]
  (let [context (assoc context
                       :output-columns
                       (transform-testing.executor/table-columns driver conn (:output-table context)))]
    (mapv (fn [expectation]
            (check-expectation driver conn context (expectations.protocol/build expectation) labels))
          expectations)))

(mu/defn run-transform-test! :- ::transform-testing.schema/run-result
  "Run the transform test `transform-test` against temp tables and report what each expectation found.

  Throws a typed refusal from [[metabase.transform-testing.errors]] when the run cannot happen. A
  failing expectation is not a refusal: it rides back as that expectation's own result."
  [{:keys [transform_id inputs expectations]} :- ::transform-testing.schema/transform-test]
  (let [transform      (testable-transform transform_id)
        database       (testable-database transform)
        driver         (keyword (:engine database))
        source         (parsed-source driver transform transform_id)
        input->table   (into {} (map (fn [input] [input (driver/temp-table-name driver)])) inputs)
        output-table   (driver/temp-table-name driver)
        labels         (table-labels transform input->table output-table)
        default-schema (sql.normalize/default-schema driver database)
        replacements   (transform-testing.compile/table-replacements transform input->table output-table default-schema)
        compiled       (transform-testing.compile/compile-transform driver source replacements)]
    (transform-testing.validator/validate
     driver
     {:inputs              inputs
      :expectations        expectations
      :referenced-tables   (:referenced-tables source)
      :rewritten-transform (:query compiled)
      :replacements        replacements
      :default-schema      default-schema})
    (driver/do-with-test-connection
     driver database
     (fn [conn]
       (try
         (create-inputs! driver conn input->table labels)
         (create-output! driver conn output-table compiled labels)
         (let [results (check-expectations driver conn
                                           {:driver driver :output-table output-table :replacements replacements}
                                           expectations labels)]
           {:status       (if (every? #(= :passed (:status %)) results) :passed :failed)
            :expectations results
            :tables       labels})
         (finally
           (doseq [table (cons output-table (vals input->table))]
             (transform-testing.executor/drop-temp-table! driver conn table))))))))
