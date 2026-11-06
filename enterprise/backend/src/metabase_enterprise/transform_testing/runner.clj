(ns metabase-enterprise.transform-testing.runner
  "Orchestrates a transform test run over the module's separated concerns. Callers hand the runner the definitions of the
  transform and the test; the runner owns the connection lifecycle, hands ordinary arguments to each concern (no
  marshaled plan object), and owns the HTTP decisions.

    db           — app-db reads (database)
    compile      — pure: source → SQL + referenced tables (once), then rewrites to temp tables
    validator    — pure: may this test run? every read faked, every rewritten query on temp tables
    executor     — the one place warehouse I/O lives: create/drop temp tables, run read-backs
    expectations — check each expectation against the output temp table (via executor)

  Flow — compile the source once, then thread that one result so the guard and the rewrite agree:

    resolve the database (app-db)
      → compile-source (pure)   : the transform's SQL + the tables it reads
      → name + rewrite (pure)   : a temp table per input, and the source reading them
      → validate (pure)         : reject a test that is incomplete, or whose queries would still
                                  read a real table
      → run (executor)          : one connection — create the temp tables, check, drop on exit

  Everything before the connection is pure; a bad test is rejected before any temp table exists."
  (:require
   [metabase-enterprise.transform-testing.compile :as transform-testing.compile]
   [metabase-enterprise.transform-testing.db :as transform-testing.db]
   [metabase-enterprise.transform-testing.errors :as transform-testing.errors]
   [metabase-enterprise.transform-testing.executor :as transform-testing.executor]
   [metabase-enterprise.transform-testing.expectations.empty]
   [metabase-enterprise.transform-testing.expectations.equals]
   [metabase-enterprise.transform-testing.expectations.protocol :as expectations.protocol]
   [metabase-enterprise.transform-testing.run-tracking :as transform-testing.run-tracking]
   [metabase-enterprise.transform-testing.schema :as transform-testing.schema]
   [metabase-enterprise.transform-testing.util :as transform-testing.u]
   [metabase-enterprise.transform-testing.validator :as transform-testing.validator]
   [metabase.api.common :as api]
   [metabase.driver :as driver]
   [metabase.driver.util :as driver.u]
   [metabase.lib.schema.common :as lib.schema.common]
   [metabase.lib.schema.metadata :as lib.schema.metadata]
   [metabase.sql-parsing.core :as sql-parsing]
   [metabase.transforms-base.util :as transforms-base.u]
   [metabase.transforms.schema :as transforms.schema]
   [metabase.transforms.util :as transforms.u]
   [metabase.util.i18n :refer [tru]]
   [metabase.util.malli :as mu]
   [metabase.util.malli.registry :as mr]
   [metabase.util.malli.schema :as ms]))

(set! *warn-on-reflection* true)

;;; Required for the [[expectations.protocol/build]] methods and result schemas each type registers.
(comment
  metabase-enterprise.transform-testing.expectations.empty/keep-me
  metabase-enterprise.transform-testing.expectations.equals/keep-me)

(mr/def ::labels
  "The table the author wrote for each temp table of the run."
  [:map-of :string :string])

(mr/def ::plan
  "What [[validated-plan]] hands the run that follows it."
  [:map {:closed true}
   [:driver       :keyword]
   [:database     ::lib.schema.metadata/database]
   [:input->table [:map-of ::transform-testing.schema/input :string]]
   [:output-table :string]
   [:labels       ::labels]
   [:replacements ::transform-testing.compile/table-replacements]
   [:compiled     ::transform-testing.compile/compiled-query]])

(mr/def ::built-expectation
  "An expectation built by [[expectations.protocol/build]]."
  [:fn #(satisfies? expectations.protocol/Expectation %)])

(mr/def ::context
  "What an expectation is given to build its queries and read their answers: the driver, the output temp table and
  the columns it has, the input-table replacements, and the expectation's own temp tables once they exist."
  [:map {:closed true}
   [:driver         :keyword]
   [:output-table   :string]
   [:replacements   ::transform-testing.compile/table-replacements]
   [:output-columns {:optional true} [:sequential ::transform-testing.schema/result-column]]
   [:temp-tables    {:optional true} [:map-of :string :string]]])

(mr/def ::probe
  "A query an expectation needs run."
  [:map {:closed true}
   [:query    :string]
   [:params   [:maybe [:sequential ::lib.schema.common/field-value]]]
   [:max-rows :int]])

(mr/def ::probes
  "The queries an expectation needs, by probe id: the ids the expectation types use."
  [:map {:closed true}
   [:violations   {:optional true} ::probe]
   [:comparison   {:optional true} ::probe]
   [:actual-count {:optional true} ::probe]])

(mr/def ::probe-results
  "What each probe of [[::probes]] read: its rows and the columns describing them."
  (let [result [:map {:closed true}
                [:rows    [:sequential [:sequential ms/FieldValue]]]
                [:columns [:sequential ::transform-testing.schema/result-column]]]]
    [:map {:closed true}
     [:violations   {:optional true} result]
     [:comparison   {:optional true} result]
     [:actual-count {:optional true} result]]))

(mu/defn- table-labels :- ::labels
  "The map from each temp table of the run to the table the author wrote, for rewriting warehouse error messages that
  can only speak in generated names."
  [transform    :- ::transforms.schema/transform.definition
   input->table :- [:map-of ::transform-testing.schema/input :string]
   output-table :- :string]
  (into {output-table (transform-testing.validator/table-label (select-keys (:target transform) [:schema :name]))}
        (map (fn [[input table]] [table (transform-testing.validator/table-label (:table input))]))
        input->table))

(mu/defn- warehouse-said :- [:maybe :string]
  "What the warehouse told us about `e`, with every generated temp-table name replaced by the one
  the author wrote, or nil when it said nothing."
  [e      :- (ms/InstanceOfClass Throwable)
   labels :- ::labels]
  (transform-testing.errors/remap-message (ex-message e) labels))

(mu/defn- rethrow-remapped :- :nil
  "Rethrow `e` as `error-type` behind `message`, quoting the warehouse where it had something to say."
  [e          :- (ms/InstanceOfClass Throwable)
   error-type :- :keyword
   message    :- :string
   labels     :- ::labels]
  (let [cause (warehouse-said e labels)]
    (throw (transform-testing.errors/ex
            error-type
            (if cause (str message " " cause) message)
            {:cause cause}
            e))))

(mu/defn- run-probes! :- ::probe-results
  "Run one expectation's probes on `conn`, returning `{probe-id rows}`."
  [driver :- :keyword
   conn   :- ::transform-testing.schema/connection
   probes :- ::probes]
  (update-vals probes
               (fn [{:keys [query params max-rows]}]
                 (transform-testing.executor/run-query driver conn [query (vec params)] max-rows))))

(mu/defn- check-expectation :- ::transform-testing.schema/expectation-result
  "The result map for one expectation. An expectation whose own query fails is reported as an error
  on that expectation rather than failing the whole run. The temp tables it needs are created
  before its probes and dropped after them."
  [driver      :- :keyword
   conn        :- ::transform-testing.schema/connection
   context     :- ::context
   expectation :- ::built-expectation
   labels      :- ::labels]
  (let [temp-tables (atom {})]
    (try
      (doseq [[id query] (expectations.protocol/temp-tables expectation context)]
        (let [table (driver/temp-table-name driver)]
          (swap! temp-tables assoc id table)
          (transform-testing.executor/create-temp-table! driver conn table query)))
      (->> (expectations.protocol/probes expectation (assoc context :temp-tables @temp-tables))
           (run-probes! driver conn)
           (expectations.protocol/interpret expectation context))
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

(mu/defn- check-testable-transform :- :nil
  "Refuse `transform` unless it is one a test can run."
  [transform :- ::transforms.schema/transform.definition]
  (when-not (transforms-base.u/query-transform? transform)
    (throw (transform-testing.errors/ex
            ::transform-testing.errors/unsupported-transform
            (tru "Only query transforms can be tested.")
            {}))))

(mu/defn- testable-database :- ::lib.schema.metadata/database
  "The database `transform` reads, if its driver can run a transform test."
  [transform :- ::transforms.schema/transform.definition]
  (let [database-id (transforms-base.u/transform-source-database transform)
        _           (api/check-404 (some-> database-id transform-testing.db/database-exists?))
        database    (driver.u/lib-database database-id)
        driver   (keyword (:engine database))]
    (when-not (driver.u/supports? driver :transforms/testing database)
      (throw (transform-testing.errors/ex
              ::transform-testing.errors/unsupported-driver
              (tru "The {0} database of this transform does not support transform testing."
                   (name driver))
              {:driver driver})))
    database))

(mu/defn- parsed-source :- ::transform-testing.compile/compiled-source
  "The transform's source compiled to SQL, with the tables it reads, or a refusal naming what would not parse."
  [driver    :- :keyword
   transform :- ::transforms.schema/transform.definition]
  (try
    (transform-testing.compile/compile-source driver transform)
    (catch Exception e
      (if (sql-parsing/parse-error? e)
        (throw (transform-testing.errors/ex
                ::transform-testing.errors/unparseable-source
                (tru "The transform source SQL could not be parsed for test input validation: {0}"
                     (sql-parsing/parse-error-message e))
                {}))
        (throw e)))))

(mu/defn- create-inputs! :- :nil
  "Materialize each input of `input->table` as its temp table on `conn`."
  [driver       :- :keyword
   conn         :- ::transform-testing.schema/connection
   input->table :- [:map-of ::transform-testing.schema/input :string]
   labels       :- ::labels]
  (doseq [[input table] input->table]
    (try
      (transform-testing.executor/create-temp-table!
       driver conn table (transform-testing.compile/compile-input driver input))
      (catch Exception e
        (rethrow-remapped e ::transform-testing.errors/setup-failed
                          (tru "Could not create the test input for {0}:"
                               (transform-testing.validator/table-label (:table input)))
                          labels)))))

(mu/defn- create-output! :- :nil
  "Run the transform under test on `conn`, materializing its output as the temp table `output-table`."
  [driver             :- :keyword
   conn               :- ::transform-testing.schema/connection
   output-table       :- :string
   compiled-transform :- ::transform-testing.compile/compiled-query
   labels             :- ::labels]
  (try
    (transform-testing.executor/create-temp-table! driver conn output-table compiled-transform)
    nil
    (catch Exception e
      (rethrow-remapped e ::transform-testing.errors/transform-failed
                        (tru "The transform under test failed to run:")
                        labels))))

(mu/defn- check-expectations :- [:sequential ::transform-testing.schema/expectation-result]
  "The result of every expectation against the output temp table, passing ones included."
  [driver       :- :keyword
   conn         :- ::transform-testing.schema/connection
   context      :- ::context
   expectations :- ::transform-testing.schema/expectations
   labels       :- ::labels]
  (let [context (assoc context
                       :output-columns
                       (transform-testing.executor/table-columns driver conn (:output-table context)))]
    (mapv (fn [expectation]
            (check-expectation driver conn context (expectations.protocol/build expectation) labels))
          expectations)))

(mu/defn- validated-plan :- ::plan
  "Everything a run needs, resolved and checked but not yet executed: the database and driver the transform runs
  against, a temp table per input and one for its output, the source rewritten to read them, and the labels a
  message renders them as.

  Throws the run's typed refusals — an untestable transform or driver, SQL that will not parse, a test the
  validator rejects — so a caller that only wants the answer to \"could this run?\" gets it by asking for the plan
  and discarding it."
  [transform    :- ::transforms.schema/transform.definition
   inputs       :- ::transform-testing.schema/inputs
   expectations :- ::transform-testing.schema/expectations]
  (check-testable-transform transform)
  (let [database       (testable-database transform)
        driver         (keyword (:engine database))
        source         (parsed-source driver transform)
        input->table   (into {} (map (fn [input] [input (driver/temp-table-name driver)])) inputs)
        output-table   (driver/temp-table-name driver)
        default-schema (:default-schema database)
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
    {:driver       driver
     :database     database
     :input->table input->table
     :output-table output-table
     :labels       (table-labels transform input->table output-table)
     :replacements replacements
     :compiled     compiled}))

(mu/defn validate-test :- :nil
  "Refuse a test of `transform` with these `inputs` and `expectations` unless it could run: the same
  checks a run makes, up to but not including the connection.

  Returns nil when there is nothing to refuse, and otherwise throws the refusal the run would have thrown, so a test
  is turned away as it is authored rather than only when somebody runs it."
  [transform    :- ::transforms.schema/transform.definition
   inputs       :- ::transform-testing.schema/inputs
   expectations :- ::transform-testing.schema/expectations]
  (validated-plan transform inputs expectations)
  nil)

(mu/defn run-test! :- ::transform-testing.schema/run-result
  "Run `transform-test` against `transform` on temp tables and report what each expectation found, recording the run
  under `transform-test-id`, or under no test when it is nil.

  Throws a typed refusal from [[metabase-enterprise.transform-testing.errors]] when the run cannot happen. A
  failing expectation is not a refusal: it rides back as that expectation's own result."
  [transform                                        :- ::transforms.schema/transform.definition
   {:keys [inputs expectations]}                    :- ::transform-testing.schema/transform-test.definition
   transform-test-id                                :- [:maybe ms/PositiveInt]]
  (let [{:keys [driver database input->table output-table labels replacements compiled]}
        (validated-plan transform inputs expectations)
        {run-id :id} (transform-testing.run-tracking/start-run! transform-test-id api/*current-user-id*)
        final-status (atom :error)]
    (try
      (let [result
            (driver/do-with-test-connection
             driver database
             (fn [conn]
               (try
                 (create-inputs! driver conn input->table labels)
                 (create-output! driver conn output-table compiled labels)
                 (let [results (check-expectations driver conn
                                                   {:driver driver
                                                    :output-table output-table
                                                    :replacements replacements}
                                                   expectations labels)]
                   {:status       (if (every? #(= :passed (:status %)) results) :passed :failed)
                    :expectations results
                    :tables       labels})
                 (finally
                   (doseq [table (cons output-table (vals input->table))]
                     (transform-testing.executor/drop-temp-table! driver conn table))))))]
        (reset! final-status (:status result))
        result)
      (finally
        (transform-testing.run-tracking/finish-run! run-id @final-status)))))

(mu/defn run-saved-test! :- ::transform-testing.schema/run-result
  "Run the saved `transform-test` of the saved `transform`, as [[run-test!]] runs definitions, recording the run under
  the test."
  [transform      :- ::transforms.schema/transform
   transform-test :- ::transform-testing.schema/transform-test]
  (run-test! (transforms.u/->definition transform) (transform-testing.u/->definition transform-test) (:id transform-test)))
