(ns metabase-enterprise.data-studio.search-test
  "Tests for published tables in search."
  (:require
   [clojure.test :refer :all]
   [medley.core :as m]
   [metabase.collections.models.collection :as collection]
   [metabase.permissions.core :as perms]
   [metabase.permissions.models.data-permissions :as data-perms]
   [metabase.search.core :as search]
   [metabase.test :as mt]
   [metabase.util.random :refer [random-name]]))

(deftest published-table-collection-filter-test
  (mt/with-premium-features #{:library}
    (testing "Published tables are included in collection-filtered search"
      (mt/with-temp
        [:model/Collection {parent-coll :id} {:name     "Parent Collection"
                                              :location "/"
                                              :type     "library-data"}
         :model/Collection {child-coll :id}  {:name     "Child Collection"
                                              :location (collection/location-path parent-coll)
                                              :type     "library-data"}
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
                (is (=? [{:collection {:authority_level nil, :id parent-coll, :name "Parent Collection", :type "library-data"}
                          :database_id (mt/id)
                          :id table-1
                          :model "table"
                          :name "Published Table"
                          :table_id table-1
                          :table_name "Published Table"}
                         {:collection {:authority_level nil, :id child-coll, :name "Child Collection", :type "library-data"}
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
                (is (=? {:collection {:authority_level nil
                                      :id              parent-coll
                                      :name            "Parent Collection"
                                      :type            "library-data"}
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
                    "Published table in child collection should be included")))
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
        [:model/Database   {db-id :id}       {:name     "Context Test DB"}
         :model/Collection {coll-id :id}     {:name     "Context Test Collection"
                                              :type     "library-data"
                                              :location "/"}
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
    (testing "Users without query permissions cannot discover tables in search"
      (let [search-term (random-name)
            name-1 (str search-term " 1")
            name-2 (str search-term " 2")]
        (mt/with-no-data-perms-for-all-users!
          (mt/with-temp [:model/Table {unpub-table :id} {:collection_id nil :is_published false :name name-1}
                         :model/Table {pub-table :id} {:collection_id nil :is_published true :name name-2}]
            ;; Explicitly deny both view and query perms so this assertion doesn't depend on global defaults.
            (data-perms/set-database-permission! (perms/all-users-group) (mt/id) :perms/view-data :blocked)
            (data-perms/set-database-permission! (perms/all-users-group) (mt/id) :perms/create-queries :no)
            (doseq [engine ["in-place" "appdb"]]
              (search/reindex! {:async? false :in-place? true})
              (mt/with-non-admin-groups-no-root-collection-perms
                (let [results (mt/user-http-request :rasta :get 200 "search"
                                                    :q search-term :models "table" :search_engine engine)
                      our-result (->> (filter (comp #{pub-table unpub-table} :id) (:data results))
                                      (sort-by :id)
                                      (map #(select-keys % [:id])))]
                  (testing "no tables appear"
                    (is (= []
                           our-result))))))))))))

(deftest published-table-visible-with-data-perms-but-no-collection-access-test
  (mt/with-premium-features #{:library}
    (testing "Published table is discoverable when user has data permissions but no collection access"
      (let [search-term (random-name)
            table-name  (str search-term " published")]
        (mt/with-no-data-perms-for-all-users!
          (mt/with-temp [:model/Collection {coll-id :id} {:name     "No Access Collection"
                                                          :location "/"
                                                          :type     "library-data"}
                         :model/Table      {pub-table :id} {:name table-name :is_published true :collection_id coll-id}]
            ;; Grant data permissions on the table
            (data-perms/set-database-permission! (perms/all-users-group) (mt/id) :perms/view-data :unrestricted)
            (data-perms/set-database-permission! (perms/all-users-group) (mt/id) :perms/create-queries :query-builder)
            (doseq [engine ["in-place" "appdb"]]
              (search/reindex! {:async? false :in-place? true})
              ;; Remove collection permissions so the user has data perms but NO collection access
              (mt/with-non-admin-groups-no-root-collection-perms
                (let [result-ids (->> (mt/user-http-request :rasta :get 200 "search"
                                                            :q search-term :models "table" :search_engine engine)
                                      :data
                                      (map :id)
                                      (into #{}))]
                  (is (contains? result-ids pub-table)
                      (format "Published table should be visible with data permissions even without collection access (engine=%s)"
                              engine)))))))))))

(deftest library-scoped-search-test
  (mt/with-premium-features #{:library}
    (let [search-term (random-name)]
      (mt/with-temp
        [:model/Collection {lib-id :id}          {:name "Library" :type collection/library-collection-type :location "/"}
         :model/Collection {data-coll :id}       {:name "Data"
                                                  :type collection/library-data-collection-type
                                                  :location (collection/location-path lib-id)}
         :model/Collection {metrics-coll :id}    {:name "Metrics"
                                                  :type collection/library-metrics-collection-type
                                                  :location (collection/location-path lib-id)}
         :model/Collection {data-sub :id}        {:name "Data Sub"
                                                  :type collection/library-data-collection-type
                                                  :location (collection/location-path lib-id data-coll)}
         :model/Table      {pub-table :id}       {:name          (str search-term " Published Table")
                                                  :is_published  true
                                                  :collection_id data-coll}
         :model/Table      {sub-table :id}       {:name          (str search-term " Sub Table")
                                                  :is_published  true
                                                  :collection_id data-sub}
         :model/Card       {metric :id}          {:name          (str search-term " My Metric")
                                                  :type          :metric
                                                  :collection_id metrics-coll}
         :model/Collection {outside-coll :id}    {:name "Outside" :location "/"}
         :model/Card       {outside-card :id}    {:name          (str search-term " Outside Card")
                                                  :collection_id outside-coll}]
        (search/reindex! {:async? false :in-place? true})
        (doseq [engine ["in-place" "appdb"]]
          (testing (str "with engine " engine)
            (let [results    (mt/user-http-request :crowberto :get 200 "search"
                                                   :q search-term
                                                   :collection lib-id
                                                   :search_engine engine)
                  result-ids (set (map :id (:data results)))]
              (testing "published tables in library subcollections are included"
                (is (contains? result-ids pub-table))
                (is (contains? result-ids sub-table)))
              (testing "metrics in library subcollections are included"
                (is (contains? result-ids metric)))
              (testing "items outside the library are excluded"
                (is (not (contains? result-ids outside-card)))))))))))

(deftest unpublished-table-visible-with-data-perms-test
  (testing "Unpublished tables are discoverable when the user has data/query permissions"
    (let [search-term (random-name)
          table-name  (str search-term " unpublished")]
      (mt/with-no-data-perms-for-all-users!
        (mt/with-temp [:model/Table {unpub-table :id} {:collection_id nil :is_published false :name table-name}]
          ;; Explicitly grant data/query perms so this does not rely on global test defaults.
          (data-perms/set-database-permission! (perms/all-users-group) (mt/id) :perms/view-data :unrestricted)
          (data-perms/set-database-permission! (perms/all-users-group) (mt/id) :perms/create-queries :query-builder)
          (doseq [engine ["in-place" "appdb"]]
            (search/reindex! {:async? false :in-place? true})
            (mt/with-non-admin-groups-no-root-collection-perms
              (let [result-ids (->> (mt/user-http-request :rasta :get 200 "search"
                                                          :q search-term :models "table" :search_engine engine)
                                    :data
                                    (map :id)
                                    (into #{}))]
                (is (contains? result-ids unpub-table)
                    (format "Unpublished table should be visible with data permissions (engine=%s)" engine))))))))))

(deftest no-access-library-subcollection-hidden-from-search-test
  (mt/with-premium-features #{:library}
    (testing "Items in library subcollections the user can't access are hidden from search"
      (let [search-term (random-name)]
        (mt/with-temp
          [:model/Collection {metrics-coll :id}   {:name     "Metrics"
                                                   :type     collection/library-metrics-collection-type
                                                   :location "/"}
           :model/Collection {accessible :id}     {:name     "Accessible Sub"
                                                   :type     collection/library-metrics-collection-type
                                                   :location (collection/location-path metrics-coll)}
           :model/Collection {no-access :id}      {:name     "No Access Sub"
                                                   :type     collection/library-metrics-collection-type
                                                   :location (collection/location-path metrics-coll)}
           :model/Card       {visible-metric :id} {:name          (str search-term " Visible Metric")
                                                   :type          :metric
                                                   :collection_id accessible}
           :model/Card       {hidden-metric :id}  {:name          (str search-term " Hidden Metric")
                                                   :type          :metric
                                                   :collection_id no-access}]
          (mt/with-non-admin-groups-no-root-collection-perms
            (perms/grant-collection-read-permissions! (perms/all-users-group) metrics-coll)
            (perms/grant-collection-read-permissions! (perms/all-users-group) accessible)
            (perms/revoke-collection-permissions! (perms/all-users-group) no-access)
            (search/reindex! {:async? false :in-place? true})
            (doseq [engine ["in-place" "appdb"]]
              (testing (str "with engine " engine)
                (let [result-ids (->> (mt/user-http-request :rasta :get 200 "search"
                                                            :q search-term :search_engine engine)
                                      :data
                                      (map :id)
                                      (into #{}))]
                  (testing "metric in accessible subcollection is visible"
                    (is (contains? result-ids visible-metric)))
                  (testing "metric in no-access subcollection is hidden"
                    (is (not (contains? result-ids hidden-metric)))))))))))))
