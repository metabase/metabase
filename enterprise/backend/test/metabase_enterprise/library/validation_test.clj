(ns metabase-enterprise.library.validation-test
  (:require
   [clojure.test :refer :all]
   [metabase.collections.models.collection :as collection]
   [metabase.test :as mt]
   [toucan2.core :as t2]))

(deftest allowed-content-doesnt-block-regular-collections
  (mt/with-premium-features #{:data-studio}
    (mt/with-temp [:model/Collection regular-collection {:name "Regular Collection" :type nil}]
      (testing "Regular collections can add anything"
        (is (some? (t2/insert! :model/Collection (merge (mt/with-temp-defaults :model/Collection) {:location (str "/" (:id regular-collection) "/")}))))
        (is (some? (t2/insert! :model/Card (merge (mt/with-temp-defaults :model/Card) {:type :model, :collection_id (:id regular-collection)}))))
        (is (some? (t2/insert! :model/Card (merge (mt/with-temp-defaults :model/Card) {:type :metric, :collection_id (:id regular-collection)}))))
        (is (some? (t2/insert! :model/Dashboard (merge (mt/with-temp-defaults :model/Dashboard) {:collection_id (:id regular-collection)}))))))))

(deftest library-completely-locked-down
  (mt/with-premium-features #{:data-studio}
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
  (mt/with-premium-features #{:data-studio}
    (mt/with-temp [:model/Collection allow-tables {:name "Test Base Library" :type collection/library-data-collection-type}]
      (testing "Can only add allowed content types"
        (mt/with-temp [:model/Table table {:collection_id (:id allow-tables)
                                           :is_published  true}]
          (is (some? table)))
        (is (thrown-with-msg? clojure.lang.ExceptionInfo #"Can only add tables to the 'Data' collection"
                              (t2/insert! :model/Collection (merge (mt/with-temp-defaults :model/Collection) {:location (str "/" (:id allow-tables) "/")}))))
        (is (thrown-with-msg? clojure.lang.ExceptionInfo #"Can only add tables to the 'Data' collection"
                              (t2/insert! :model/Card (merge (mt/with-temp-defaults :model/Card) {:type :model :collection_id (:id allow-tables)}))))
        (is (thrown-with-msg? clojure.lang.ExceptionInfo #"Can only add tables to the 'Data' collection"
                              (t2/insert! :model/Card (merge (mt/with-temp-defaults :model/Card) {:type :metric :collection_id (:id allow-tables)}))))
        (is (thrown-with-msg? clojure.lang.ExceptionInfo #"Can only add tables to the 'Data' collection"
                              (t2/insert! :model/Dashboard (merge (mt/with-temp-defaults :model/Dashboard) {:collection_id (:id allow-tables)}))))))))

(deftest check-allowed-content-metric
  (mt/with-premium-features #{:data-studio}
    (mt/with-temp [:model/Collection allow-metrics {:name "Test Base Library" :type collection/library-metrics-collection-type}]
      (testing "Can only add allowed content types"
        (mt/with-temp [:model/Card card {:collection_id (:id allow-metrics)
                                         :type          :metric}]
          (is (some? card)))
        (is (thrown-with-msg? clojure.lang.ExceptionInfo #"Can only add metrics to the 'Metrics' collection"
                              (t2/insert! :model/Collection (merge (mt/with-temp-defaults :model/Collection) {:location (str "/" (:id allow-metrics) "/")}))))
        (is (thrown-with-msg? clojure.lang.ExceptionInfo #"Can only add metrics to the 'Metrics' collection"
                              (t2/insert! :model/Card (merge (mt/with-temp-defaults :model/Card) {:type :model :collection_id (:id allow-metrics)}))))
        (is (thrown-with-msg? clojure.lang.ExceptionInfo #"Can only add metrics to the 'Metrics' collection"
                              (t2/insert! :model/Dashboard (merge (mt/with-temp-defaults :model/Dashboard) {:collection_id (:id allow-metrics)}))))))))

(deftest cannot-update-library-collections
  (mt/with-premium-features #{:data-studio}
    (mt/with-temp [:model/Collection library {:name "Test Library" :type collection/library-collection-type}
                   :model/Collection models {:name "Test Semantic Model Layer" :type collection/library-data-collection-type}
                   :model/Collection metrics {:name "Test Semantic Metrics Layer" :type collection/library-metrics-collection-type}]
      (doseq [col [library models metrics]]
        (testing (str "Checking type " (:type col))
          (is (thrown-with-msg? clojure.lang.ExceptionInfo
                                #"Cannot update properties on a Library collection"
                                (t2/update! :model/Collection (:id col) {:name "New Name"}))))))))
