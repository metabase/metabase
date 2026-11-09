(ns metabase-enterprise.transform-testing.runner
  "Orchestrates a test run over the module's separated concerns. Callers hand the runner the definitions of the
  subject and the test; the runner owns the connection lifecycle, hands ordinary arguments to each concern (no
  marshaled plan object), and owns the HTTP decisions.

    subject      — app-db: the subject's database and its query compiled to SQL, one method per subject type
    compile      — pure: referenced tables (once), then rewrites to temp tables
    validator    — pure: may this test run? every read faked, every rewritten query on temp tables
    executor     — the one place warehouse I/O lives: create/drop temp tables, run read-backs
    expectations — check each expectation against the output temp table (via executor)

  Flow — compile the subject once, then thread that one result so the guard and the rewrite agree:

    subject-plan (app-db)     : the database, the subject's SQL, the names of its output
      → referenced tables (pure): the tables the SQL reads
      → name + rewrite (pure)   : a temp table per input, and the source reading them
      → validate (pure)         : reject a test that is incomplete, or whose queries would still
                                  read a real table
      → run (executor)          : one connection — create the temp tables, check, drop on exit

  Only the app database is read before the connection, and no warehouse I/O happens; a bad test is rejected before any
  temp table exists."
  (:require
   [metabase-enterprise.transform-testing.compile :as transform-testing.compile]
   [metabase-enterprise.transform-testing.errors :as transform-testing.errors]
   [metabase-enterprise.transform-testing.executor :as transform-testing.executor]
   [metabase-enterprise.transform-testing.expectations.empty]
   [metabase-enterprise.transform-testing.expectations.equals]
   [metabase-enterprise.transform-testing.expectations.protocol :as expectations.protocol]
   [metabase-enterprise.transform-testing.run-tracking :as transform-testing.run-tracking]
   [metabase-enterprise.transform-testing.schema :as transform-testing.schema]
   [metabase-enterprise.transform-testing.subject :as transform-testing.subject]
   [metabase-enterprise.transform-testing.subject.transform]
   [metabase-enterprise.transform-testing.validator :as transform-testing.validator]
   [metabase.api.common :as api]
   [metabase.driver :as driver]
   [metabase.lib.schema.common :as lib.schema.common]
   [metabase.lib.schema.metadata :as lib.schema.metadata]
   [metabase.sql-parsing.core :as sql-parsing]
   [metabase.transforms.schema :as transforms.schema]
   [metabase.transforms.util :as transforms.u]
   [metabase.util.i18n :refer [tru]]
   [metabase.util.malli :as mu]
   [metabase.util.malli.registry :as mr]
   [metabase.util.malli.schema :as ms]))

(set! *warn-on-reflection* true)

;;; Required for the [[expectations.protocol/build]] methods and result schemas each type registers, and the
;;; [[transform-testing.subject/subject-plan]] method of each subject type.
(comment
  metabase-enterprise.transform-testing.expectations.empty/keep-me
  metabase-enterprise.transform-testing.expectations.equals/keep-me
  metabase-enterprise.transform-testing.subject.transform/keep-me)

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
  "The map from each temp table of the run to the name the author wrote, for rewriting warehouse error messages that
  can only speak in generated names."
  [output-label :- :string
   input->table :- [:map-of ::transform-testing.schema/input :string]
   output-table :- :string]
  (into {output-table output-label}
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

(mu/defn- source-tables :- [:set ::transform-testing.schema/table]
  "The tables the subject's `sql` reads, or a refusal naming what would not parse."
  [driver :- :keyword
   sql    :- :string]
  (try
    (transform-testing.compile/referenced-tables driver sql)
    (catch Exception e
      (if (sql-parsing/parse-error? e)
        (throw (transform-testing.errors/ex
                ::transform-testing.errors/unparseable-source
                (tru "The SQL of the query under test could not be parsed for test input validation: {0}"
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
                        (tru "The query under test failed to run:")
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
  "Everything a run needs, resolved and checked but not yet executed: the database and driver the subject runs
  against, a temp table per input and one for its output, the subject's query rewritten to read them, and the labels a
  message renders them as.

  Throws the run's typed refusals — an untestable subject or driver, SQL that will not parse, a test the validator
  rejects — so a caller that only wants the answer to \"could this run?\" gets it by asking for the plan and
  discarding it."
  [subject-type :- ::transform-testing.subject/subject-type
   subject      :- ::transform-testing.subject/subject
   inputs       :- ::transform-testing.schema/inputs
   expectations :- ::transform-testing.schema/expectations]
  (let [{:keys [database compiled output-tables output-label]}
        (transform-testing.subject/subject-plan subject-type subject)
        driver         (keyword (:engine database))
        source-tables  (source-tables driver (:query compiled))
        input->table   (into {} (map (fn [input] [input (driver/temp-table-name driver)])) inputs)
        output-table   (driver/temp-table-name driver)
        default-schema (:default-schema database)
        replacements   (transform-testing.compile/table-replacements output-tables input->table output-table default-schema)
        rewritten      (transform-testing.compile/rewrite-query driver compiled replacements)]
    (transform-testing.validator/validate
     driver
     {:inputs              inputs
      :expectations        expectations
      :referenced-tables   source-tables
      :rewritten-transform (:query rewritten)
      :replacements        replacements
      :default-schema      default-schema})
    {:driver       driver
     :database     database
     :input->table input->table
     :output-table output-table
     :labels       (table-labels output-label input->table output-table)
     :replacements replacements
     :compiled     rewritten}))

(mu/defn validate-test :- :nil
  "Refuse a test of `transform` with these `inputs` and `expectations` unless it could run: the same
  checks a run makes, up to but not including the connection.

  Returns nil when there is nothing to refuse, and otherwise throws the refusal the run would have thrown, so a test
  is turned away as it is authored rather than only when somebody runs it."
  [transform    :- ::transforms.schema/transform.definition
   inputs       :- ::transform-testing.schema/inputs
   expectations :- ::transform-testing.schema/expectations]
  (validated-plan :transform transform inputs expectations)
  nil)

(mu/defn run-test! :- ::transform-testing.schema/run-result
  "Run `transform-test` against `transform` on temp tables and report what each expectation found, recording the run
  under the test.

  Throws a typed refusal from [[metabase-enterprise.transform-testing.errors]] when the run cannot happen. A
  failing expectation is not a refusal: it rides back as that expectation's own result."
  [transform                                        :- ::transforms.schema/transform
   {:keys [inputs expectations] :as transform-test} :- ::transform-testing.schema/transform-test]
  (let [{:keys [driver database input->table output-table labels replacements compiled]}
        (validated-plan :transform (transforms.u/->definition transform) inputs expectations)
        {run-id :id} (transform-testing.run-tracking/start-run! (:id transform-test) api/*current-user-id*)
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
