(ns metabase.typed-schemas.source-test
  "Tests [[source/app-db-source]] against real application-database rows.

  Everything downstream of the source works on plain data and is covered by
  cheap in-memory tests; these tests are the seam where typed schemas meet the
  database."
  (:require
   [clojure.set :as set]
   [clojure.test :refer :all]
   [metabase.collections.models.collection :as collection]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]
   [metabase.typed-schemas.scope :as scope]
   [metabase.typed-schemas.source :as source]
   [metabase.util.malli.registry :as mr]))

(use-fixtures :once (fixtures/initialize :db :test-users))

(deftest database-ids-test
  (mt/with-temp [:model/Database db {:name "Typed Schema Source DB"}]
    (mt/with-current-user (mt/user->id :crowberto)
      (testing "resolves a database by id and by name"
        (is (= #{(:id db)} (source/database-ids source/app-db-source {:id (:id db)})))
        (is (= #{(:id db)} (source/database-ids source/app-db-source {:name "Typed Schema Source DB"}))))
      (testing "an unmatched reference resolves to an empty scope, not nil"
        (is (= #{} (source/database-ids source/app-db-source {:name "__no_such_database__"}))))
      (testing "no reference means unscoped"
        (is (nil? (source/database-ids source/app-db-source nil)))))))

(deftest collection-ids-include-descendants-test
  (mt/with-temp [:model/Collection parent {:name "Parent"}
                 :model/Collection child {:name "Child", :location (format "/%d/" (:id parent))}
                 :model/Collection grandchild {:name "Grandchild"
                                               :location (format "/%d/%d/" (:id parent) (:id child))}]
    (mt/with-current-user (mt/user->id :crowberto)
      (testing "resolves numeric and entity-id references with their descendants"
        (is (= #{(:id parent) (:id child) (:id grandchild)}
               (source/collection-ids source/app-db-source [{:id (:id parent)}])))
        (is (= #{(:id child) (:id grandchild)}
               (source/collection-ids source/app-db-source [{:entity-id (:entity_id child)}]))))
      (testing "no references means unscoped"
        (is (nil? (source/collection-ids source/app-db-source [])))))))

(deftest library-scope-and-library-tables-test
  (mt/with-temp [:model/Collection data-collection {:name "Data Library", :type "library-data"}
                 :model/Collection plain-collection {:name "Not A Library"}
                 :model/Database db {}
                 :model/Table published {:db_id (:id db), :name "published_table", :active true
                                         :is_published true, :collection_id (:id data-collection)}
                 :model/Table _unpublished {:db_id (:id db), :name "unpublished_table", :active true
                                            :is_published false, :collection_id (:id data-collection)}]
    (mt/with-current-user (mt/user->id :crowberto)
      (let [scope (source/library-scope source/app-db-source
                                        {:library-collection-refs [{:id (:id data-collection)}]})]
        (testing "library scope classifies collection ids by type"
          (is (mr/validate scope/LibraryScope scope))
          (is (= {:data-collection-ids   #{(:id data-collection)}
                  :metric-collection-ids #{}}
                 scope)))
        (testing "library tables are the published tables in the data collections"
          (is (= [(:id published)]
                 (map :id (source/library-tables source/app-db-source scope))))))
      (testing "a non-library collection reference is not found"
        (is (thrown-with-msg? clojure.lang.ExceptionInfo
                              #"Collections not found"
                              (source/library-scope source/app-db-source
                                                    {:library-collection-refs [{:id (:id plain-collection)}]})))))))

(deftest metrics-honour-library-collection-scope-test
  (mt/with-temp [:model/Collection root    {:name "Library", :type "library", :location "/"}
                 :model/Collection metrics {:name     "Metrics"
                                            :type     "library-metrics"
                                            :location (collection/children-location root)}
                 :model/Collection child   {:name     "Child"
                                            :type     "library-metrics"
                                            :location (collection/children-location metrics)}
                 :model/Card _metric       {:name          "Library revenue"
                                            :type          :metric
                                            :collection_id (:id child)}]
    (mt/with-test-user :crowberto
      (let [{:keys [metric-collection-ids]}
            (source/library-scope source/app-db-source
                                  {:library-collection-refs [{:id (:id metrics)}]})]
        (is (= ["libraryRevenue"]
               (map :key
                    (source/metrics source/app-db-source nil metric-collection-ids))))
        (is (= []
               (source/metrics source/app-db-source nil #{})))))))

(deftest tables-test
  (mt/with-temp [:model/Database db {}
                 :model/Table table {:db_id (:id db), :name "widgets", :display_name "Widgets", :active true}
                 :model/Field _ {:table_id (:id table), :name "price", :base_type :type/Float}]
    (mt/with-current-user (mt/user->id :crowberto)
      (testing "returns shaped table entities for a database scope"
        (is (=? [{:type   "table"
                  :key    "widgets"
                  :fields {"price" {:jsType "number"}}}]
                (source/tables source/app-db-source #{(:id db)} nil))))
      (testing "an empty table-id scope matches nothing"
        (is (= [] (source/tables source/app-db-source nil #{})))))))

(defn- touch-category-query []
  (let [query (lib/native-query (mt/metadata-provider) "UPDATE categories SET name = name WHERE id = {{id}}")]
    (lib/with-template-tags query (mapv #(assoc % :type :number) (lib/template-tags query)))))

(def ^:private id-parameter
  {:id "id", :slug "id", :type :number/=, :target [:variable [:template-tag "id"]], :required true})

(deftest actions-test
  (mt/with-temp [:model/Database   {other-db-id :id} {}
                 :model/Collection {hidden-coll-id :id} {:name "Hidden actions"}
                 :model/Card       {model-id :id} {:type          :model
                                                   :dataset_query (lib/query (mt/metadata-provider)
                                                                             (lib.metadata/table (mt/metadata-provider)
                                                                                                 (mt/id :categories)))}
                 :model/Action     {standalone :id} {:type :query, :name "Touch category", :parameters [id-parameter]}
                 :model/QueryAction _ {:action_id standalone, :dataset_query (touch-category-query)}
                 :model/Action     {archived :id} {:type :query, :name "Archived", :archived true}
                 :model/QueryAction _ {:action_id archived, :dataset_query (touch-category-query)}
                 :model/Action     {hidden :id} {:type :query, :name "Hidden", :collection_id hidden-coll-id}
                 :model/QueryAction _ {:action_id hidden, :dataset_query (touch-category-query)}
                 :model/Action     {on-model :id} {:type :implicit, :name "On a model", :model_id model-id}]
    (let [action-ids (fn [database-ids] (into #{} (map :id) (source/actions source/app-db-source database-ids)))
          ours       #{standalone archived hidden on-model}]
      (mt/with-current-user (mt/user->id :crowberto)
        (testing "a database scope returns that database's unarchived actions without a model"
          (is (= #{standalone hidden} (set/intersection ours (action-ids #{(mt/id)})))))
        (testing "no scope reads every database"
          (is (= #{standalone hidden} (set/intersection ours (action-ids nil)))))
        (testing "a scope of another database leaves them out"
          (is (= #{} (set/intersection ours (action-ids #{other-db-id})))))
        (testing "an action renders with its parameters typed from the template tag"
          (is (=? [{:kind       "action"
                    :key        "touchCategory"
                    :id         standalone
                    :type       "query"
                    :parameters [{:slug "id", :jsType "number", :required true}]}]
                  (filter #(= standalone (:id %)) (source/actions source/app-db-source #{(mt/id)}))))))
      (testing "an action in a collection the user cannot read is left out"
        (mt/with-non-admin-groups-no-collection-perms hidden-coll-id
          (mt/with-current-user (mt/user->id :rasta)
            (is (not (contains? (action-ids #{(mt/id)}) hidden)))))))))
