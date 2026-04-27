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

        (t2/select-fn-set :location :model/Collection)
        (collection/archive-collection! archive-me)
        (testing "archiving a Library/Data subcollection unpublishes all the tables it contains **recursively**"
          (is (t2/select-one-fn :archived :model/Collection :id (:id archive-me)))
          (doseq [table [table1 table2 table3]]
            (is (=? {:is_published  false
                     :collection_id nil
                     :id            (:id table)}
                    (t2/select-one :model/Table :id (:id table))))))))))
