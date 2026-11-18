(ns metabase-enterprise.data-testing.schema
  "The shapes a data test is written in, and the only gate they pass: each schema explains its own
  refusals, so a caller reads what to fix from the explanation rather than from a hand-written check."
  (:require
   [clojure.string :as str]
   [malli.core :as mc]
   [metabase.lib.schema.common :as lib.schema.common]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.models.schema :as models.schema]
   [metabase.util.malli :as mu]
   [metabase.util.malli.registry :as mr]
   [metabase.util.malli.schema :as ms]))

(mu/defn- unknown-dispatch :- fn?
  "An `:error/fn` for a `:multi` dispatching on `dispatch-key`: says what the value named and what the schema
  knows, where Malli would say only \"invalid dispatch value\"."
  [dispatch-key :- :keyword]
  (fn [{:keys [schema value]} _options]
    (let [known (str/join ", " (sort (map (comp name first) (mc/children schema))))]
      (if (map? value)
        (str "unknown " (name dispatch-key) " " (pr-str (get value dispatch-key)) ", must be one of: " known)
        (str "must be a map whose " (name dispatch-key) " is one of: " known)))))

(defn- rows-match-columns?
  "Whether every row of a `rows` value carries a value for each declared column and none besides, which is nothing to
  answer when no column is declared -- the columns have their own schema to fail."
  [{:keys [columns rows]}]
  (let [declared (into #{} (map :name) columns)]
    (or (empty? declared)
        (every? (fn [row] (and (map? row) (= declared (set (keys row))))) rows))))

(defn- rows-match-columns-message
  "What the first row that does not carry exactly its declared columns got wrong."
  [{{:keys [columns rows]} :value} _options]
  (let [declared (into #{} (map :name) columns)
        offender (first (remove (fn [row] (and (map? row) (= declared (set (keys row))))) rows))
        missing  (sort (remove (set (keys offender)) declared))
        extra    (sort (remove declared (keys offender)))]
    (str "every row must carry exactly the declared columns"
         (when (seq missing) (str "; missing " (str/join ", " (map pr-str missing))))
         (when (seq extra) (str "; not declared: " (str/join ", " (map pr-str extra)))))))

(mr/def ::table
  "A table read by the query under test, by schema and name."
  [:map {:closed true, :decode/normalize lib.schema.common/normalize-map-no-kebab-case}
   [:schema {:optional true} [:maybe ::lib.schema.common/non-blank-string]]
   [:name   ::lib.schema.common/non-blank-string]])

(mr/def ::column
  "A column of inline test data, with the type its cells are cast to.

  A cast target, which on some engines is not a type name the warehouse ever reports: MySQL takes
  `SIGNED` and reports `BIGINT`."
  [:map {:closed true, :decode/normalize lib.schema.common/normalize-map-no-kebab-case}
   [:name      ::lib.schema.common/non-blank-string]
   [:cast_type ::lib.schema.common/non-blank-string]])

(mr/def ::result-column
  "A column reported by a test run, with its database native type."
  [:map {:closed true}
   [:name          ::lib.schema.common/non-blank-string]
   [:database_type ::lib.schema.common/non-blank-string]])

(mr/def ::row
  "A row of inline test data, keyed by column name, with `:string` first so request decoding keeps every cell as sent."
  (ms/string-keyed-map [:maybe [:or :string :boolean number?]]))

(mr/def ::sql-data
  "Test data returned by a SQL query run against the Database of the query under test."
  [:map {:closed true, :decode/normalize lib.schema.common/normalize-map-no-kebab-case}
   [:format {:decode/normalize lib.schema.common/normalize-keyword} [:= :sql]]
   [:sql    ::lib.schema.common/non-blank-string]])

(mr/def ::rows-data
  "Test data written out in the request: the columns, with the type each is cast to, and the rows.

  A row's keys are the declared column names, exactly: the query reads each row by those names, so a key that names
  no column would be dropped and a column a row leaves out would become a null cell, neither of which the author
  asked for."
  [:and
   [:map {:closed true, :decode/normalize lib.schema.common/normalize-map-no-kebab-case}
    [:format  {:decode/normalize lib.schema.common/normalize-keyword} [:= :rows]]
    [:columns [:sequential {:min 1} ::column]]
    [:rows    [:sequential ::row]]]
   [:fn {:error/fn rows-match-columns-message} rows-match-columns?]])

(mr/def ::input
  "An input table of the query under test, replaced with test data."
  [:multi {:decode/normalize lib.schema.common/normalize-map-no-kebab-case
           :dispatch         (comp keyword :format)
           :error/fn         (unknown-dispatch :format)}
   [:sql  [:merge [:map {:closed true, :decode/normalize lib.schema.common/normalize-map-no-kebab-case} [:table ::table]] ::sql-data]]
   [:rows [:merge [:map {:closed true, :decode/normalize lib.schema.common/normalize-map-no-kebab-case} [:table ::table]] ::rows-data]]])

(mr/def ::inputs
  "Test data for the tables the query under test reads. Every table it reads needs one, and an input for
  a table it does not read is refused."
  [:sequential ::input])

(mr/def ::expectation.equals
  "A check that the output of the query under test holds exactly the expected rows, over exactly their columns."
  [:multi {:decode/normalize lib.schema.common/normalize-map-no-kebab-case
           :dispatch         (comp keyword :format)
           :error/fn         (unknown-dispatch :format)}
   [:sql  [:merge
           [:map {:closed true, :decode/normalize lib.schema.common/normalize-map-no-kebab-case}
            [:type {:decode/normalize lib.schema.common/normalize-keyword} [:= :equals]]
            [:name ::lib.schema.common/non-blank-string]]
           ::sql-data]]
   [:rows [:merge
           [:map {:closed true, :decode/normalize lib.schema.common/normalize-map-no-kebab-case}
            [:type {:decode/normalize lib.schema.common/normalize-keyword} [:= :equals]]
            [:name ::lib.schema.common/non-blank-string]]
           ::rows-data]]])

(mr/def ::expectation.empty
  "A check that a SQL query over the output of the query under test returns no rows."
  [:map {:closed true, :decode/normalize lib.schema.common/normalize-map-no-kebab-case}
   [:type {:decode/normalize lib.schema.common/normalize-keyword} [:= :empty]]
   [:name ::lib.schema.common/non-blank-string]
   [:sql  ::lib.schema.common/non-blank-string]])

(mr/def ::expectation
  "A check on the output of the query under test."
  [:multi {:decode/normalize lib.schema.common/normalize-map-no-kebab-case
           :dispatch         (comp keyword :type)
           :error/fn         (unknown-dispatch :type)}
   [:equals ::expectation.equals]
   [:empty  ::expectation.empty]])

(mr/def ::expectations
  "The checks run against the output of the query under test. Names must be unique within a test,
  case-sensitively."
  [:and
   [:sequential ::expectation]
   [:fn {:error/message "expectation names must be unique within a test"}
    (fn [expectations]
      (let [names (map :name expectations)]
        (or (empty? names) (apply distinct? names))))]])

(mr/def ::test.definition
  "A test as a client writes it, without the subject it covers."
  [:map {:closed true}
   [:name         ::lib.schema.common/non-blank-string]
   [:description  {:optional true} [:maybe :string]]
   [:inputs       ::inputs]
   [:expectations ::expectations]])

(defn- test-create
  "What a client sends to create a test: the id of its subject under `subject-key`, of schema `subject-id-schema`."
  [subject-key subject-id-schema]
  [:merge
   [:map {:closed true}
    [subject-key subject-id-schema]]
   ::test.definition])

(defn- saved-test
  "A saved test: the id of its subject under `subject-key`, of schema `subject-id-schema`, the subject itself when
  hydrated under `subject`, of schema `subject-schema`, the inputs that stand in for the tables the subject reads, and
  the expectations checked against its output."
  [subject-key subject-id-schema subject subject-schema]
  [:map {:closed true}
   [:id           ms/PositiveInt]
   [:entity_id    {:optional true} :string]
   [:name         {:optional true} ::lib.schema.common/non-blank-string]
   [:description  {:optional true} [:maybe :string]]
   [:inputs       {:optional true} ::inputs]
   [:expectations {:optional true} ::expectations]
   [subject-key   {:optional true} subject-id-schema]
   [subject       {:optional true} [:maybe subject-schema]]
   [:creator_id   {:optional true} ::lib.schema.id/user]
   [:created_at   {:optional true} ms/TemporalInstant]
   [:updated_at   {:optional true} ms/TemporalInstant]])

(defn- test-update
  "What a client sends to update a test: any of its fields, with the id of its subject under `subject-key`, of schema
  `subject-id-schema`. Omitted fields are left unchanged."
  [subject-key subject-id-schema]
  [:map {:closed true}
   [subject-key   {:optional true} subject-id-schema]
   [:name         {:optional true} ::lib.schema.common/non-blank-string]
   [:description  {:optional true} [:maybe :string]]
   [:inputs       {:optional true} ::inputs]
   [:expectations {:optional true} ::expectations]])

(mr/def ::transform-test.create
  "What a client sends to create a transform test."
  (test-create :transform_id ::lib.schema.id/transform))

(mr/def ::transform-test
  "A saved transform test."
  (saved-test :transform_id ::lib.schema.id/transform :transform :metabase.transforms.schema/transform))

(mr/def ::transform-test.update
  "What a client sends to update a transform test. Omitted fields are left unchanged."
  (test-update :transform_id ::lib.schema.id/transform))

(mr/def ::card-test.create
  "What a client sends to create a card test."
  (test-create :card_id ::lib.schema.id/card))

(mr/def ::card-test
  "A saved card test."
  (saved-test :card_id ::lib.schema.id/card :card :metabase.queries.schema/card))

(mr/def ::card-test.update
  "What a client sends to update a card test. Omitted fields are left unchanged."
  (test-update :card_id ::lib.schema.id/card))

(mr/def ::saved-test
  "A saved test of any subject type."
  [:or ::transform-test ::card-test])

(mr/def ::run-status
  "The persisted lifecycle state of a test run."
  [:enum {:decode/normalize lib.schema.common/normalize-keyword}
   :started :passed :failed :error :timeout])

(mr/def ::test-type
  "The kind of test a run ran. It selects the table that `test_id` points into."
  [:enum {:decode/normalize lib.schema.common/normalize-keyword}
   :transform :card])

(mr/def ::data-test-run
  "A persisted execution of a test of any type. Deleting the test through its model sets `:test_id` to nil. A delete
  that skips model hooks (raw SQL, a database cascade) leaves a `:test_id` that names no test; such a run is never
  listed or shown as `last_run`."
  [:map {:closed true}
   [:id             ms/PositiveInt]
   [:test_type      ::test-type]
   [:test_id        [:maybe ms/PositiveInt]]
   [:initiated_by   [:maybe ::lib.schema.id/user]]
   [:start_time     ms/TemporalInstant]
   [:end_time       [:maybe ms/TemporalInstant]]
   [:status         ::run-status]
   [:last_heartbeat ms/TemporalInstant]])

(mr/def ::stored-data-test-run
  "A DataTestRun row of any test type, including a type that this version does not know."
  [:merge
   ::data-test-run
   [:map {:closed true}
    [:test_type :keyword]]])

(mr/def ::user
  "The user who started a run."
  [:map {:closed true}
   [:id          ::lib.schema.id/user]
   [:email       :string]
   [:first_name  [:maybe :string]]
   [:last_name   [:maybe :string]]
   [:common_name {:optional true} [:maybe :string]]])

(mr/def ::data-test-run.response
  "A test run as the API returns it, with the user who started it."
  [:merge
   ::data-test-run
   [:map {:closed true}
    [:initiated_by_user [:maybe ::user]]]])

(mr/def ::data-test-runs.response
  "A page of test runs."
  [:map {:closed true}
   [:data   [:sequential ::data-test-run.response]]
   [:limit  pos-int?]
   [:offset :int]
   [:total  :int]])

(mr/def ::transform-test.response
  "A transform test as the read endpoints return it, with its newest run."
  [:merge
   ::transform-test
   [:map {:closed true}
    [:last_run [:maybe ::data-test-run]]]])

(mr/def ::card-test.response
  "A card test as the read endpoints return it, with its newest run."
  [:merge
   ::card-test
   [:map {:closed true}
    [:last_run [:maybe ::data-test-run]]]])

(mr/def ::test-suite.member.request
  "A test in a suite, as a client names it: by its type and either its id or its entity id."
  [:and
   [:map {:closed true}
    [:test_type      ::test-type]
    [:test_id        {:optional true} ms/PositiveInt]
    [:test_entity_id {:optional true} ::lib.schema.common/non-blank-string]]
   [:fn {:error/message "must have exactly one of test_id and test_entity_id"}
    (fn [member] (= 1 (count (select-keys member [:test_id :test_entity_id]))))]])

(mr/def ::test-suite.create
  "What a client sends to create a test suite. The members are in the order the suite runs them."
  [:map {:closed true}
   [:name        ::lib.schema.common/non-blank-string]
   [:description {:optional true} [:maybe :string]]
   [:members     [:sequential ::test-suite.member.request]]])

(mr/def ::test-suite.update
  "What a client sends to update a test suite. Omitted fields are left unchanged; `:members` replaces every member."
  [:map {:closed true}
   [:name        {:optional true} ::lib.schema.common/non-blank-string]
   [:description {:optional true} [:maybe :string]]
   [:members     {:optional true} [:sequential ::test-suite.member.request]]])

(mr/def ::test-suite
  "A saved test suite, without its members."
  [:map {:closed true}
   [:id          ms/PositiveInt]
   [:entity_id   :string]
   [:name        ::lib.schema.common/non-blank-string]
   [:description [:maybe :string]]
   [:creator_id  ::lib.schema.id/user]
   [:created_at  ms/TemporalInstant]
   [:updated_at  ms/TemporalInstant]])

(mr/def ::test-suite.synced-item
  "A test suite as remote sync lists it."
  [:map {:closed true}
   [:id   ms/PositiveInt]
   [:name :string]])

(mr/def ::test-suite.member
  "A test in a suite, by type and entity id. A suite can name a test this instance lacks, or of a type this version does
  not know: its `:test_type` is then any keyword."
  [:map {:closed true}
   [:id             ms/PositiveInt]
   [:suite_id       ms/PositiveInt]
   [:test_type      :keyword]
   [:test_entity_id :string]
   [:position       :int]])

(mr/def ::test-suite.member.response
  "A test in a suite as the API returns it. `:status` says whether the test exists and the caller can read it; only a
  `:readable` member has its `:test_id` and `:name`."
  [:map {:closed true}
   [:test_type      :keyword]
   [:test_entity_id :string]
   [:position       :int]
   [:status         [:enum :readable :unreadable :missing]]
   [:test_id        {:optional true} ms/PositiveInt]
   [:name           {:optional true} :string]])

(mr/def ::test-suite.response
  "A test suite as the API returns it, with its members in order."
  [:merge
   ::test-suite
   [:map {:closed true}
    [:members [:sequential ::test-suite.member.response]]]])

(mr/def ::status
  "The outcome of a test run, or of one of its expectations.

  `:error` is an expectation outcome only: that expectation's own query could not be run, while
  the rest of the run completed and still reported."
  [:enum {:decode/normalize lib.schema.common/normalize-keyword} :passed :failed :error])

(mr/def ::expectation-result.base
  "What every expectation result carries: which expectation this is, and how it came out.

  A `:status` of `error` means this one expectation could not be evaluated while the rest of the
  run still reported; `:error` then says why, and nothing else is reported for it."
  [:map {:closed true}
   [:name    :string]
   [:type    :keyword]
   [:status  ::status]
   [:columns {:optional true} [:sequential ::result-column]]
   [:error   {:optional true} [:map {:closed true}
                               [:type    :keyword]
                               [:message :string]]]])

(mr/def ::expectation-result
  "What one expectation found. Each type owns the schema of its own result, registered under the key
  named here."
  [:multi {:dispatch :type}
   [:equals :metabase-enterprise.data-testing.expectations.equals/result]
   [:empty  :metabase-enterprise.data-testing.expectations.empty/result]])

(mr/def ::run-result
  "The outcome of a test run.

  `:tables` maps each temp table the run created to the table it stood in for."
  [:map {:closed true}
   [:status       ::status]
   [:expectations [:sequential ::expectation-result]]
   [:tables       [:map-of :string :string]]])

(mr/def ::test-suite-run.member-status
  "The outcome of one member of a suite run. Only `:passed` counts as passed.

  `:missing`: no test has the member's type and entity id, its type is one this version does not know, or the thing it
  tests is gone. `:forbidden`: the user who ran the suite may not run the test. `:refused`: the test could not run, as
  its own run endpoint would have refused it. `:error`: the run failed for any other reason."
  [:enum {:decode/normalize lib.schema.common/normalize-keyword}
   :passed :failed :refused :error :forbidden :missing])

(mr/def ::test-suite-run.error
  "Why a member did not run: the `:error_code` of a refusal, as the test's own run endpoint gives it, and a message."
  [:map {:closed true, :decode/normalize lib.schema.common/normalize-map-no-kebab-case}
   [:error_code {:optional true} :string]
   [:message    [:maybe :string]]])

(mr/def ::test-suite-run.stored-member
  "The outcome of one member of a suite run as the run history keeps it: no name and no result, which the reader of the
  history may not be allowed to see."
  [:map {:closed true, :decode/normalize lib.schema.common/normalize-map-no-kebab-case}
   [:test_type        [:keyword {:decode/normalize lib.schema.common/normalize-keyword}]]
   [:test_entity_id   :string]
   [:position         :int]
   [:status           ::test-suite-run.member-status]
   [:data_test_run_id {:optional true} ms/PositiveInt]
   [:error            {:optional true} ::test-suite-run.error]])

(mr/def ::test-suite-run.stored-members
  "The outcomes of the members of a suite run, in order."
  [:sequential ::test-suite-run.stored-member])

(mr/def ::test-suite-run.member
  "The outcome of one member of a suite run, as the run endpoint returns it to the user who ran it: with the test's id
  and name when that user may read the test, and the test's own run result when it ran."
  [:merge
   ::test-suite-run.stored-member
   [:map {:closed true}
    [:test_id {:optional true} ms/PositiveInt]
    [:name    {:optional true} :string]
    [:result  {:optional true} ::run-result]]])

(mr/def ::test-suite-run
  "A run of a test suite. `:members` is nil until the run finishes, and stays nil if the run ended without reaching the
  end. `:suite_id` is nil once the suite is deleted."
  [:map {:closed true}
   [:id             ms/PositiveInt]
   [:suite_id       [:maybe ms/PositiveInt]]
   [:initiated_by   [:maybe ::lib.schema.id/user]]
   [:status         ::run-status]
   [:start_time     ms/TemporalInstant]
   [:end_time       [:maybe ms/TemporalInstant]]
   [:last_heartbeat ms/TemporalInstant]
   [:members        [:maybe ::test-suite-run.stored-members]]])

(mr/def ::test-suite-run.result
  "The outcome of a suite run as the run endpoint returns it."
  [:map {:closed true}
   [:id       ms/PositiveInt]
   [:suite_id ms/PositiveInt]
   [:status   [:enum :passed :failed]]
   [:members  [:sequential ::test-suite-run.member]]])

(mr/def ::test-suite-runs.response
  "A page of the runs of a suite, each with the user who started it."
  [:map {:closed true}
   [:data   [:sequential [:merge
                          ::test-suite-run
                          [:map {:closed true}
                           [:initiated_by_user [:maybe ::user]]]]]]
   [:limit  pos-int?]
   [:offset :int]
   [:total  :int]])

(mr/def ::connection
  "A connection from `driver/do-with-test-connection`: a JDBC connection, or the BigQuery client and session that stand
  in for one."
  [:or
   (ms/InstanceOfClass java.sql.Connection)
   [:map {:closed true}
    [:client     (ms/InstanceOfClass Object)]
    [:session-id :string]]])

(defn- external-test
  "A saved test of schema `saved-test-schema` as serialization writes it, with references in place of ids: its subject
  under `subject-key`."
  [saved-test-schema subject-key]
  [:schema {:registry lib.schema.id/external-registry}
   [:merge
    [:select-keys saved-test-schema [:entity_id :name :description :inputs :expectations subject-key :creator_id]]
    [:map {:closed true}
     [:serdes/meta {:optional true} ::models.schema/external-meta]]]])

(mr/def ::external-transform-test
  "A TransformTest as serialization writes it, with references in place of ids."
  (external-test ::transform-test :transform_id))

(mr/def ::external-test-suite-member
  "A TestSuiteMember as serialization writes it, nested in its suite. It names its test by type and entity id, which
  serialization copies as they are: a suite can name a test the importing instance lacks."
  [:map {:closed true}
   [:test_type      [:or :keyword :string]]
   [:test_entity_id :string]
   [:position       :int]
   [:serdes/meta    {:optional true} ::models.schema/external-meta]])

(mr/def ::external-test-suite
  "A TestSuite as serialization writes it, with its members nested in order."
  [:schema {:registry lib.schema.id/external-registry}
   [:merge
    [:select-keys ::test-suite [:entity_id :name :creator_id]]
    [:map {:closed true}
     [:description {:optional true} [:maybe :string]]
     [:members     {:optional true} [:maybe [:sequential [:ref ::external-test-suite-member]]]]
     [:serdes/meta {:optional true} ::models.schema/external-meta]]]])

(mr/def ::external-card-test
  "A CardTest as serialization writes it, with references in place of ids."
  (external-test ::card-test :card_id))
