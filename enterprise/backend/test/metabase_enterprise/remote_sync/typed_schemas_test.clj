(ns metabase-enterprise.remote-sync.typed-schemas-test
  (:require
   [clojure.string :as str]
   [clojure.test :refer :all]
   [java-time.api :as t]
   [metabase.collections.test-utils :refer [with-library with-library-synced with-library-not-synced]]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.remote-sync.core :as remote-sync]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]
   [metabase.typed-schemas.core :as typed-schemas]
   [metabase.typed-schemas.source :as source]
   [toucan2.core :as t2]))

(use-fixtures :once (fixtures/initialize :db :web-server :test-users))

(deftest previously-synced-ids-test
  (doseq [[status metadata qualifies?]
          [["synced" {} true]
           ["update" {:file_path "tables/widgets.yaml", :content_hash "old-hash"} true]
           ["update" {:file_path "tables/widgets.yaml"} false]
           ["update" {:content_hash "old-hash"} false]
           ["update" {} false]
           ["create" {:file_path "tables/widgets.yaml", :content_hash "old-hash"} false]
           ["removed" {:file_path "tables/widgets.yaml", :content_hash "old-hash"} false]
           ["delete" {:file_path "tables/widgets.yaml", :content_hash "old-hash"} false]
           ["error" {:file_path "tables/widgets.yaml", :content_hash "old-hash"} false]]]
    (testing (str status " " metadata)
      (mt/with-temp [:model/RemoteSyncObject _ (merge {:model_type "Table", :model_id 987654
                                                       :model_name "Widgets", :status status
                                                       :status_changed_at (t/offset-date-time)}
                                                      metadata)]
        (is (= (if qualifies? #{987654} #{})
               (remote-sync/previously-synced-ids :model/Table #{987654})))
        (is (= #{} (remote-sync/previously-synced-ids :model/Card #{987654})))
        (is (= #{} (remote-sync/previously-synced-ids :model/Table #{987655}))))))
  (is (= #{} (remote-sync/previously-synced-ids :model/Table #{}))))

(deftest curated-tables-test
  (with-library [{:keys [data]}]
    (with-library-synced
      (mt/with-temp-vals-in-db :model/Collection (:id data) {:is_remote_synced true}
        (mt/with-temp [:model/Database db {}
                       :model/Table table {:db_id (:id db), :name "widgets", :display_name "Widgets"
                                           :is_published true, :collection_id (:id data)}
                       :model/Field _ {:table_id (:id table), :name "price", :base_type :type/Float}
                       :model/RemoteSyncObject tracking {:model_type "Table", :model_id (:id table)
                                                         :model_name "Widgets", :status "synced"
                                                         :status_changed_at (t/offset-date-time)}]
          (mt/with-test-user :crowberto
            (testing "database, library, unscoped, and programmatic generation share curation"
              (doseq [options [{:database {:id (:id db)}}
                               {:library-collection-refs [{:id (:id data)}]}
                               {}]]
                (is (= #{(:id table)}
                       (into #{} (map :id) (vals (:tables (typed-schemas/build-semantic-schema options))))))))
            (testing "the REST route applies the same database curation"
              (let [body (:body (mt/user-http-request-full-response
                                 :crowberto :get 200 "typed-schemas/v1/typescript" :database (:id db)))]
                (is (str/includes? body "widgets: {"))
                (is (str/includes? body "price: {"))))
            (testing "pending edits use the current local definition"
              (t2/update! :model/RemoteSyncObject (:id tracking)
                          {:status "update", :file_path "tables/widgets.yaml", :content_hash "old-hash"})
              (mt/with-temp-vals-in-db :model/Table (:id table) {:description "Edited widgets"}
                (is (= ["Edited widgets"]
                       (map :description (source/tables source/app-db-source #{(:id db)} nil))))))
            (testing "selected but never synchronized content is excluded"
              (t2/update! :model/RemoteSyncObject (:id tracking) {:status "create"})
              (is (= [] (source/tables source/app-db-source #{(:id db)} nil))))
            (t2/update! :model/RemoteSyncObject (:id tracking) {:status "synced"})
            (testing "Git presence does not grant read permission"
              (mt/with-no-data-perms-for-all-users!
                (mt/with-test-user :rasta
                  (is (= [] (source/tables source/app-db-source #{(:id db)} nil))))))
            (testing "publication and current sync scope still apply"
              (mt/with-temp-vals-in-db :model/Table (:id table) {:is_published false}
                (is (= [] (source/tables source/app-db-source #{(:id db)} nil))))
              (mt/with-temp-vals-in-db :model/Table (:id table) {:collection_id nil}
                (is (= [] (source/tables source/app-db-source #{(:id db)} nil))))
              (with-library-not-synced
                (is (= [] (source/tables source/app-db-source #{(:id db)} nil)))))))))))

(deftest curated-metrics-do-not-require-curated-backing-tables-test
  (mt/dataset test-data
    (with-library [{:keys [data metrics]}]
      (with-library-synced
        (mt/with-temp-vals-in-db :model/Collection (:id metrics) {:is_remote_synced true}
          (let [mp (mt/metadata-provider)
                query (lib/aggregate (lib/query mp (lib.metadata/table mp (mt/id :orders)))
                                     (lib/sum (lib.metadata/field mp (mt/id :orders :total))))]
            (mt/with-temp [:model/Card metric {:name "Curated revenue", :type :metric, :display :scalar
                                               :database_id (mt/id), :collection_id (:id metrics)
                                               :dataset_query query}
                           :model/RemoteSyncObject tracking {:model_type "Card", :model_id (:id metric)
                                                             :model_name "Revenue", :status "synced"
                                                             :status_changed_at (t/offset-date-time)}]
              (mt/with-test-user :crowberto
                (testing "an unpublished out-of-library backing table does not hide the metric or become an export"
                  (let [schema (typed-schemas/build-semantic-schema
                                {:library-collection-refs [{:id (:id metrics)}]})]
                    (is (= {} (:tables schema)))
                    (is (=? {"curatedRevenue" {:id (:id metric), :mappedTableIds [(mt/id :orders)]}}
                            (:metrics schema)))))
                (testing "unpublished and unsynced library backing tables do not hide the metric"
                  (doseq [published? [false true]]
                    (mt/with-temp-vals-in-db :model/Table (mt/id :orders)
                                             {:collection_id (:id data), :is_published published?}
                      (is (= [(:id metric)]
                             (map :id (source/metrics source/app-db-source #{(mt/id)} #{(:id metrics)})))))))
                (testing "metric scope filters still narrow eligible content"
                  (is (= [] (source/metrics source/app-db-source #{} #{(:id metrics)})))
                  (is (= [] (source/metrics source/app-db-source #{(mt/id)} #{}))))
                (testing "an unsynced library returns no metrics"
                  (with-library-not-synced
                    (is (= [] (source/metrics source/app-db-source #{(mt/id)} #{(:id metrics)})))))
                (testing "pending metric edits remain visible"
                  (t2/update! :model/RemoteSyncObject (:id tracking)
                              {:status "update", :file_path "metrics/revenue.yaml", :content_hash "old-hash"})
                  (mt/with-temp-vals-in-db :model/Card (:id metric) {:name "Edited revenue"}
                    (is (= ["Edited revenue"]
                           (map :name (source/metrics source/app-db-source #{(mt/id)} #{(:id metrics)}))))))
                (testing "never-synchronized metrics are excluded"
                  (t2/update! :model/RemoteSyncObject (:id tracking) {:status "create"})
                  (is (= [] (source/metrics source/app-db-source #{(mt/id)} #{(:id metrics)}))))))))))))

(deftest curated-actions-test
  (mt/dataset test-data
    (mt/with-actions-enabled
      (let [mp (mt/metadata-provider)
            query (lib/query mp (lib.metadata/table mp (mt/id :orders)))]
        (mt/with-temp [:model/Collection synced {:is_remote_synced true}
                       :model/Card model {:name "Curated model", :type :model, :database_id (mt/id)
                                          :collection_id (:id synced), :dataset_query query}
                       :model/Action action {:name "Update order", :model_id (:id model), :type :query
                                             :parameters [{:id "total", :type :number}]}
                       :model/QueryAction _ {:action_id (:id action), :database_id (mt/id)
                                             :dataset_query {:database (mt/id), :type :native
                                                             :native {:query "UPDATE ORDERS SET TOTAL = 1"}}}
                       :model/Action broken {:name "Never synced broken action", :model_id (:id model), :type :broken}
                       :model/Card broken-model {:name "Never synced broken model", :type :model
                                                 :database_id (mt/id), :collection_id (:id synced), :dataset_query {}}
                       :model/Action _ {:name "Broken model action", :model_id (:id broken-model), :type :broken}
                       :model/RemoteSyncObject model-tracking {:model_type "Card", :model_id (:id model)
                                                               :model_name "Model", :status "synced"
                                                               :status_changed_at (t/offset-date-time)}
                       :model/RemoteSyncObject action-tracking {:model_type "Action", :model_id (:id action)
                                                                :model_name "Action", :status "synced"
                                                                :status_changed_at (t/offset-date-time)}]
          (mt/with-test-user :crowberto
            (testing "only previously synchronized actions are resolved, even outside the library"
              (is (=? {:models [{:key "curatedModel", :actions {"updateOrder" {:id (:id action)}}}], :errors []}
                      (source/models source/app-db-source #{(mt/id)})))
              (is (= ["updateOrder"]
                     (keys (:actions (first (:models (source/models source/app-db-source #{(mt/id)}))))))))
            (testing "eligible broken actions still report generation errors"
              (mt/with-temp [:model/RemoteSyncObject _ {:model_type "Action", :model_id (:id broken)
                                                        :model_name "Broken action", :status "synced"
                                                        :status_changed_at (t/offset-date-time)}]
                (is (=? {:models [], :errors [{:type "modelError", :modelId (:id model)}]}
                        (source/models source/app-db-source #{(mt/id)})))))
            (testing "model and action edits retain current definitions"
              (doseq [tracking [model-tracking action-tracking]]
                (t2/update! :model/RemoteSyncObject (:id tracking)
                            {:status "update", :file_path "models/content.yaml", :content_hash "old-hash"}))
              (mt/with-temp-vals-in-db :model/Action (:id action)
                                       {:name "Edited action", :parameters [{:id "note", :type :text, :required true}]}
                (is (=? {"editedAction" {:parameters [{:slug "note", :jsType "string", :required true}]}}
                        (:actions (first (:models (source/models source/app-db-source #{(mt/id)}))))))))
            (testing "a model without qualifying actions is omitted"
              (t2/update! :model/RemoteSyncObject (:id action-tracking) {:status "create"})
              (is (= {:models [], :errors []} (source/models source/app-db-source #{(mt/id)}))))
            (t2/update! :model/RemoteSyncObject (:id action-tracking) {:status "synced"})
            (testing "models must have synchronized independently and remain in sync scope"
              (t2/update! :model/RemoteSyncObject (:id model-tracking) {:status "create"})
              (is (= {:models [], :errors []} (source/models source/app-db-source #{(mt/id)})))
              (t2/update! :model/RemoteSyncObject (:id model-tracking) {:status "synced"})
              (mt/with-temp-vals-in-db :model/Collection (:id synced) {:is_remote_synced false}
                (is (= {:models [], :errors []} (source/models source/app-db-source #{(mt/id)})))))))))))
