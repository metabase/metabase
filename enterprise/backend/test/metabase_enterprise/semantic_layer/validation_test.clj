(ns metabase-enterprise.semantic-layer.validation-test
  (:require
   [clojure.test :refer :all]
   [metabase.collections.models.collection :as collection]
   [metabase.test :as mt]
   [toucan2.core :as t2]))

(deftest allowed-content-doesnt-block-regular-collections
  (mt/with-premium-features #{:semantic-layer}
    (mt/with-temp [:model/Collection regular-collection {:name "Regular Collection" :type nil}]
      (testing "Regular collections can add anything"
        (is (some? (t2/insert! :model/Collection (merge (mt/with-temp-defaults :model/Collection) {:location (str "/" (:id regular-collection) "/")}))))
        (is (some? (t2/insert! :model/Card (merge (mt/with-temp-defaults :model/Card) {:type :model, :collection_id (:id regular-collection)}))))
        (is (some? (t2/insert! :model/Card (merge (mt/with-temp-defaults :model/Card) {:type :metric, :collection_id (:id regular-collection)}))))
        (is (some? (t2/insert! :model/Dashboard (merge (mt/with-temp-defaults :model/Dashboard) {:collection_id (:id regular-collection)}))))))))

(deftest semantic-layer-completely-locked-down
  (mt/with-premium-features #{:semantic-layer}
    (mt/with-temp [:model/Collection no-allowed-content {:name "Test No Content" :type collection/semantic-layer-collection-type}]
      (testing "Cannot add anything to semantic layer collections"
        (is (thrown-with-msg? clojure.lang.ExceptionInfo #"Cannot add anything to the Semantic Layer collection"
                              (t2/insert! :model/Collection (merge (mt/with-temp-defaults :model/Collection) {:location (str "/" (:id no-allowed-content) "/")}))))
        (is (thrown-with-msg? clojure.lang.ExceptionInfo #"Cannot add anything to the Semantic Layer collection"
                              (t2/insert! :model/Card (merge (mt/with-temp-defaults :model/Card) {:type :model, :collection_id (:id no-allowed-content)}))))
        (is (thrown-with-msg? clojure.lang.ExceptionInfo #"Cannot add anything to the Semantic Layer collection"
                              (t2/insert! :model/Card (merge (mt/with-temp-defaults :model/Card) {:type :metric :collection_id (:id no-allowed-content)}))))
        (is (thrown-with-msg? clojure.lang.ExceptionInfo #"Cannot add anything to the Semantic Layer collection"
                              (t2/insert! :model/Dashboard (merge (mt/with-temp-defaults :model/Dashboard) {:collection_id (:id no-allowed-content)}))))))))

(deftest check-allowed-content-model
  (mt/with-premium-features #{:semantic-layer}
    (mt/with-temp [:model/Collection allow-models {:name "Test Base Library" :type collection/semantic-layer-models-collection-type}]
      (testing "Can only add allowed content types"
        (is (some? (t2/insert! :model/Card (merge (mt/with-temp-defaults :model/Card) {:type :model, :collection_id (:id allow-models)}))))
        (is (thrown-with-msg? clojure.lang.ExceptionInfo #"Can only add models to the 'Models' collection"
                              (t2/insert! :model/Collection (merge (mt/with-temp-defaults :model/Collection) {:location (str "/" (:id allow-models) "/")}))))
        (is (thrown-with-msg? clojure.lang.ExceptionInfo #"Can only add models to the 'Models' collection"
                              (t2/insert! :model/Card (merge (mt/with-temp-defaults :model/Card) {:type :metric :collection_id (:id allow-models)}))))
        (is (thrown-with-msg? clojure.lang.ExceptionInfo #"Can only add models to the 'Models' collection"
                              (t2/insert! :model/Dashboard (merge (mt/with-temp-defaults :model/Dashboard) {:collection_id (:id allow-models)}))))))))

(deftest check-allowed-content-metric
  (mt/with-premium-features #{:semantic-layer}
    (mt/with-temp [:model/Collection allow-metrics {:name "Test Base Library" :type collection/semantic-layer-metrics-collection-type}]
      (testing "Can only add allowed content types"
        (is (some? (t2/insert! :model/Card (merge (mt/with-temp-defaults :model/Card) {:type :metric, :collection_id (:id allow-metrics)}))))
        (is (thrown-with-msg? clojure.lang.ExceptionInfo #"Can only add metrics to the 'Metrics' collection"
                              (t2/insert! :model/Collection (merge (mt/with-temp-defaults :model/Collection) {:location (str "/" (:id allow-metrics) "/")}))))
        (is (thrown-with-msg? clojure.lang.ExceptionInfo #"Can only add metrics to the 'Metrics' collection"
                              (t2/insert! :model/Card (merge (mt/with-temp-defaults :model/Card) {:type :model :collection_id (:id allow-metrics)}))))
        (is (thrown-with-msg? clojure.lang.ExceptionInfo #"Can only add metrics to the 'Metrics' collection"
                              (t2/insert! :model/Dashboard (merge (mt/with-temp-defaults :model/Dashboard) {:collection_id (:id allow-metrics)}))))))))

(deftest cannot-update-semantic-layer-collections
  (mt/with-premium-features #{:semantic-layer}
    (mt/with-temp [:model/Collection semantic-layer {:name "Test Semantic Layer" :type collection/semantic-layer-collection-type}
                   :model/Collection models {:name "Test Semantic Model Layer" :type collection/semantic-layer-models-collection-type}
                   :model/Collection metrics {:name "Test Semantic Metrics Layer" :type collection/semantic-layer-metrics-collection-type}]
      (doseq [col [semantic-layer models metrics]]
        (testing (str "Checking type " (:type col))
          (is (thrown-with-msg? clojure.lang.ExceptionInfo
                                #"Cannot update properties on a Library collection"
                                (t2/update! :model/Collection (:id col) {:name "New Name"}))))))))
