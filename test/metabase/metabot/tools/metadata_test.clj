(ns metabase.metabot.tools.metadata-test
  (:require
   [clojure.test :refer :all]
   [metabase.metabot.tools.metadata :as metadata-tools]
   [metabase.models.interface :as mi]
   [metabase.test :as mt]
   [metabase.util.malli :as mu]
   [toucan2.core :as t2]))

(deftest get-field-values-tool-rejects-destination-database-table-test
  (testing "get_field_values for a table on a destination (routed) database is rejected before it ever
            reaches field-stats -- a destination database is a routing internal, not a resource users
            should reach directly (see check-resource-database)"
    (mt/with-current-user (mt/user->id :crowberto)
      (mt/with-temp [:model/Database {router-id :id}      {}
                     :model/Database {destination-id :id} {:router_database_id router-id}]
        ;; A table can't exist on a destination in production (destinations aren't synced), so a normal
        ;; `with-temp :model/Table` trips a different guard. Insert it directly, like
        ;; `read-destination-backed-entities-return-errors-test` does for the read_resource tool.
        (let [table-id (t2/insert-returning-pk! (t2/table-name :model/Table)
                                                {:db_id      destination-id
                                                 :name       "destination-table"
                                                 :active     true
                                                 :created_at :%now
                                                 :updated_at :%now})]
          (with-redefs [mi/can-read? (constantly true)]
            (is (thrown-with-msg? clojure.lang.ExceptionInfo #"Not found\."
                                  (metadata-tools/get-field-values-tool
                                   {:data_source "table" :source_id table-id :field_id 1})))))))))

(deftest get-field-values-tool-rejects-destination-database-card-test
  (testing "get_field_values for a model/metric on a destination (routed) database is rejected before it
            ever reaches field-stats"
    (mt/with-current-user (mt/user->id :crowberto)
      (mt/with-temp [:model/Database {router-id :id}      {}
                     :model/Database {destination-id :id} {:router_database_id router-id}
                     :model/Card     {model-id :id}       {:type :model :database_id destination-id}
                     :model/Card     {metric-id :id}      {:type :metric :database_id destination-id}]
        (with-redefs [mi/can-read? (constantly true)]
          (testing "model"
            (is (thrown-with-msg? clojure.lang.ExceptionInfo #"Not found\."
                                  (metadata-tools/get-field-values-tool
                                   {:data_source "model" :source_id model-id :field_id 1}))))
          (testing "metric"
            (is (thrown-with-msg? clojure.lang.ExceptionInfo #"Not found\."
                                  (metadata-tools/get-field-values-tool
                                   {:data_source "metric" :source_id metric-id :field_id 1})))))))))

(deftest get-field-values-tool-supports-question-and-report-data-source-test
  (testing "get_field_values recognizes \"question\"/\"report\" as card-backed data sources -- the same
            guard applied to \"model\"/\"metric\" -- instead of throwing on an unmatched case clause"
    (mt/with-current-user (mt/user->id :crowberto)
      (mt/with-temp [:model/Database {router-id :id}      {}
                     :model/Database {destination-id :id} {:router_database_id router-id}
                     :model/Card     {question-id :id}    {:type :question :database_id destination-id}]
        (with-redefs [mi/can-read? (constantly true)]
          (doseq [data-source ["question" "report"]]
            (testing data-source
              (is (thrown-with-msg? clojure.lang.ExceptionInfo #"Not found\."
                                    (metadata-tools/get-field-values-tool
                                     {:data_source data-source :source_id question-id :field_id 1}))))))))))

(deftest get-field-values-tool-unknown-data-source-test
  (testing "an unexpected data_source -- e.g. because the schema that constrains it isn't enforced in
            production -- doesn't throw before reaching field-values, which reports it gracefully"
    (mt/as-admin
      (mu/disable-enforcement
        (is (=? {:output #"Unknown data source type: bogus"}
                (metadata-tools/get-field-values-tool
                 {:data_source "bogus" :source_id 1 :field_id 1})))))))

(deftest get-metadata-rejects-destination-database-table-test
  (testing "list_available_fields for a table on a destination (routed) database is rejected before it
            ever reaches entity-details -- a destination database is a routing internal, not a resource
            users should reach directly (see check-resource-database)"
    (mt/with-current-user (mt/user->id :crowberto)
      (mt/with-temp [:model/Database {router-id :id}      {}
                     :model/Database {destination-id :id} {:router_database_id router-id}]
        (let [table-id (t2/insert-returning-pk! (t2/table-name :model/Table)
                                                {:db_id      destination-id
                                                 :name       "destination-table"
                                                 :active     true
                                                 :created_at :%now
                                                 :updated_at :%now})]
          (with-redefs [mi/can-read? (constantly true)]
            (let [{:keys [structured-output]} (metadata-tools/get-metadata {:table-ids [table-id]})]
              (is (= [] (:tables structured-output)))
              (is (= 1 (count (:errors structured-output))))
              (is (re-find #"Not found\." (first (:errors structured-output)))))))))))

(deftest get-metadata-rejects-destination-database-card-test
  (testing "list_available_fields for a model/metric on a destination (routed) database is rejected
            before it ever reaches entity-details"
    (mt/with-current-user (mt/user->id :crowberto)
      (mt/with-temp [:model/Database {router-id :id}      {}
                     :model/Database {destination-id :id} {:router_database_id router-id}
                     :model/Card     {model-id :id}       {:type :model :database_id destination-id}
                     :model/Card     {metric-id :id}      {:type :metric :database_id destination-id}]
        (with-redefs [mi/can-read? (constantly true)]
          (let [{:keys [structured-output]} (metadata-tools/get-metadata {:model-ids  [model-id]
                                                                          :metric-ids [metric-id]})]
            (is (= [] (:models structured-output)))
            (is (= [] (:metrics structured-output)))
            (is (= 2 (count (:errors structured-output))))))))))
