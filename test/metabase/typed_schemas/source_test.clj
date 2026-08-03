(ns metabase.typed-schemas.source-test
  "Tests [[source/app-db-source]] against real application-database rows.

  Everything downstream of the source works on plain data and is covered by
  cheap in-memory tests; these tests are the seam where typed schemas meet the
  database."
  (:require
   [clojure.test :refer :all]
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
