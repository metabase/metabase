(ns metabase-enterprise.data-studio.search-test
  "Tests for published tables in search."
  (:require
   [clojure.test :refer :all]
   [medley.core :as m]
   [metabase.collections.models.collection :as collection]
   [metabase.search.core :as search]
   [metabase.test :as mt]
   [metabase.util.random :refer [random-name]]))

(deftest published-table-collection-filter-test
  (mt/with-premium-features #{:library}
    (testing "Published tables are included in collection-filtered search"
      (mt/with-temp
        [:model/Collection {parent-coll :id} {:name "Parent Collection" :location "/"}
         :model/Collection {child-coll :id}  {:name "Child Collection"
                                              :location (collection/location-path parent-coll)}
         :model/Card       {card-1 :id}      {:collection_id parent-coll :name "Parent Card"}
         :model/Table      {table-1 :id}     {:name "Published Table" :is_published true :collection_id parent-coll}
         :model/Table      {table-2 :id}     {:name "Child Published Table" :is_published true :collection_id child-coll}
         :model/Table      {table-3 :id}     {:name "Unpublished Table" :is_published false}
         :model/Table      {table-4 :id}     {:name "Root Published Table" :is_published true :collection_id nil}]
        ;; Initialize search index for appdb engine
        (search/reindex! {:async? false :in-place? true})
        (doseq [engine ["in-place" "appdb"]]
          (testing (str "with engine " engine)
            (testing "Global search"
              (let [results (mt/user-http-request :crowberto :get 200 "search" :search_engine engine)]
                (is (=? [{:collection {:authority_level nil, :id parent-coll, :name "Parent Collection", :type nil}
                          :database_id (mt/id)
                          :id table-1
                          :model "table"
                          :name "Published Table"
                          :table_id table-1
                          :table_name "Published Table"}
                         {:collection {:authority_level nil, :id child-coll, :name "Child Collection", :type nil}
                          :database_id (mt/id)
                          :id table-2
                          :model "table"
                          :name "Child Published Table"
                          :table_id table-2
                          :table_name "Child Published Table"}
                         {:database_id (mt/id)
                          :id table-3
                          :model "table"
                          :name "Unpublished Table"
                          :table_id table-3
                          :table_name "Unpublished Table"}
                         {:collection {:authority_level nil, :id "root", :name "Our analytics", :type nil}
                          :database_id (mt/id)
                          :id table-4
                          :model "table"
                          :name "Root Published Table"
                          :table_id table-4
                          :table_name "Root Published Table"}]
                        (->> (:data results)
                             (filter (comp #{table-1 table-2 table-3 table-4} :id))
                             (sort-by :id))))))
            (testing "Filter by parent collection returns published tables in that collection and descendants"
              (let [results (mt/user-http-request :crowberto :get 200 "search" :collection parent-coll :search_engine engine)]
                (is (=? {:collection {:authority_level nil, :id parent-coll, :name "Parent Collection", :type nil}
                         :database_id (mt/id)
                         :id table-1
                         :model "table"
                         :name "Published Table"
                         :table_id table-1
                         :table_name "Published Table"}
                        (m/find-first (comp #{table-1} :id) (:data results))))
                (is (contains? (set (map :id (:data results))) table-1)
                    "Published table in parent collection should be included")
                (is (contains? (set (map :id (:data results))) table-2)
                    "Published table in child collection should be included")
                (is (contains? (set (map :id (:data results))) card-1)
                    "Card in parent collection should be included")))
            (testing "Unpublished tables are not included in collection filter results"
              (let [results (mt/user-http-request :crowberto :get 200 "search" :collection parent-coll :search_engine engine)]
                (is (not (contains? (set (map :id (:data results))) table-3))
                    "Unpublished table should not be in results")))))))
    (testing "Published tables in root collection (collection_id=nil) appear in unfiltered search"
      (mt/with-temp
        [:model/Table {root-table :id} {:name "Root Published Searchable" :is_published true :collection_id nil}]
        (search/reindex! {:async? false :in-place? true})
        (doseq [engine ["in-place" "appdb"]]
          (testing (str "with engine " engine)
            (let [results (mt/user-http-request :crowberto :get 200 "search" :q "Root Published Searchable" :search_engine engine)]
              (is (some #(= root-table (:id %)) (:data results))
                  "Root published table should appear in search results"))))))
    (testing "Published tables appear as collection items, unpublished as database items"
      (mt/with-temp
        [:model/Database   {db-id :id}       {:name "Context Test DB"}
         :model/Collection {coll-id :id}     {:name "Context Test Collection" :location "/"}
         :model/Table      {pub-table :id}   {:name "ContextTestTablePub"
                                              :db_id db-id
                                              :is_published true
                                              :collection_id coll-id}
         :model/Table      {unpub-table :id} {:name "ContextTestTableUnpub"
                                              :db_id db-id
                                              :is_published false}]
        (search/reindex! {:async? false :in-place? true})
        (doseq [engine ["in-place" "appdb"]]
          (testing (str "with engine " engine)
            (let [results (mt/user-http-request :crowberto :get 200 "search"
                                                :q "Context" :models "table" :search_engine engine)
                  our-result (->> (filter (comp #{pub-table unpub-table} :id) (:data results))
                                  (sort-by :id))]
              (testing "each table appears once"
                (is (=? [{:id pub-table
                          :model "table"
                          :name "ContextTestTablePub"
                          :collection {:id coll-id}
                          :database_name "Context Test DB"}
                         {:id unpub-table
                          :model "table"
                          :name "ContextTestTableUnpub"
                          :collection {:id nil}
                          :database_name "Context Test DB"}]
                        our-result))))))))
    (testing "Collection does not matter for permissions for unpublished tables"
      (let [search-term (random-name)
            name-1 (str search-term " 1")
            name-2 (str search-term " 2")]
        (mt/with-temp [:model/Table {unpub-table :id} {:collection_id nil :is_published false :name name-1}
                       :model/Table {pub-table :id} {:collection_id nil :is_published true :name name-2}]
          (doseq [engine ["in-place" "appdb"]]
            (search/reindex! {:async? false :in-place? true})
            (mt/with-non-admin-groups-no-root-collection-perms
              (let [results (mt/user-http-request :rasta :get 200 "search"
                                                  :q search-term :models "table" :search_engine engine)
                    our-result (->> (filter (comp #{pub-table unpub-table} :id) (:data results))
                                    (sort-by :id)
                                    (map #(select-keys % [:id])))]
                (testing "only the unpublished table appears"
                  (is (= [{:id unpub-table}]
                         our-result)))))))))))
