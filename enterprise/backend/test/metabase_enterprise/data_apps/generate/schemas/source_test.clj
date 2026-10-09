(ns metabase-enterprise.data-apps.generate.schemas.source-test
  "Tests [[schemas.source/app-db-source]] against real application-database rows.

  Everything downstream of the source works on plain data and is covered by
  cheap in-memory tests; these tests are the seam where the data app schema meets the
  database."
  (:require
   [clojure.set :as set]
   [clojure.test :refer :all]
   [metabase-enterprise.data-apps.generate.schemas.source :as schemas.source]
   [metabase-enterprise.data-apps.test-util :as data-apps.tu]
   [metabase.collections.models.collection :as collection]
   [metabase.lib-be.core :as lib-be]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]
   [metabase.util.malli.registry :as mr]
   [toucan2.core :as t2]))

(use-fixtures :once (fixtures/initialize :db :test-users))

(deftest library-scope-and-library-tables-test
  (data-apps.tu/do-with-library!
   (fn [{:keys [data-id metrics-id]}]
     (mt/with-temp [:model/Collection data-child {:name     "Data child"
                                                  :type     "library-data"
                                                  :location (collection/children-location (t2/select-one :model/Collection :id data-id))}
                    :model/Collection plain-collection {:name "Not A Library"}
                    :model/Database db {}
                    :model/Table published {:db_id (:id db), :name "published_table", :active true
                                            :is_published true, :collection_id data-id}
                    :model/Table nested {:db_id (:id db), :name "nested_table", :active true
                                         :is_published true, :collection_id (:id data-child)}
                    :model/Table _unpublished {:db_id (:id db), :name "unpublished_table", :active true
                                               :is_published false, :collection_id data-id}
                    :model/Table _elsewhere {:db_id (:id db), :name "elsewhere_table", :active true
                                             :is_published true, :collection_id (:id plain-collection)}]
       (mt/with-current-user (mt/user->id :crowberto)
         (let [scope (schemas.source/library-scope schemas.source/app-db-source)]
           (testing "library scope classifies the root libraries' collections by type"
             (is (mr/validate schemas.source/LibraryScope scope))
             (is (= {:data-collection-ids   #{data-id (:id data-child)}
                     :metric-collection-ids #{metrics-id}}
                    scope)))
           (testing "library tables are the published tables in the data collections and their descendants"
             (is (= #{(:id published) (:id nested)}
                    (into #{}
                          (map :id)
                          (schemas.source/library-tables schemas.source/app-db-source (:data-collection-ids scope)))))
             (is (= [] (schemas.source/library-tables schemas.source/app-db-source #{}))))))))))

(deftest metrics-honour-collection-ids-test
  (data-apps.tu/do-with-library!
   (fn [{:keys [metrics-id]}]
     (mt/with-temp [:model/Collection child {:name     "Child"
                                             :type     "library-metrics"
                                             :location (collection/children-location (t2/select-one :model/Collection :id metrics-id))}
                    :model/Card _metric     {:name          "Library revenue"
                                             :type          :metric
                                             :collection_id (:id child)}]
       (mt/with-test-user :crowberto
         (let [{:keys [metric-collection-ids]} (schemas.source/library-scope schemas.source/app-db-source)]
           (is (some #{"libraryRevenue"}
                     (map :key (schemas.source/metrics schemas.source/app-db-source metric-collection-ids))))
           (is (= [] (schemas.source/metrics schemas.source/app-db-source #{})))))))))

(deftest tables-test
  (mt/with-temp [:model/Database db {}
                 :model/Table table {:db_id (:id db), :name "widgets", :display_name "Widgets", :active true}
                 :model/Field _ {:table_id (:id table), :name "price", :base_type :type/Float}]
    (mt/with-current-user (mt/user->id :crowberto)
      (testing "explicit table ids do not bypass library publication"
        (is (= [] (schemas.source/tables schemas.source/app-db-source #{(:id table)}))))
      (testing "an empty table-id set matches nothing"
        (is (= [] (schemas.source/tables schemas.source/app-db-source #{})))))))

(defn- touch-category-query []
  (let [query (lib/native-query (mt/metadata-provider) "UPDATE categories SET name = name WHERE id = {{id}}")]
    (lib/with-template-tags query (mapv #(assoc % :type :number) (lib/template-tags query)))))

(def ^:private id-parameter
  {:id "id", :slug "id", :type :number/=, :target [:variable [:template-tag "id"]], :required true})

(deftest actions-test
  (mt/with-temp [:model/Collection {collection-id :id} {:name "Actions" :namespace "data-actions"}
                 :model/Collection {app-collection-id :id} {:name "Data App: orders" :namespace "data-apps"}
                 :model/Card       {model-id :id} {:type          :model
                                                   :dataset_query (lib/query (mt/metadata-provider)
                                                                             (lib.metadata/table (mt/metadata-provider)
                                                                                                 (mt/id :categories)))}
                 :model/Action     {standalone :id} {:type :query, :name "Touch category", :parameters [id-parameter]}
                 :model/QueryAction _ {:action_id standalone, :dataset_query (touch-category-query)}
                 :model/Action     {archived :id} {:type :query, :name "Archived", :archived true}
                 :model/QueryAction _ {:action_id archived, :dataset_query (touch-category-query)}
                 :model/Action     {in-collection :id} {:type :query, :name "In a collection", :collection_id collection-id}
                 :model/QueryAction _ {:action_id in-collection, :dataset_query (touch-category-query)}
                 :model/Action     {on-model :id} {:type :query, :name "On a model", :model_id model-id}
                 :model/QueryAction _ {:action_id on-model, :dataset_query (touch-category-query)}
                 :model/Action     {app-copy :id} {:type :query, :name "App copy", :collection_id app-collection-id}
                 :model/QueryAction _ {:action_id app-copy, :dataset_query (touch-category-query)}]
    (let [action-ids (fn [] (into #{} (map :id) (schemas.source/actions schemas.source/app-db-source)))
          ours       #{standalone archived in-collection on-model app-copy}]
      (mt/with-current-user (mt/user->id :crowberto)
        (testing "returns unarchived Data Actions without a model and excludes data app copies"
          (is (= #{standalone in-collection} (set/intersection ours (action-ids)))))
        (testing "an action renders with its parameters typed from the template tag"
          (is (=? [{:kind       "action"
                    :key        "touchCategory"
                    :id         standalone
                    :type       "query"
                    :parameters [{:slug "id", :jsType "number", :required true}]}]
                  (filter #(= standalone (:id %)) (schemas.source/actions schemas.source/app-db-source)))))))))

(deftest actions-leave-out-those-backed-by-a-routing-destination-test
  (mt/with-temp [:model/Database {router-id :id}      {}
                 :model/Database {destination-id :id} {:router_database_id router-id}
                 :model/Action    {open :id}          {:type :query, :name "Open action"}
                 :model/QueryAction _ {:action_id open, :dataset_query (touch-category-query)}
                 :model/Action    {routed :id}        {:type :query, :name "Routed action"}
                 :model/QueryAction _ {:action_id      routed
                                       :dataset_query (lib/native-query (lib-be/application-database-metadata-provider destination-id)
                                                                        "UPDATE categories SET name = name")}]
    (mt/with-current-user (mt/user->id :crowberto)
      (let [ids (into #{} (map :id) (schemas.source/actions schemas.source/app-db-source))]
        (is (contains? ids open))
        (is (not (contains? ids routed)))))))
