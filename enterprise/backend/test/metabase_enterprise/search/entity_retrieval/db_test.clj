(ns metabase-enterprise.search.entity-retrieval.db-test
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.search.entity-retrieval.db :as entity-retrieval.db]
   [metabase.collections.test-utils :as collections.tu]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]))

(use-fixtures :once (fixtures/initialize :db))

(deftest library-tables-in-collections-test
  (mt/with-premium-features #{:library}
    (collections.tu/with-library [{data :data}]
      (let [data-id (:id data)]
        (mt/with-temp [:model/Collection {other-id :id} {:type     "library-data"
                                                         :location (str (:location data) data-id "/")}
                       :model/Table {published :id} {:name         "library_orders"
                                                     :display_name "Library Orders"
                                                     :description  "Orders in Library"
                                                     :active       true}
                       :model/TableUserSettings _ {:table_id      published
                                                   :is_published  true
                                                   :collection_id data-id
                                                   :display_name  "Settings Orders"}
                       :model/Table {second-published :id} {:name "library_people" :active true}
                       :model/TableUserSettings _ {:table_id second-published :is_published true :collection_id data-id}
                       :model/Table {no-settings :id} {:name "library_no_settings" :active true}
                       :model/Table {unpublished :id} {:name "library_unpublished" :active true}
                       :model/TableUserSettings _ {:table_id unpublished :is_published false}
                       :model/Table {elsewhere :id} {:name "library_elsewhere" :active true}
                       :model/TableUserSettings _ {:table_id elsewhere :is_published true :collection_id other-id}
                       :model/Table {inactive :id} {:name "library_inactive" :active false}
                       :model/TableUserSettings _ {:table_id inactive :is_published true :collection_id data-id}]
          (let [temp-ids  #{published second-published no-settings unpublished elsewhere inactive}
                table-ids (fn [collection-ids id]
                            (into #{}
                                  (comp (map :id) (filter temp-ids))
                                  (entity-retrieval.db/library-tables-in-collections collection-ids id)))]
            (testing "returns only active Tables published into given collections"
              (is (= #{published second-published} (table-ids [data-id] nil)))
              (is (= #{elsewhere} (table-ids [other-id] nil)))
              (is (= #{published second-published elsewhere} (table-ids [data-id other-id] nil))))
            (testing "returns columns of Table itself"
              (is (=? [{:id           published
                        :name         "library_orders"
                        :display_name "Library Orders"
                        :description  "Orders in Library"}]
                      (entity-retrieval.db/library-tables-in-collections [data-id] published))))
            (testing "id narrows to one Table"
              (is (= #{second-published} (table-ids [data-id] second-published)))
              (doseq [id [no-settings unpublished elsewhere inactive]]
                (is (= #{} (table-ids [data-id] id)))))))))))
