(ns metabase-enterprise.library.validation-test
  (:require
   [clojure.test :refer :all]
   [metabase.collections.models.collection :as collection]
   [metabase.test :as mt]
   [toucan2.core :as t2]))

(deftest allowed-content-doesnt-block-regular-collections
  (mt/with-premium-features #{:library}
    (mt/with-temp [:model/Collection regular-collection {:name "Regular Collection" :type nil}]
      (testing "Regular collections can add anything"
        (is (some? (t2/insert! :model/Collection (merge (mt/with-temp-defaults :model/Collection) {:location (str "/" (:id regular-collection) "/")}))))
        (is (some? (t2/insert! :model/Card (merge (mt/with-temp-defaults :model/Card) {:type :model, :collection_id (:id regular-collection)}))))
        (is (some? (t2/insert! :model/Card (merge (mt/with-temp-defaults :model/Card) {:type :metric, :collection_id (:id regular-collection)}))))
        (is (some? (t2/insert! :model/Dashboard (merge (mt/with-temp-defaults :model/Dashboard) {:collection_id (:id regular-collection)}))))))))

(deftest library-completely-locked-down
  (mt/with-premium-features #{:library}
    (mt/with-temp [:model/Collection no-allowed-content {:name "Test No Content" :type collection/library-collection-type}]
      (testing "Cannot add anything to library collections"
        (is (thrown-with-msg? clojure.lang.ExceptionInfo #"Cannot add anything to the Library collection"
                              (t2/insert! :model/Collection (merge (mt/with-temp-defaults :model/Collection) {:location (str "/" (:id no-allowed-content) "/")}))))
        (is (thrown-with-msg? clojure.lang.ExceptionInfo #"Cannot add anything to the Library collection"
                              (t2/insert! :model/Card (merge (mt/with-temp-defaults :model/Card) {:type :model, :collection_id (:id no-allowed-content)}))))
        (is (thrown-with-msg? clojure.lang.ExceptionInfo #"Cannot add anything to the Library collection"
                              (t2/insert! :model/Card (merge (mt/with-temp-defaults :model/Card) {:type :metric :collection_id (:id no-allowed-content)}))))
        (is (thrown-with-msg? clojure.lang.ExceptionInfo #"Cannot add anything to the Library collection"
                              (t2/insert! :model/Dashboard (merge (mt/with-temp-defaults :model/Dashboard) {:collection_id (:id no-allowed-content)}))))))))

(deftest check-allowed-content-table
  (mt/with-premium-features #{:library}
    (mt/with-temp [:model/Collection allow-tables {:name "Test Base Library" :type collection/library-data-collection-type}]
      (testing "Can only add allowed content types"
        (mt/with-temp [:model/Table table {:collection_id (:id allow-tables)
                                           :is_published  true}]
          (is (some? table)))
        (is (thrown-with-msg? clojure.lang.ExceptionInfo #"Can only add tables to the 'Data' collection"
                              (t2/insert! :model/Card (merge (mt/with-temp-defaults :model/Card) {:type :model :collection_id (:id allow-tables)}))))
        (is (thrown-with-msg? clojure.lang.ExceptionInfo #"Can only add tables to the 'Data' collection"
                              (t2/insert! :model/Card (merge (mt/with-temp-defaults :model/Card) {:type :metric :collection_id (:id allow-tables)}))))
        (is (thrown-with-msg? clojure.lang.ExceptionInfo #"Can only add tables to the 'Data' collection"
                              (t2/insert! :model/Dashboard (merge (mt/with-temp-defaults :model/Dashboard) {:collection_id (:id allow-tables)})))))

      (testing "Can add collections iff they have the same :type"
        (let [new-coll (merge (mt/with-temp-defaults :model/Collection)
                              {:location (str "/" (:id allow-tables) "/")})]
          (is (thrown-with-msg? clojure.lang.ExceptionInfo #"Can only add tables to the 'Data' collection"
                                (t2/insert! :model/Collection new-coll))
              "basic new collection is rejected")
          (is (= 1 (t2/insert! :model/Collection (assoc new-coll :type collection/library-data-collection-type)))
              "new collection with :type set is allowed"))))))

(deftest check-allowed-content-metric
  (mt/with-premium-features #{:library}
    (mt/with-temp [:model/Collection allow-metrics {:name "Test Base Library" :type collection/library-metrics-collection-type}]
      (testing "Can only add allowed content types"
        (mt/with-temp [:model/Card card {:collection_id (:id allow-metrics)
                                         :type          :metric}]
          (is (some? card)))
        (is (thrown-with-msg? clojure.lang.ExceptionInfo #"Can only add metrics to the 'Metrics' collection"
                              (t2/insert! :model/Card (merge (mt/with-temp-defaults :model/Card) {:type :model :collection_id (:id allow-metrics)}))))
        (is (thrown-with-msg? clojure.lang.ExceptionInfo #"Can only add metrics to the 'Metrics' collection"
                              (t2/insert! :model/Dashboard (merge (mt/with-temp-defaults :model/Dashboard) {:collection_id (:id allow-metrics)})))))
      (testing "Can add collections iff they have the same :type"
        (let [new-coll (merge (mt/with-temp-defaults :model/Collection)
                              {:location (str "/" (:id allow-metrics) "/")})]
          (is (thrown-with-msg? clojure.lang.ExceptionInfo #"Can only add metrics to the 'Metrics' collection"
                                (t2/insert! :model/Collection new-coll))
              "basic new collection is rejected")
          (is (= 1 (t2/insert! :model/Collection (assoc new-coll :type collection/library-metrics-collection-type)))
              "new collection with :type set is allowed"))))))

(deftest tables-cannot-be-moved-to-non-library-data-collections
  (mt/with-premium-features #{:library}
    (mt/with-temp [:model/Collection library-data {:name "Library Data" :type collection/library-data-collection-type}
                   :model/Collection regular      {:name "Regular Collection" :type nil}
                   :model/Table      table        {:collection_id (:id library-data)
                                                   :is_published  true}]
      (testing "Cannot insert a published table into a regular collection"
        (is (thrown-with-msg? clojure.lang.ExceptionInfo #"Tables can only be added to"
                              (t2/insert! :model/Table (merge (mt/with-temp-defaults :model/Table)
                                                              {:collection_id (:id regular)
                                                               :is_published  true})))))
      (testing "Cannot move a published table to a regular collection"
        (is (thrown-with-msg? clojure.lang.ExceptionInfo #"Tables can only be added to"
                              (t2/update! :model/Table (:id table) {:collection_id (:id regular)}))))
      (testing "Can move a table out to no collection"
        (is (some? (t2/update! :model/Table (:id table) {:collection_id nil})))))))

(deftest cannot-update-library-collections
  (mt/with-premium-features #{:library}
    (mt/with-temp [:model/Collection library {:name "Test Library" :type collection/library-collection-type}
                   :model/Collection models {:name "Test Semantic Model Layer" :type collection/library-data-collection-type}
                   :model/Collection metrics {:name "Test Semantic Metrics Layer" :type collection/library-metrics-collection-type}]
      (with-redefs [collection/library-root-collection? (constantly true)]
        (doseq [col [library models metrics]]
          (testing (str "Checking type " (:type col))
            (is (thrown-with-msg? clojure.lang.ExceptionInfo
                                  #"Cannot update properties on a Library collection"
                                  (t2/update! :model/Collection (:id col) {:name "New Name"})))))))))

(deftest unpublish-tables-in-archived-collection-test
  (mt/with-premium-features #{:library}
    (mt/as-admin
      (mt/with-temp [:model/Collection archive-me {:name   "To be archived"
                                                   :type   collection/library-data-collection-type}
                     :model/Table      table      {:collection_id (:id archive-me)
                                                   :is_published  true}]
        (collection/archive-collection! archive-me)
        (testing "archiving a Library/Data subcollection unpublishes all the tables it contains"
          (is (=? {:is_published  false
                   :collection_id nil
                   :id            (:id table)}
                  (t2/select-one :model/Table :id (:id table))))
          (is (t2/select-one-fn :archived :model/Collection :id (:id archive-me))))))))

(deftest unpublish-tables-in-archived-collection-recursively-test
  (mt/with-premium-features #{:library}
    (mt/as-admin
      (mt/with-temp [:model/Collection archive-me {:name          "To be archived"
                                                   :type          collection/library-data-collection-type}
                     :model/Table      table1     {:collection_id (:id archive-me)
                                                   :is_published  true
                                                   :name          "Grandparent_Table"}
                     :model/Collection parent     {:name          "Middle collection"
                                                   :type          collection/library-data-collection-type
                                                   :location      (str "/" (:id archive-me) "/")}
                     :model/Table      table2     {:collection_id (:id parent)
                                                   :is_published  true
                                                   :name          "Parent_Table"}
                     :model/Collection child      {:name          "Innermost collection"
                                                   :type          collection/library-data-collection-type
                                                   :location      (str "/" (:id archive-me) "/" (:id parent) "/")}
                     :model/Table      table3     {:collection_id (:id child)
                                                   :is_published  true
                                                   :name          "Child_Table"}]
        (collection/archive-collection! archive-me)
        (testing "archiving a Library/Data subcollection unpublishes all the tables it contains **recursively**"
          (is (t2/select-one-fn :archived :model/Collection :id (:id archive-me)))
          (doseq [table [table1 table2 table3]]
            (is (=? {:is_published  false
                     :collection_id nil
                     :id            (:id table)}
                    (t2/select-one :model/Table :id (:id table))))))))))

(deftest archive-metrics-subcollection-goes-to-trash-test
  (mt/with-premium-features #{:library}
    (mt/as-admin
      (mt/with-temp [:model/Collection archive-me {:name "Metrics subcoll"
                                                   :type collection/library-metrics-collection-type}
                     :model/Card       metric     {:collection_id (:id archive-me)
                                                   :type          :metric}]
        (collection/archive-collection! archive-me)
        (testing "the collection is archived"
          (is (true? (t2/select-one-fn :archived :model/Collection :id (:id archive-me)))))
        (testing "the metric inside is archived"
          (is (true? (t2/select-one-fn :archived :model/Card :id (:id metric)))))
        (testing "the metric stays in its original collection (not unpublished/ejected)"
          (is (= (:id archive-me)
                 (t2/select-one-fn :collection_id :model/Card :id (:id metric)))))))))

(deftest disallow-cross-type-collection-nesting-test
  (mt/with-premium-features #{:library}
    (mt/with-temp [:model/Collection data-parent    {:name "Data Parent"    :type collection/library-data-collection-type}
                   :model/Collection metrics-parent {:name "Metrics Parent" :type collection/library-metrics-collection-type}
                   :model/Collection data-child     {:name "Data Child"     :type collection/library-data-collection-type
                                                     :location (str "/" (:id data-parent) "/")}
                   :model/Collection metrics-child  {:name "Metrics Child"  :type collection/library-metrics-collection-type
                                                     :location (str "/" (:id metrics-parent) "/")}]
      (testing "Cannot move a library-data collection into a library-metrics parent"
        (is (thrown-with-msg? clojure.lang.ExceptionInfo #"Can only add metrics"
                              (t2/update! :model/Collection (:id data-child)
                                          {:location (str "/" (:id metrics-parent) "/")}))))
      (testing "Cannot move a library-metrics collection into a library-data parent"
        (is (thrown-with-msg? clojure.lang.ExceptionInfo #"Can only add tables"
                              (t2/update! :model/Collection (:id metrics-child)
                                          {:location (str "/" (:id data-parent) "/")}))))
      (testing "Cannot move a library-data collection via API to a library-metrics parent"
        (is (= "Can only add metrics to the 'Metrics' collection"
               (mt/user-http-request :crowberto :put 400 (str "collection/" (:id data-child))
                                     {:parent_id (:id metrics-parent)}))))
      (testing "Cannot move a library-metrics collection via API to a library-data parent"
        (is (= "Can only add tables to the 'Data' collection"
               (mt/user-http-request :crowberto :put 400 (str "collection/" (:id metrics-child))
                                     {:parent_id (:id data-parent)})))))))

(deftest cannot-move-library-collections-to-vanilla-collection-test
  (mt/with-premium-features #{:library}
    (mt/with-temp [:model/Collection library-root   {:name "Library"  :type collection/library-collection-type}
                   :model/Collection data-root      {:name "Data"     :type collection/library-data-collection-type
                                                     :location (str "/" (:id library-root) "/")}
                   :model/Collection metrics-root   {:name "Metrics"  :type collection/library-metrics-collection-type
                                                     :location (str "/" (:id library-root) "/")}
                   :model/Collection data-sub       {:name "Data Sub" :type collection/library-data-collection-type
                                                     :location (str "/" (:id library-root) "/" (:id data-root) "/")}
                   :model/Collection metrics-sub    {:name "Metrics Sub" :type collection/library-metrics-collection-type
                                                     :location (str "/" (:id library-root) "/" (:id metrics-root) "/")}
                   :model/Collection vanilla        {:name "Vanilla Collection" :type nil}]
      (let [vanilla-location (str "/" (:id vanilla) "/")]
        (with-redefs [collection/library-root-collection? (fn [coll]
                                                            (contains? #{(:id library-root) (:id data-root) (:id metrics-root)}
                                                                       (:id coll)))]
          (testing "Cannot move the Library collection itself into a vanilla collection"
            (is (thrown-with-msg? clojure.lang.ExceptionInfo #"Cannot update properties on a Library collection"
                                  (t2/update! :model/Collection (:id library-root) {:location vanilla-location}))))
          (testing "Cannot move a top-level Data collection into a vanilla collection"
            (is (thrown-with-msg? clojure.lang.ExceptionInfo #"Cannot update properties on a Library collection"
                                  (t2/update! :model/Collection (:id data-root) {:location vanilla-location}))))
          (testing "Cannot move a top-level Metrics collection into a vanilla collection"
            (is (thrown-with-msg? clojure.lang.ExceptionInfo #"Cannot update properties on a Library collection"
                                  (t2/update! :model/Collection (:id metrics-root) {:location vanilla-location})))))
        (testing "Cannot move a Data subcollection into a vanilla collection"
          (is (thrown-with-msg? clojure.lang.ExceptionInfo #"Cannot move a Library collection outside the Library"
                                (t2/update! :model/Collection (:id data-sub) {:location vanilla-location}))))
        (testing "Cannot move a Metrics subcollection into a vanilla collection"
          (is (thrown-with-msg? clojure.lang.ExceptionInfo #"Cannot move a Library collection outside the Library"
                                (t2/update! :model/Collection (:id metrics-sub) {:location vanilla-location}))))))))
