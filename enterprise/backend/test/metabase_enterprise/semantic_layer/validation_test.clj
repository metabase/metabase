(ns metabase-enterprise.semantic-layer.validation-test
  (:require
   [clojure.test :refer :all]
   [metabase.test :as mt]
   [toucan2.core :as t2]))

(deftest allowed-content-doesnt-block-regular-collections
  (mt/with-premium-features #{:semantic-layer}
    (mt/with-temp [:model/Collection regular-collection {:name "Regular Collection" :allowed_content nil}]
      (testing "Regular collections can add anything"
        (is (some? (t2/insert! :model/Collection (merge (mt/with-temp-defaults :model/Collection) {:location (str "/" (:id regular-collection) "/")}))))
        (is (some? (t2/insert! :model/Card (merge (mt/with-temp-defaults :model/Card) {:type :model, :collection_id (:id regular-collection)}))))
        (is (some? (t2/insert! :model/Card (merge (mt/with-temp-defaults :model/Card) {:type :metric, :collection_id (:id regular-collection)}))))
        (is (some? (t2/insert! :model/Dashboard (merge (mt/with-temp-defaults :model/Dashboard) {:collection_id (:id regular-collection)}))))))))

(deftest allowed-content-completely-locked-down
  (mt/with-premium-features #{:semantic-layer}
    (mt/with-temp [:model/Collection no-allowed-content {:name "Test No Content" :allowed_content {}}]
      (testing "Cannot add anything when collections have no allowed content"
        (is (thrown-with-msg? clojure.lang.ExceptionInfo #"Content type not allowed in this collection"
                              (t2/insert! :model/Collection (merge (mt/with-temp-defaults :model/Collection) {:location (str "/" (:id no-allowed-content) "/")}))))
        (is (thrown-with-msg? clojure.lang.ExceptionInfo #"Content type not allowed in this collection"
                              (t2/insert! :model/Card (merge (mt/with-temp-defaults :model/Card) {:type :model, :collection_id (:id no-allowed-content)}))))
        (is (thrown-with-msg? clojure.lang.ExceptionInfo #"Content type not allowed in this collection"
                              (t2/insert! :model/Card (merge (mt/with-temp-defaults :model/Card) {:type :metric :collection_id (:id no-allowed-content)}))))
        (is (thrown-with-msg? clojure.lang.ExceptionInfo #"Content type not allowed in this collection"
                              (t2/insert! :model/Dashboard (merge (mt/with-temp-defaults :model/Dashboard) {:collection_id (:id no-allowed-content)}))))))))

(deftest check-allowed-content-only-collections
  (mt/with-premium-features #{:semantic-layer}
    (mt/with-temp [:model/Collection only-subcollections {:name "Test Base Library" :allowed_content {"collection" true}}]
      (testing "Only subcollections"
        (is (some? (t2/insert! :model/Collection (merge (mt/with-temp-defaults :model/Collection) {:location (str "/" (:id only-subcollections) "/")}))))
        (is (thrown-with-msg? clojure.lang.ExceptionInfo #"Content type not allowed in this collection"
                              (t2/insert! :model/Card (merge (mt/with-temp-defaults :model/Card) {:type :model, :collection_id (:id only-subcollections)}))))
        (is (thrown-with-msg? clojure.lang.ExceptionInfo #"Content type not allowed in this collection"
                              (t2/insert! :model/Card (merge (mt/with-temp-defaults :model/Card) {:type :metric :collection_id (:id only-subcollections)}))))
        (is (thrown-with-msg? clojure.lang.ExceptionInfo #"Content type not allowed in this collection"
                              (t2/insert! :model/Dashboard (merge (mt/with-temp-defaults :model/Dashboard) {:collection_id (:id only-subcollections)}))))))))

(deftest check-allowed-content-one-type
  (mt/with-premium-features #{:semantic-layer}
    (mt/with-temp [:model/Collection allow-models {:name "Test Base Library" :allowed_content {"collection" true, "model" true}}]
      (testing "Can only add allowed content types"
        (is (some? (t2/insert! :model/Collection (merge (mt/with-temp-defaults :model/Collection) {:location (str "/" (:id allow-models) "/")}))))
        (is (some? (t2/insert! :model/Card (merge (mt/with-temp-defaults :model/Card) {:type :model, :collection_id (:id allow-models)}))))
        (is (thrown-with-msg? clojure.lang.ExceptionInfo #"Content type not allowed in this collection"
                              (t2/insert! :model/Card (merge (mt/with-temp-defaults :model/Card) {:type :metric :collection_id (:id allow-models)}))))
        (is (thrown-with-msg? clojure.lang.ExceptionInfo #"Content type not allowed in this collection"
                              (t2/insert! :model/Dashboard (merge (mt/with-temp-defaults :model/Dashboard) {:collection_id (:id allow-models)}))))))))
