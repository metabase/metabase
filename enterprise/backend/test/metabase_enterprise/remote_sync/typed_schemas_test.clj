(ns metabase-enterprise.remote-sync.typed-schemas-test
  (:require
   [clojure.string :as str]
   [clojure.test :refer :all]
   [java-time.api :as t]
   [metabase-enterprise.data-apps.test-util :as data-apps.tu]
   [metabase.actions.core :as actions]
   [metabase.collections.test-utils :refer [with-library with-library-synced with-library-not-synced]]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.remote-sync.core :as remote-sync]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]
   [metabase-enterprise.data-apps.generate.schemas :as schemas]
   [metabase-enterprise.data-apps.generate.schemas.source :as source]
   [toucan2.core :as t2]))

(use-fixtures :once (fixtures/initialize :db :web-server :test-users))

(use-fixtures :each
  (fn [f]
    (data-apps.tu/do-with-library! (fn [_] (f)))))

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
            (testing "programmatic generation applies curation"
              (is (= #{(:id table)}
                     (into #{} (map :id) (:tables (schemas/fetch-items))))))
            (testing "the REST route applies the same curation"
              (mt/with-premium-features #{:data-apps}
                (let [body (:body (mt/user-http-request-full-response
                                   :crowberto :get 200 "apps/generate/schemas"))]
                  (is (str/includes? body "widgets: {")))))
            (testing "pending edits use the current local definition"
              (t2/update! :model/RemoteSyncObject (:id tracking)
                          {:status "update", :file_path "tables/widgets.yaml", :content_hash "old-hash"})
              (mt/with-temp-vals-in-db :model/Table (:id table) {:description "Edited widgets"}
                (is (= ["Edited widgets"]
                       (map :description (source/tables source/app-db-source #{(:id table)}))))))
            (testing "selected but never synchronized content is excluded"
              (t2/update! :model/RemoteSyncObject (:id tracking) {:status "create"})
              (is (= [] (source/tables source/app-db-source #{(:id table)}))))
            (t2/update! :model/RemoteSyncObject (:id tracking) {:status "synced"})
            (testing "Git presence does not grant read permission"
              (mt/with-no-data-perms-for-all-users!
                (mt/with-test-user :rasta
                  (is (= [] (source/tables source/app-db-source #{(:id table)}))))))
            (testing "publication and current sync scope still apply"
              (mt/with-temp-vals-in-db :model/Table (:id table) {:is_published false}
                (is (= [] (source/tables source/app-db-source #{(:id table)}))))
              (mt/with-temp-vals-in-db :model/Table (:id table) {:collection_id nil}
                (is (= [] (source/tables source/app-db-source #{(:id table)}))))
              (with-library-not-synced
                (is (= [] (source/tables source/app-db-source #{(:id table)})))))))))))

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
                  (let [schema (schemas/create-schema (schemas/fetch-items))]
                    (is (= {} (:tables schema)))
                    (is (=? {"curatedRevenue" {:id (:id metric), :mappedTableIds [(mt/id :orders)]}}
                            (:metrics schema)))))
                (testing "unpublished and unsynced library backing tables do not hide the metric"
                  (doseq [published? [false true]]
                    (mt/with-temp-vals-in-db :model/Table (mt/id :orders)
                                             {:collection_id (:id data), :is_published published?}
                      (is (= [(:id metric)]
                             (map :id (source/metrics source/app-db-source #{(:id metrics)})))))))
                (testing "metric scope filters still narrow eligible content"
                  (is (= [] (source/metrics source/app-db-source #{}))))
                (testing "an unsynced library returns no metrics"
                  (with-library-not-synced
                    (is (= [] (source/metrics source/app-db-source #{(:id metrics)})))))
                (testing "pending metric edits remain visible"
                  (t2/update! :model/RemoteSyncObject (:id tracking)
                              {:status "update", :file_path "metrics/revenue.yaml", :content_hash "old-hash"})
                  (mt/with-temp-vals-in-db :model/Card (:id metric) {:name "Edited revenue"}
                    (is (= ["Edited revenue"]
                           (map :name (source/metrics source/app-db-source #{(:id metrics)}))))))
                (testing "never-synchronized metrics are excluded"
                  (t2/update! :model/RemoteSyncObject (:id tracking) {:status "create"})
                  (is (= [] (source/metrics source/app-db-source #{(:id metrics)}))))))))))))

(deftest curated-actions-test
  (mt/dataset test-data
    (mt/with-actions-enabled
      (mt/with-temp [:model/Collection synced {:is_remote_synced true}
                     :model/Collection unsynced {}
                     :model/Action action {:name "Update order", :collection_id (:id synced), :type :query
                                           :parameters [{:id "total", :type :number}]}
                     :model/QueryAction _ {:action_id (:id action)
                                           :dataset_query (lib/native-query (mt/metadata-provider)
                                                                            "UPDATE ORDERS SET TOTAL = 1")}
                     :model/Action never-synced {:name "Never synced action", :collection_id (:id synced), :type :query}
                     :model/QueryAction _ {:action_id (:id never-synced)
                                           :dataset_query (lib/native-query (mt/metadata-provider)
                                                                            "UPDATE ORDERS SET TOTAL = 2")}
                     :model/RemoteSyncObject tracking {:model_type "Action", :model_id (:id action)
                                                       :model_name "Action", :status "synced"
                                                       :status_changed_at (t/offset-date-time)}]
        (mt/with-test-user :crowberto
          (testing "only previously synchronized actions are included, even outside the library"
            (is (= [(:id action)]
                   (map :id (source/actions source/app-db-source)))))
          (testing "never-synchronized actions are filtered before details are built"
            (let [select-actions actions/select-actions-for-ids
                  selected-ids (atom [])]
              (mt/with-dynamic-fn-redefs [actions/select-actions-for-ids
                                          (fn [model-ids action-ids]
                                            (swap! selected-ids into action-ids)
                                            (select-actions model-ids action-ids))]
                (source/actions source/app-db-source))
              (is (= [(:id action)] @selected-ids))))
          (testing "pending action edits retain current definitions"
            (t2/update! :model/RemoteSyncObject (:id tracking)
                        {:status "update", :file_path "actions/content.yaml", :content_hash "old-hash"})
            (mt/with-temp-vals-in-db :model/Action (:id action)
                                     {:name "Edited action", :parameters [{:id "note", :type :text, :required true}]}
              (is (=? [{:key "editedAction", :parameters [{:slug "note", :jsType "string", :required true}]}]
                      (source/actions source/app-db-source)))))
          (testing "selected actions without Git presence are omitted"
            (t2/update! :model/RemoteSyncObject (:id tracking) {:status "create"})
            (is (= [] (source/actions source/app-db-source))))
          (t2/update! :model/RemoteSyncObject (:id tracking) {:status "synced"})
          (testing "actions must remain in sync scope even before tracking catches up"
            (mt/with-temp-vals-in-db :model/Collection (:id synced) {:is_remote_synced false}
              (is (= [] (source/actions source/app-db-source))))
            (doseq [collection-id [nil (:id unsynced)]]
              (mt/with-temp-vals-in-db :model/Action (:id action) {:collection_id collection-id}
                (is (= [] (source/actions source/app-db-source)))))))))))

(deftest curated-actions-exclude-data-app-collections-test
  (mt/with-model-cleanup [:model/DataApp :model/Collection :model/PermissionsGroup]
    (mt/with-temp [:model/DataApp app {:name "curated-actions-app"}]
      (let [collection-id (:resource_collection_id app)]
        (is (= :data-apps (t2/select-one-fn :namespace :model/Collection collection-id)))
        (mt/with-temp-vals-in-db :model/Collection collection-id {:is_remote_synced true}
          (mt/with-temp [:model/Action action {:name "App-owned action", :type :query, :collection_id collection-id}
                         :model/QueryAction _ {:action_id (:id action)
                                               :dataset_query (lib/native-query (mt/metadata-provider)
                                                                                "UPDATE categories SET name = name")}
                         :model/RemoteSyncObject _ {:model_type "Action", :model_id (:id action)
                                                    :model_name "App-owned action", :status "synced"
                                                    :status_changed_at (t/offset-date-time)}]
            (mt/with-test-user :crowberto
              (is (not (contains? (into #{} (map :id) (source/actions source/app-db-source))
                                  (:id action)))))))))))
