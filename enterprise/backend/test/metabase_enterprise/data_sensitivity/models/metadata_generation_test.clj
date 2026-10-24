(ns metabase-enterprise.data-sensitivity.models.metadata-generation-test
  (:require
   [clojure.test :refer [deftest is testing]]
   [java-time.api :as t]
   [metabase-enterprise.data-sensitivity.models.metadata-generation-proposal :as proposal]
   [metabase-enterprise.data-sensitivity.models.metadata-generation-run :as run]
   [metabase.test :as mt]
   [metabase.util.malli.registry :as mr]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(defn- insert-run! [db-id & {:as overrides}]
  (t2/insert-returning-instance! :model/MetadataGenerationRun
                                 (merge {:database_id db-id
                                         :scope       {:type :database}
                                         :attributes  [:data_sensitivity :semantic_type]}
                                        overrides)))

(defn- insert-proposal! [run-id table-id field-id & {:as overrides}]
  (t2/insert-returning-instance! :model/MetadataGenerationProposal
                                 (merge {:last_run_id    run-id
                                         :table_id       table-id
                                         :field_id       field-id
                                         :attribute      :semantic_type
                                         :proposed_value "type/Email"
                                         :confidence     :high
                                         :reasoning      "Values look like email addresses."}
                                        overrides)))

(deftest run-round-trip-test
  (mt/with-temp [:model/User     {user-id :id}  {}
                 :model/Database {db-id :id}    {}
                 :model/Table    {table-id :id} {:db_id db-id}]
    (let [usage {:input_tokens 100 :output_tokens 20 :total_tokens 120 :cost_usd 0.01}
          {run-id :id} (insert-run! db-id
                                    :scope        {:type :tables :table_ids [table-id]}
                                    :creator_id   user-id
                                    :total_tables 1
                                    :table_errors [{:table_id table-id :message "usage limit"}]
                                    :usage        usage)
          row (t2/select-one :model/MetadataGenerationRun run-id)]
      (testing "a new run is pending and active, with keyword status, scope and attributes"
        (is (=? {:status       :pending
                 :is_active    true
                 :scope        {:type :tables :table_ids [table-id]}
                 :attributes   [:data_sensitivity :semantic_type]
                 :total_tables 1
                 :done_tables  0
                 :table_errors [{:table_id table-id :message "usage limit"}]
                 :usage        usage
                 :creator_id   user-id
                 :ended_at     nil}
                row))
        (is (mr/validate ::run/metadata-generation-run row)))
      (testing "the scope schema accepts each scope type"
        (doseq [scope [{:type :database} {:type :schemas :schemas ["PUBLIC"]} {:type :tables :table_ids [1]}]]
          (t2/update! :model/MetadataGenerationRun run-id {:scope scope})
          (is (= scope (t2/select-one-fn :scope :model/MetadataGenerationRun run-id)))
          (is (mr/validate ::run/scope scope))))
      (testing "a move to running keeps the run active"
        (t2/update! :model/MetadataGenerationRun run-id {:status :running})
        (is (=? {:status :running :is_active true :ended_at nil}
                (t2/select-one :model/MetadataGenerationRun run-id))))
      (testing "a terminal status clears is_active and sets ended_at"
        (t2/update! :model/MetadataGenerationRun run-id {:status :succeeded})
        (is (=? {:status :succeeded :is_active nil :ended_at some?}
                (t2/select-one :model/MetadataGenerationRun run-id)))))))

(deftest one-active-run-per-database-test
  (mt/with-temp [:model/Database {db-id :id} {}
                 :model/Database {other-db-id :id} {}]
    (let [{run-id :id} (insert-run! db-id)]
      (testing "a second active run on the same database is refused"
        (is (thrown? Exception (t2/with-transaction [_conn] (insert-run! db-id)))))
      (testing "another database can have its own active run"
        (is (some? (insert-run! other-db-id))))
      (testing "after the first run ends, a new run can start"
        (t2/update! :model/MetadataGenerationRun run-id {:status :canceled})
        (is (some? (insert-run! db-id)))))))

(deftest proposal-round-trip-test
  (mt/with-temp [:model/User     {user-id :id}     {}
                 :model/Database {db-id :id}       {}
                 :model/Database {other-db-id :id} {}
                 :model/Table    {table-id :id}    {:db_id db-id}
                 :model/Field    {field-id :id}    {:table_id table-id}]
    (let [{run-id :id}      (insert-run! db-id)
          {proposal-id :id} (insert-proposal! run-id table-id field-id)
          row               (t2/select-one :model/MetadataGenerationProposal proposal-id)]
      (testing "a new proposal is pending, with keyword attribute and confidence"
        (is (=? {:last_run_id    run-id
                 :table_id       table-id
                 :field_id       field-id
                 :attribute      :semantic_type
                 :proposed_value "type/Email"
                 :confidence     :high
                 :reasoning      "Values look like email addresses."
                 :status         :pending
                 :decided_by     nil}
                row))
        (is (mr/validate ::proposal/metadata-generation-proposal row)))
      (testing "a rejection records the user and time"
        (t2/update! :model/MetadataGenerationProposal proposal-id
                    {:status :rejected :decided_by user-id :decided_at (t/offset-date-time)})
        (is (=? {:status :rejected :decided_by user-id :decided_at some?}
                (t2/select-one :model/MetadataGenerationProposal proposal-id))))
      (testing "a field has one proposal per attribute, across runs"
        (let [{other-run-id :id} (insert-run! other-db-id)]
          (is (thrown? Exception (t2/with-transaction [_conn] (insert-proposal! other-run-id table-id field-id)))))
        (is (some? (insert-proposal! run-id table-id field-id :attribute :description)))))))

(deftest cascade-delete-test
  (testing "deleting a field deletes its proposals"
    (mt/with-temp [:model/Database {db-id :id}    {}
                   :model/Table    {table-id :id} {:db_id db-id}
                   :model/Field    {field-a :id}  {:table_id table-id}
                   :model/Field    {field-b :id}  {:table_id table-id}]
      (let [{run-id :id} (insert-run! db-id)]
        (insert-proposal! run-id table-id field-a)
        (insert-proposal! run-id table-id field-b)
        (t2/delete! :model/Field field-a)
        (is (= #{field-b} (t2/select-fn-set :field_id :model/MetadataGenerationProposal :last_run_id run-id))))))
  (testing "deleting a table deletes its proposals"
    (mt/with-temp [:model/Database {db-id :id}    {}
                   :model/Table    {table-a :id}  {:db_id db-id}
                   :model/Table    {table-b :id}  {:db_id db-id}
                   :model/Field    {field-a :id}  {:table_id table-a}
                   :model/Field    {field-b :id}  {:table_id table-b}]
      (let [{run-id :id} (insert-run! db-id)]
        (insert-proposal! run-id table-a field-a)
        (insert-proposal! run-id table-b field-b)
        (t2/delete! :model/Table table-a)
        (is (= #{table-b} (t2/select-fn-set :table_id :model/MetadataGenerationProposal :last_run_id run-id))))))
  (testing "deleting a run keeps its proposals and clears last_run_id"
    (mt/with-temp [:model/Database {db-id :id}    {}
                   :model/Table    {table-id :id} {:db_id db-id}
                   :model/Field    {field-id :id} {:table_id table-id}]
      (let [{run-id :id}      (insert-run! db-id)
            {proposal-id :id} (insert-proposal! run-id table-id field-id)]
        (t2/delete! :model/MetadataGenerationRun run-id)
        (is (=? {:last_run_id nil} (t2/select-one :model/MetadataGenerationProposal proposal-id))))))
  (testing "deleting a database deletes its runs and the proposals of its fields"
    (mt/with-temp [:model/Database {db-id :id}    {}
                   :model/Table    {table-id :id} {:db_id db-id}
                   :model/Field    {field-id :id} {:table_id table-id}]
      (let [{run-id :id} (insert-run! db-id)]
        (insert-proposal! run-id table-id field-id)
        (t2/delete! :model/Database db-id)
        (is (zero? (t2/count :model/MetadataGenerationRun :database_id db-id)))
        (is (zero? (t2/count :model/MetadataGenerationProposal :field_id field-id))))))
  (testing "deleting a user keeps runs and proposals and clears the user reference"
    (mt/with-temp [:model/User     {user-id :id}  {}
                   :model/Database {db-id :id}    {}
                   :model/Table    {table-id :id} {:db_id db-id}
                   :model/Field    {field-id :id} {:table_id table-id}]
      (let [{run-id :id}      (insert-run! db-id :creator_id user-id)
            {proposal-id :id} (insert-proposal! run-id table-id field-id :decided_by user-id)]
        (t2/delete! :model/User user-id)
        (is (=? {:creator_id nil} (t2/select-one :model/MetadataGenerationRun run-id)))
        (is (=? {:decided_by nil} (t2/select-one :model/MetadataGenerationProposal proposal-id)))))))
