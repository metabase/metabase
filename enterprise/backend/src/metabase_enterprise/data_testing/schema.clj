(ns metabase-enterprise.data-testing.schema
  "The shapes a transform test is written in, and the only gate they pass: each schema explains its own
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
  "A table read by the transform under test, by schema and name."
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
  "Test data returned by a SQL query run against the transform's source database."
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
  "An input table of the transform under test, replaced with test data."
  [:multi {:decode/normalize lib.schema.common/normalize-map-no-kebab-case
           :dispatch         (comp keyword :format)
           :error/fn         (unknown-dispatch :format)}
   [:sql  [:merge [:map {:closed true, :decode/normalize lib.schema.common/normalize-map-no-kebab-case} [:table ::table]] ::sql-data]]
   [:rows [:merge [:map {:closed true, :decode/normalize lib.schema.common/normalize-map-no-kebab-case} [:table ::table]] ::rows-data]]])

(mr/def ::inputs
  "Test data for the tables the transform reads. Every table it reads needs one, and an input for
  a table it does not read is refused."
  [:sequential ::input])

(mr/def ::expectation.equals
  "A check that the transform output holds exactly the declared rows, over exactly the declared columns."
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
  "A check that a SQL query over the transform output returns no rows."
  [:map {:closed true, :decode/normalize lib.schema.common/normalize-map-no-kebab-case}
   [:type {:decode/normalize lib.schema.common/normalize-keyword} [:= :empty]]
   [:name ::lib.schema.common/non-blank-string]
   [:sql  ::lib.schema.common/non-blank-string]])

(mr/def ::expectation
  "A check on the output of the transform under test."
  [:multi {:decode/normalize lib.schema.common/normalize-map-no-kebab-case
           :dispatch         (comp keyword :type)
           :error/fn         (unknown-dispatch :type)}
   [:equals ::expectation.equals]
   [:empty  ::expectation.empty]])

(mr/def ::expectations
  "The checks run against the transform's output. Names must be unique within a test,
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
  "What a client sends to create a test of the subject that `subject-key` names, a `subject-id`."
  [subject-key subject-id]
  [:merge
   [:map {:closed true}
    [subject-key subject-id]]
   ::test.definition])

(defn- saved-test
  "A saved test of the subject that `subject-key` names, a `subject-id`: the subject, the inputs that stand in for the
  tables it reads, and the expectations checked against its output."
  [subject-key subject-id]
  [:merge
   ::test.definition
   [:map {:closed true}
    [:id          ms/PositiveInt]
    [:entity_id   :string]
    [subject-key  subject-id]
    [:creator_id  ::lib.schema.id/user]
    [:description {:optional true} [:maybe :string]]
    [:created_at  ms/TemporalInstant]
    [:updated_at  ms/TemporalInstant]]])

(defn- test-update
  "What a client sends to update a test of the subject that `subject-key` names, a `subject-id`. Omitted fields are
  left unchanged."
  [subject-key subject-id]
  [:map {:closed true}
   [subject-key   {:optional true} subject-id]
   [:name         {:optional true} ::lib.schema.common/non-blank-string]
   [:description  {:optional true} [:maybe :string]]
   [:inputs       {:optional true} ::inputs]
   [:expectations {:optional true} ::expectations]])

(mr/def ::transform-test.definition
  "A transform test as a client writes it, without the transform it covers."
  ::test.definition)

(mr/def ::transform-test.create
  "What a client sends to create a transform test."
  (test-create :transform_id ::lib.schema.id/transform))

(mr/def ::transform-test
  "A saved transform test."
  (saved-test :transform_id ::lib.schema.id/transform))

(mr/def ::transform-test.update
  "What a client sends to update a transform test. Omitted fields are left unchanged."
  (test-update :transform_id ::lib.schema.id/transform))

(mr/def ::card-test.definition
  "A card test as a client writes it, without the card it covers."
  ::test.definition)

(mr/def ::card-test.create
  "What a client sends to create a card test."
  (test-create :card_id ::lib.schema.id/card))

(mr/def ::card-test
  "A saved card test."
  (saved-test :card_id ::lib.schema.id/card))

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
  that skips model hooks (raw SQL, a database cascade) leaves a `:test_id` that names no test."
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

(mr/def ::status
  "The outcome of a transform test run, or of one of its expectations.

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
  "The outcome of a transform test run.

  `:tables` maps each temp table the run created to the table it stood in for."
  [:map {:closed true}
   [:status       ::status]
   [:expectations [:sequential ::expectation-result]]
   [:tables       [:map-of :string :string]]])

(mr/def ::connection
  "A connection from `driver/do-with-test-connection`: a JDBC connection, or the BigQuery client and session that stand
  in for one."
  [:or
   (ms/InstanceOfClass java.sql.Connection)
   [:map {:closed true}
    [:client     (ms/InstanceOfClass Object)]
    [:session-id :string]]])

(mr/def ::external-transform-test
  "A TransformTest as serialization writes it, with references in place of ids."
  [:schema {:registry lib.schema.id/external-registry}
   [:merge
    [:select-keys ::transform-test [:entity_id :name :description :inputs :expectations :transform_id :creator_id]]
    [:map {:closed true}
     [:serdes/meta {:optional true} ::models.schema/external-meta]]]])
