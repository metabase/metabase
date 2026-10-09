(ns metabase-enterprise.data-apps.generate.schemas.library-test
  (:require
   [clojure.set :as set]
   [clojure.string :as str]
   [clojure.test :refer :all]
   [metabase-enterprise.data-apps.generate.schemas :as schemas]
   [metabase-enterprise.data-apps.generate.schemas.source :as source]
   [metabase-enterprise.data-apps.test-util :as data-apps.tu]
   [metabase.collections.models.collection :as collection]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]
   [toucan2.core :as t2]))

(use-fixtures :once (fixtures/initialize :db :web-server :test-users))

(deftest only-library-content-is-exported-test
  (mt/dataset test-data
    (data-apps.tu/do-with-library!
     (fn [{:keys [data-id metrics-id]}]
       (let [mp (mt/metadata-provider)
             orders-query (lib/query mp (lib.metadata/table mp (mt/id :orders)))
             query (lib/aggregate orders-query
                                  (lib/sum (lib.metadata/field mp (mt/id :orders :total))))]
         (mt/with-temp [:model/Collection nested-data {:type "library-data"
                                                       :location (collection/children-location
                                                                  (t2/select-one :model/Collection :id data-id))}
                        :model/Collection nested-metrics {:type "library-metrics"
                                                          :location (collection/children-location
                                                                     (t2/select-one :model/Collection :id metrics-id))}
                        :model/Collection outside {}
                        :model/Collection lookalike {:type "library-data"}
                        :model/Table published {:db_id (mt/id), :name "library_widgets"
                                                :is_published true, :collection_id data-id}
                        :model/Field _ {:table_id (:id published), :name "price", :base_type :type/Float}
                        :model/Table nested {:db_id (mt/id), :name "nested_widgets"
                                             :is_published true, :collection_id (:id nested-data)}
                        :model/Table _unpublished {:db_id (mt/id), :name "unpublished_widgets"
                                                   :is_published false, :collection_id data-id}
                        :model/Table elsewhere {:db_id (mt/id), :name "outside_widgets"
                                                :is_published true, :collection_id (:id outside)}
                        :model/Table _lookalike {:db_id (mt/id), :name "lookalike_widgets"
                                                 :is_published true, :collection_id (:id lookalike)}
                        :model/Card metric {:name "Library revenue", :type :metric, :display :scalar
                                            :database_id (mt/id), :collection_id metrics-id, :dataset_query query}
                        :model/Card nested-metric {:name "Nested revenue", :type :metric, :display :scalar
                                                   :database_id (mt/id), :collection_id (:id nested-metrics)
                                                   :dataset_query query}
                        :model/Card _outside-metric {:name "Outside revenue", :type :metric, :display :scalar
                                                     :database_id (mt/id), :collection_id (:id outside)
                                                     :dataset_query query}
                        :model/Card _archived-metric {:name "Archived revenue", :type :metric, :display :scalar
                                                      :database_id (mt/id), :collection_id metrics-id
                                                      :dataset_query query, :archived true}
                        :model/Card _model {:name "Outside model", :type :model, :database_id (mt/id)
                                            :collection_id (:id outside), :dataset_query orders-query}]
           (mt/with-test-user :crowberto
             (testing "Library publication works without Git sync, including nested collections"
               (let [items (schemas/fetch-items)]
                 (is (= #{(:id published) (:id nested)} (into #{} (map :id) (:tables items))))
                 (is (= #{(:id metric) (:id nested-metric)} (into #{} (map :id) (:metrics items))))
                 (is (= #{(mt/id :orders)} (into #{} (mapcat :mappedTableIds) (:metrics items))))))
             (testing "explicit IDs cannot bypass Library membership"
               (is (= [] (source/tables source/app-db-source #{(:id elsewhere)})))
               (is (= [] (source/library-tables source/app-db-source #{(:id outside) (:id lookalike)})))
               (is (= [] (source/metrics source/app-db-source #{(:id outside)}))))
             (testing "the HTTP response excludes unpublished content, backing tables, and models"
               (mt/with-premium-features #{:data-apps}
                 (let [body (:body (mt/user-http-request-full-response
                                    :crowberto :get 200 "apps/generate/schemas"))]
                   (doseq [included ["libraryWidgets: {" "nestedWidgets: {" "libraryRevenue: {" "nestedRevenue: {"]]
                     (is (str/includes? body included) included))
                   (doseq [excluded ["unpublishedWidgets" "outsideWidgets" "lookalikeWidgets" "outsideRevenue"
                                     "archivedRevenue" "outsideModel" "orders: {" "models:"]]
                     (is (not (str/includes? body excluded)) excluded)))))
             (testing "moving a metric out of the Library immediately removes it"
               (mt/with-temp-vals-in-db :model/Card (:id metric) {:collection_id (:id outside)}
                 (is (= [(:id nested-metric)]
                        (map :id (source/metrics source/app-db-source #{metrics-id (:id nested-metrics)})))))))))))))

(deftest table-publication-lifecycle-test
  (data-apps.tu/do-with-library!
   (fn [{:keys [data-id]}]
     (mt/with-temp [:model/Database db {}
                    :model/Table table {:db_id (:id db), :name "widgets", :is_published true, :collection_id data-id}
                    :model/Field _ {:table_id (:id table), :name "price", :base_type :type/Float}]
       (mt/with-test-user :crowberto
         (is (= [(:id table)] (map :id (source/tables source/app-db-source #{(:id table)}))))
         (doseq [changes [{:is_published false} {:collection_id nil} {:active false}]]
           (testing (str "table eligibility after " changes)
             (mt/with-temp-vals-in-db :model/Table (:id table) changes
               (is (= [] (source/tables source/app-db-source #{(:id table)}))))))
         (testing "an archived Library collection is excluded"
           (mt/with-temp-vals-in-db :model/Collection data-id {:archived true}
             (is (= [] (source/tables source/app-db-source #{(:id table)}))))))
       (testing "Library publication does not bypass read permissions"
         (mt/with-no-data-perms-for-all-users!
           (mt/with-test-user :rasta
             (is (thrown-with-msg? clojure.lang.ExceptionInfo #"permissions"
                                   (source/tables source/app-db-source #{(:id table)}))))))))))

(deftest only-published-data-actions-are-exported-test
  (mt/with-actions-enabled
    (let [mp (mt/metadata-provider)
          query (lib/native-query mp "UPDATE categories SET name = name")
          model-query (lib/query mp (lib.metadata/table mp (mt/id :categories)))]
      (mt/with-temp [:model/Collection data-actions {:namespace "data-actions"}
                     :model/Collection archived-collection {:namespace "data-actions", :archived true}
                     :model/Collection app-collection {:namespace "data-apps"}
                     :model/Card model {:type :model, :dataset_query model-query}
                     :model/Action root {:name "Root data action", :type :query}
                     :model/QueryAction _ {:action_id (:id root), :dataset_query query}
                     :model/Action nested {:name "Nested data action", :type :query, :collection_id (:id data-actions)}
                     :model/QueryAction _ {:action_id (:id nested), :dataset_query query}
                     :model/Action attached {:name "Model action", :type :query, :model_id (:id model)}
                     :model/QueryAction _ {:action_id (:id attached), :dataset_query query}
                     :model/Action copy {:name "App copy action", :type :query, :collection_id (:id app-collection)}
                     :model/QueryAction _ {:action_id (:id copy), :dataset_query query}
                     :model/Action archived {:name "Archived data action", :type :query, :archived true}
                     :model/QueryAction _ {:action_id (:id archived), :dataset_query query}
                     :model/Action in-archived {:name "Archived collection action", :type :query
                                                :collection_id (:id archived-collection)}
                     :model/QueryAction _ {:action_id (:id in-archived), :dataset_query query}]
        (let [ours (into #{} (map :id) [root nested attached copy archived in-archived])]
          (mt/with-test-user :crowberto
            (testing "only standalone Data Actions are eligible, without Git sync"
              (is (= #{(:id root) (:id nested)}
                     (set/intersection ours (into #{} (map :id) (source/actions source/app-db-source))))))
            (testing "the HTTP response includes root and nested Data Actions and excludes other actions"
              (mt/with-premium-features #{:data-apps}
                (let [body (:body (mt/user-http-request-full-response
                                   :crowberto :get 200 "apps/generate/schemas"))]
                  (doseq [included ["rootDataAction: {" "nestedDataAction: {"]]
                    (is (str/includes? body included) included))
                  (doseq [excluded ["modelAction" "appCopyAction" "archivedDataAction" "archivedCollectionAction"]]
                    (is (not (str/includes? body excluded)) excluded)))))
            (testing "moving a published action into an app collection immediately removes it"
              (mt/with-temp-vals-in-db :model/Action (:id nested) {:collection_id (:id app-collection)}
                (is (= #{(:id root)}
                       (set/intersection ours (into #{} (map :id) (source/actions source/app-db-source)))))))))))))
