(ns metabase-enterprise.library.core-test
  (:require
   [clojure.test :refer :all]
   [metabase.test :as mt]
   [toucan2.core :as t2]))

(deftest check-allowed-content-test
  (mt/with-premium-features #{:library}
    (mt/with-temp [:model/Collection regular-collection {:name "Regular Collection" :allowed_content nil}
                   :model/Collection no-allowed-content {:name "Test Base Library" :allowed_content {}}
                   :model/Collection only-subcollections {:name "Test Base Library" :allowed_content {"collection" true}}
                   :model/Collection allow-models {:name "Test Base Library" :allowed_content {"collection" true, "model" true}}]
      (testing "Regular collections can add anything"
        (is (some? (t2/insert! :model/Collection (merge (mt/with-temp-defaults :model/Collection) {:location (str "/" (:id regular-collection) "/")}))))
        (is (some? (t2/insert! :model/Card (merge (mt/with-temp-defaults :model/Card) {:type :model, :collection_id (:id regular-collection)}))))
        (is (some? (t2/insert! :model/Card (merge (mt/with-temp-defaults :model/Card) {:type :metric, :collection_id (:id regular-collection)}))))
        (is (some? (t2/insert! :model/Dashboard (merge (mt/with-temp-defaults :model/Dashboard) {:collection_id (:id regular-collection)})))))
      (testing "Cannot add anything when collections have no allowed content"
        (is (thrown-with-msg? clojure.lang.ExceptionInfo #"Content type not allowed in this collection"
                              (t2/insert! :model/Collection (merge (mt/with-temp-defaults :model/Collection) {:location (str "/" (:id no-allowed-content) "/")}))))
        (is (thrown-with-msg? clojure.lang.ExceptionInfo #"Content type not allowed in this collection"
                              (t2/insert! :model/Card (merge (mt/with-temp-defaults :model/Card) {:type :model, :collection_id (:id no-allowed-content)}))))
        (is (thrown-with-msg? clojure.lang.ExceptionInfo #"Content type not allowed in this collection"
                              (t2/insert! :model/Card (merge (mt/with-temp-defaults :model/Card) {:type :metric :collection_id (:id no-allowed-content)}))))
        (is (thrown-with-msg? clojure.lang.ExceptionInfo #"Content type not allowed in this collection"
                              (t2/insert! :model/Dashboard (merge (mt/with-temp-defaults :model/Dashboard) {:collection_id (:id no-allowed-content)})))))
      (testing "Only subcollections"
        (is (some? (t2/insert! :model/Collection (merge (mt/with-temp-defaults :model/Collection) {:location (str "/" (:id only-subcollections) "/")}))))
        (is (thrown-with-msg? clojure.lang.ExceptionInfo #"Content type not allowed in this collection"
                              (t2/insert! :model/Card (merge (mt/with-temp-defaults :model/Card) {:type :model, :collection_id (:id only-subcollections)}))))
        (is (thrown-with-msg? clojure.lang.ExceptionInfo #"Content type not allowed in this collection"
                              (t2/insert! :model/Card (merge (mt/with-temp-defaults :model/Card) {:type :metric :collection_id (:id only-subcollections)}))))
        (is (thrown-with-msg? clojure.lang.ExceptionInfo #"Content type not allowed in this collection"
                              (t2/insert! :model/Dashboard (merge (mt/with-temp-defaults :model/Dashboard) {:collection_id (:id only-subcollections)})))))
      (testing "Can only add allowed content types"
        (is (some? (t2/insert! :model/Collection (merge (mt/with-temp-defaults :model/Collection) {:location (str "/" (:id allow-models) "/")}))))
        (is (some? (t2/insert! :model/Card (merge (mt/with-temp-defaults :model/Card) {:type :model, :collection_id (:id allow-models)}))))
        (is (thrown-with-msg? clojure.lang.ExceptionInfo #"Content type not allowed in this collection"
                              (t2/insert! :model/Card (merge (mt/with-temp-defaults :model/Card) {:type :metric :collection_id (:id allow-models)}))))
        (is (thrown-with-msg? clojure.lang.ExceptionInfo #"Content type not allowed in this collection"
                              (t2/insert! :model/Dashboard (merge (mt/with-temp-defaults :model/Dashboard) {:collection_id (:id allow-models)}))))))))
