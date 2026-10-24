(ns metabase-enterprise.data-sensitivity.sync-test
  (:require
   [clojure.test :refer [deftest is testing]]
   [metabase.driver.sql-jdbc.execute :as sql-jdbc.execute]
   [metabase.lib-be.core :as lib-be]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.sync.core :as sync]
   [metabase.test :as mt]
   [metabase.warehouse-schema.db :as warehouse-schema.db]
   [metabase.warehouse-schema.models.field-user-settings :as field-user-settings]
   [next.jdbc :as next.jdbc]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(defn- insert-semantic-type-proposal!
  "Insert a pending `semantic_type` proposal for the field with `field-id` and return its id."
  [table-id field-id]
  (let [run-id (t2/insert-returning-pk! :model/MetadataGenerationRun
                                        {:database_id (mt/id)
                                         :scope       {:type :database}
                                         :attributes  [:semantic_type]
                                         :status      :succeeded})]
    (t2/insert-returning-pk! :model/MetadataGenerationProposal
                             {:last_run_id    run-id
                              :table_id       table-id
                              :field_id       field-id
                              :attribute      :semantic_type
                              :proposed_value "type/Category"})))

(defn- execute-h2! [& sqls]
  (sql-jdbc.execute/do-with-connection-with-options
   :h2
   (mt/db)
   {}
   (fn [conn]
     (doseq [sql sqls]
       (next.jdbc/execute! conn [sql])))))

(deftest base-type-change-deletes-pending-semantic-type-proposal-test
  (testing "a base type change deletes the pending semantic_type proposal of the field and keeps its other proposals"
    (mt/with-temp-test-data [["table"
                              [{:field-name "changed" :base-type :type/Text}
                               {:field-name "kept" :base-type :type/Text}]
                              [["ngoc@metabase.com" "a"]]]]
      (try
        (sync/sync-table! (t2/select-one :model/Table (mt/id :table)))
        (let [table-id   (mt/id :table)
              changed-id (mt/id :table :changed)
              kept-id    (mt/id :table :kept)
              run-id     (t2/insert-returning-pk! :model/MetadataGenerationRun
                                                  {:database_id (mt/id)
                                                   :scope       {:type :database}
                                                   :attributes  [:semantic_type :description]
                                                   :status      :succeeded})
              proposal!  (fn [field-id attribute value]
                           (t2/insert-returning-pk! :model/MetadataGenerationProposal
                                                    {:last_run_id    run-id
                                                     :table_id       table-id
                                                     :field_id       field-id
                                                     :attribute      attribute
                                                     :proposed_value value}))
              semantic   (proposal! changed-id :semantic_type "type/Email")
              described  (proposal! changed-id :description "An email address.")
              other      (proposal! kept-id :semantic_type "type/Email")]
          (execute-h2! "ALTER TABLE \"TABLE\" DROP COLUMN \"CHANGED\";"
                       "ALTER TABLE \"TABLE\" ADD COLUMN \"CHANGED\" INTEGER;")
          (sync/sync-table! (t2/select-one :model/Table table-id))
          (is (= :type/Integer (t2/select-one-fn :base_type :model/Field :id changed-id)))
          (is (= #{described other}
                 (t2/select-pks-set :model/MetadataGenerationProposal :id [:in [semantic described other]]))))
        (finally
          (t2/delete! :model/Database (mt/id)))))))

(deftest sync-key-type-wins-over-accepted-ai-semantic-type-test
  (testing "a field that sync marks as FK reads type/FK over an accepted AI semantic type and loses its pending semantic_type proposal"
    (mt/with-temp-test-data [["orgs"
                              [{:field-name "name" :base-type :type/Text}]
                              [["Metabase"]]]
                             ["users"
                              [{:field-name "org_id" :base-type :type/Integer}]
                              [[1]]]]
      (try
        (sync/sync-database! (mt/db))
        (let [field-id    (mt/id :users :org_id)
              proposal-id (insert-semantic-type-proposal! (mt/id :users) field-id)]
          (field-user-settings/set-ai-values-for-fields! {field-id {:semantic_type :type/Category}})
          (execute-h2! "ALTER TABLE \"USERS\" ADD FOREIGN KEY (\"ORG_ID\") REFERENCES \"ORGS\" (\"ID\");")
          (sync/sync-table! (t2/select-one :model/Table (mt/id :users)))
          (is (= (mt/id :orgs :id) (t2/select-one-fn :fk_target_field_id :model/Field :id field-id)))
          (is (=? {:semantic_type :type/FK :fk_target_field_id (mt/id :orgs :id)}
                  (warehouse-schema.db/field field-id)))
          (is (=? {:semantic-type :type/FK}
                  (lib.metadata/field (lib-be/application-database-metadata-provider (mt/id)) field-id)))
          (is (not (t2/exists? :model/MetadataGenerationProposal :id proposal-id))))
        (finally
          (t2/delete! :model/Database (mt/id)))))))

(deftest sync-pk-type-wins-over-accepted-ai-semantic-type-test
  (testing "a field that sync marks as PK reads type/PK over an accepted AI semantic type and loses its pending semantic_type proposal"
    (mt/with-temp-test-data [["things"
                              [{:field-name "code" :base-type :type/Integer :not-null? true}]
                              [[1]]]]
      (try
        (sync/sync-database! (mt/db))
        (let [field-id    (mt/id :things :code)
              proposal-id (insert-semantic-type-proposal! (mt/id :things) field-id)]
          (is (nil? (t2/select-one-fn :semantic_type :model/Field :id field-id)))
          (field-user-settings/set-ai-values-for-fields! {field-id {:semantic_type :type/Category}})
          (execute-h2! "ALTER TABLE \"THINGS\" DROP PRIMARY KEY;"
                       "ALTER TABLE \"THINGS\" ADD PRIMARY KEY (\"CODE\");")
          (sync/sync-table! (t2/select-one :model/Table (mt/id :things)))
          (is (=? {:semantic_type :type/PK} (warehouse-schema.db/field field-id)))
          (is (not (t2/exists? :model/MetadataGenerationProposal :id proposal-id))))
        (finally
          (t2/delete! :model/Database (mt/id)))))))
