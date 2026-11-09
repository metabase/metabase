(ns metabase-enterprise.data-testing.runner
  "Orchestrates a test run over the module's separated concerns. Callers hand the runner the saved subject, and the
  saved test to run or the inputs and expectations to validate; the runner owns the connection lifecycle, hands
  ordinary arguments to each concern (no marshaled plan object), and owns the HTTP decisions.

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
   [metabase-enterprise.data-testing.compile :as data-testing.compile]
   [metabase-enterprise.data-testing.errors :as data-testing.errors]
   [metabase-enterprise.data-testing.executor :as data-testing.executor]
   [metabase-enterprise.data-testing.expectations.empty]
   [metabase-enterprise.data-testing.expectations.equals]
   [metabase-enterprise.data-testing.expectations.protocol :as expectations.protocol]
   [metabase-enterprise.data-testing.run-tracking :as data-testing.run-tracking]
   [metabase-enterprise.data-testing.schema :as data-testing.schema]
   [metabase-enterprise.data-testing.subject :as data-testing.subject]
   [metabase-enterprise.data-testing.subject.card]
   [metabase-enterprise.data-testing.subject.transform]
   [metabase-enterprise.data-testing.validator :as data-testing.validator]
   [metabase.api.common :as api]
   [metabase.driver :as driver]
   [metabase.lib.schema.common :as lib.schema.common]
   [metabase.lib.schema.metadata :as lib.schema.metadata]
   [metabase.sql-parsing.core :as sql-parsing]
   [metabase.util.i18n :refer [tru]]
   [metabase.util.malli :as mu]
   [metabase.util.malli.registry :as mr]
   [metabase.util.malli.schema :as ms]))

(set! *warn-on-reflection* true)

;;; Required for the [[expectations.protocol/build]] methods and result schemas each type registers, and the
;;; [[data-testing.subject/subject-plan]] method of each subject type.
(comment
  metabase-enterprise.data-testing.expectations.empty/keep-me
  metabase-enterprise.data-testing.expectations.equals/keep-me
  metabase-enterprise.data-testing.subject.card/keep-me
  metabase-enterprise.data-testing.subject.transform/keep-me)

(mr/def ::labels
  "The table the author wrote for each temp table of the run."
  [:map-of :string :string])

(mr/def ::plan
  "What [[validated-plan]] hands the run that follows it."
  [:map {:closed true}
   [:driver       :keyword]
   [:database     ::lib.schema.metadata/database]
   [:input->table [:map-of ::data-testing.schema/input :string]]
   [:output-table :string]
   [:labels       ::labels]
   [:replacements ::data-testing.compile/table-replacements]
   [:output-token [:maybe ::data-testing.compile/output-token]]
   [:compiled     ::data-testing.compile/compiled-query]])

(mr/def ::built-expectation
  "An expectation built by [[expectations.protocol/build]]."
  [:fn #(satisfies? expectations.protocol/Expectation %)])

(mr/def ::context
  "What an expectation is given to build its queries and read their answers: the driver, the output temp table and
  the columns it has, the input-table replacements, the token its SQL may write for the output, and the expectation's
  own temp tables once they exist."
  [:map {:closed true}
   [:driver         :keyword]
   [:output-table   :string]
   [:replacements   ::data-testing.compile/table-replacements]
   [:output-token   {:optional true} [:maybe ::data-testing.compile/output-token]]
   [:output-columns {:optional true} [:sequential ::data-testing.schema/result-column]]
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
                [:columns [:sequential ::data-testing.schema/result-column]]]]
    [:map {:closed true}
     [:violations   {:optional true} result]
     [:comparison   {:optional true} result]
     [:actual-count {:optional true} result]]))

(mu/defn- table-labels :- ::labels
  "The map from each temp table of the run to the name the author wrote, for rewriting warehouse error messages that
  can only speak in generated names."
  [output-label :- :string
   input->table :- [:map-of ::data-testing.schema/input :string]
   output-table :- :string]
  (into {output-table output-label}
        (map (fn [[input table]] [table (data-testing.validator/table-label (:table input))]))
        input->table))

(mu/defn- warehouse-said :- [:maybe :string]
  "What the warehouse told us about `e`, with every generated temp-table name replaced by the one
  the author wrote, or nil when it said nothing."
  [e      :- (ms/InstanceOfClass Throwable)
   labels :- ::labels]
  (data-testing.errors/remap-message (ex-message e) labels))

(mu/defn- rethrow-remapped :- :nil
  "Rethrow `e` as `error-type` behind `message`, quoting the warehouse where it had something to say."
  [e          :- (ms/InstanceOfClass Throwable)
   error-type :- :keyword
   message    :- :string
   labels     :- ::labels]
  (let [cause (warehouse-said e labels)]
    (throw (data-testing.errors/ex
            error-type
            (if cause (str message " " cause) message)
            {:cause cause}
            e))))

(mu/defn- run-probes! :- ::probe-results
  "Run one expectation's probes on `conn`, returning `{probe-id rows}`."
  [driver :- :keyword
   conn   :- ::data-testing.schema/connection
   probes :- ::probes]
  (update-vals probes
               (fn [{:keys [query params max-rows]}]
                 (data-testing.executor/run-query driver conn [query (vec params)] max-rows))))

(mu/defn- check-expectation :- ::data-testing.schema/expectation-result
  "The result map for one expectation. An expectation whose own query fails is reported as an error
  on that expectation rather than failing the whole run. The temp tables it needs are created
  before its probes and dropped after them."
  [driver      :- :keyword
   conn        :- ::data-testing.schema/connection
   context     :- ::context
   expectation :- ::built-expectation
   labels      :- ::labels]
  (let [temp-tables (atom {})]
    (try
      (doseq [[id query] (expectations.protocol/temp-tables expectation context)]
        (let [table (driver/temp-table-name driver)]
          (swap! temp-tables assoc id table)
          (data-testing.executor/create-temp-table! driver conn table query)))
      (->> (expectations.protocol/probes expectation (assoc context :temp-tables @temp-tables))
           (run-probes! driver conn)
           (expectations.protocol/interpret expectation context))
      (catch Exception e
        {:name   (:name expectation)
         :type   (:type expectation)
         :status :error
         :error  {:type    (or (:error-type (ex-data e))
                               ::data-testing.errors/expectation-failed)
                  :message (or (warehouse-said e labels)
                               (tru "The expectation could not be run, and the database gave no reason."))}})
      (finally
        (doseq [table (vals @temp-tables)]
          (data-testing.executor/drop-temp-table! driver conn table))))))

(mu/defn- source-tables :- [:set ::data-testing.schema/table]
  "The tables the subject's `sql` reads, or a refusal naming what would not parse."
  [driver :- :keyword
   sql    :- :string]
  (try
    (data-testing.compile/referenced-tables driver sql)
    (catch Exception e
      (if (sql-parsing/parse-error? e)
        (throw (data-testing.errors/ex
                ::data-testing.errors/unparseable-source
                (tru "The SQL of the query under test could not be parsed for test input validation: {0}"
                     (sql-parsing/parse-error-message e))
                {}))
        (throw e)))))

(mu/defn- create-inputs! :- :nil
  "Materialize each input of `input->table` as its temp table on `conn`."
  [driver       :- :keyword
   conn         :- ::data-testing.schema/connection
   input->table :- [:map-of ::data-testing.schema/input :string]
   labels       :- ::labels]
  (doseq [[input table] input->table]
    (try
      (data-testing.executor/create-temp-table!
       driver conn table (data-testing.compile/compile-input driver input))
      (catch Exception e
        (rethrow-remapped e ::data-testing.errors/setup-failed
                          (tru "Could not create the test input for {0}:"
                               (data-testing.validator/table-label (:table input)))
                          labels)))))

(mu/defn- create-output! :- :nil
  "Run the query under test on `conn`, materializing its output as the temp table `output-table`."
  [driver       :- :keyword
   conn         :- ::data-testing.schema/connection
   output-table :- :string
   compiled     :- ::data-testing.compile/compiled-query
   labels       :- ::labels]
  (try
    (data-testing.executor/create-temp-table! driver conn output-table compiled)
    nil
    (catch Exception e
      (rethrow-remapped e ::data-testing.errors/query-failed
                        (tru "The query under test failed to run:")
                        labels))))

(mu/defn- check-expectations :- [:sequential ::data-testing.schema/expectation-result]
  "The result of every expectation against the output temp table, passing ones included."
  [driver       :- :keyword
   conn         :- ::data-testing.schema/connection
   context      :- ::context
   expectations :- ::data-testing.schema/expectations
   labels       :- ::labels]
  (let [context (assoc context
                       :output-columns
                       (data-testing.executor/table-columns driver conn (:output-table context)))]
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
  [subject-type :- ::data-testing.subject/subject-type
   subject      :- ::data-testing.subject/subject
   inputs       :- ::data-testing.schema/inputs
   expectations :- ::data-testing.schema/expectations]
  (let [{:keys [database compiled output-tables output-token output-label]}
        (data-testing.subject/subject-plan subject-type subject)
        driver         (keyword (:engine database))
        source-tables  (source-tables driver (:query compiled))
        input->table   (into {} (map (fn [input] [input (driver/temp-table-name driver)])) inputs)
        output-table   (driver/temp-table-name driver)
        default-schema (:default-schema database)
        replacements   (data-testing.compile/table-replacements output-tables input->table output-table default-schema)
        rewritten      (data-testing.compile/rewrite-query driver compiled replacements)]
    (data-testing.validator/validate
     driver
     {:inputs              inputs
      :expectations        expectations
      :referenced-tables   source-tables
      :rewritten-query (:query rewritten)
      :replacements        replacements
      :output-token        output-token
      :default-schema      default-schema})
    {:driver       driver
     :database     database
     :input->table input->table
     :output-table output-table
     :labels       (table-labels output-label input->table output-table)
     :replacements replacements
     :output-token output-token
     :compiled     rewritten}))

(mu/defn validate-test :- :nil
  "Refuse a test of `subject`, a `subject-type`, with these `inputs` and `expectations` unless it could run: the same
  checks a run makes, up to but not including the connection.

  Returns nil when there is nothing to refuse, and otherwise throws the refusal the run would have thrown, so a test
  is turned away as it is authored rather than only when somebody runs it."
  [subject-type :- ::data-testing.subject/subject-type
   subject      :- ::data-testing.subject/subject
   inputs       :- ::data-testing.schema/inputs
   expectations :- ::data-testing.schema/expectations]
  (validated-plan subject-type subject inputs expectations)
  nil)

(mu/defn run-test! :- ::data-testing.schema/run-result
  "Run `saved-test` against `subject`, a `subject-type`, on temp tables and report what each expectation found,
  recording the run under the test.

  Throws a typed refusal from [[metabase-enterprise.data-testing.errors]] when the run cannot happen. A
  failing expectation is not a refusal: it rides back as that expectation's own result."
  [subject-type                                             :- ::data-testing.subject/subject-type
   subject                                                  :- ::data-testing.subject/subject
   {test-id :id :keys [inputs expectations] :as _saved-test} :- ::data-testing.schema/saved-test]
  (let [{:keys [driver database input->table output-table labels replacements output-token compiled]}
        (validated-plan subject-type subject inputs expectations)
        {run-id :id} (data-testing.run-tracking/start-run! subject-type test-id api/*current-user-id*)
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
                                                    :replacements replacements
                                                    :output-token output-token}
                                                   expectations labels)]
                   {:status       (if (every? #(= :passed (:status %)) results) :passed :failed)
                    :expectations results
                    :tables       labels})
                 (finally
                   (doseq [table (cons output-table (vals input->table))]
                     (data-testing.executor/drop-temp-table! driver conn table))))))]
        (reset! final-status (:status result))
        result)
      (finally
        (data-testing.run-tracking/finish-run! run-id @final-status)))))
