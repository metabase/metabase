(ns metabase-enterprise.data-sensitivity.sync-test
  (:require
   [clojure.test :refer [deftest is testing]]
   [metabase.driver.sql-jdbc.execute :as sql-jdbc.execute]
   [metabase.sync.core :as sync]
   [metabase.test :as mt]
   [next.jdbc :as next.jdbc]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

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
          (sql-jdbc.execute/do-with-connection-with-options
           :h2
           (mt/db)
           {}
           (fn [conn]
             (doseq [sql ["ALTER TABLE \"TABLE\" DROP COLUMN \"CHANGED\";"
                          "ALTER TABLE \"TABLE\" ADD COLUMN \"CHANGED\" INTEGER;"]]
               (next.jdbc/execute! conn [sql]))))
          (sync/sync-table! (t2/select-one :model/Table table-id))
          (is (= :type/Integer (t2/select-one-fn :base_type :model/Field :id changed-id)))
          (is (= #{described other}
                 (t2/select-pks-set :model/MetadataGenerationProposal :id [:in [semantic described other]]))))
        (finally
          (t2/delete! :model/Database (mt/id)))))))
