(ns metabase-enterprise.index-manager.impl-test
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.index-manager.impl :as impl]
   [metabase.test :as mt]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(defn- temp-transform-spec []
  {:name   (mt/random-name)
   :source {:type "python" :source-database (mt/id) :body "import pandas as pd\n"}
   :target {:database (mt/id) :type "table" :schema "public" :name (mt/random-name)}})

(deftest create-and-read-test
  (testing "create-request! stores a :pending request that reads back with keyword-valued structured fields"
    (mt/with-temp [:model/Transform {transform-id :id} (temp-transform-spec)]
      (let [req (impl/create-request! transform-id
                                               {:kind :btree :name "by_cat" :columns [{:name "category" :direction :asc}]})]
        (is (= :pending (:status req)))
        (is (= "by_cat" (:index_name req)))
        (let [[back] (impl/requests-for-transform transform-id)]
          (is (= (:id req) (:id back)))
          (is (= :btree (get-in back [:structured :kind])) "kind re-keywordized on read")
          (is (= :asc (get-in back [:structured :columns 0 :direction])))
          (is (nil? (:table_id back)) "table_id starts null, backfilled after sync"))))))

(deftest inline-kind-name-from-kind-test
  (testing "inline kinds with no :name get a stable per-transform index_name from their :kind"
    (mt/with-temp [:model/Transform {transform-id :id} (temp-transform-spec)]
      (is (= "sortkey" (:index_name (impl/create-request!
                                     transform-id {:kind :sortkey :style :compound :columns [{:name "a"}]})))))))

(deftest ownership-test
  (testing "a request for a non-existent transform is rejected (GDGT-2602 transform-owned rule)"
    (is (thrown-with-msg? Exception #"does not exist"
                          (impl/create-request! Integer/MAX_VALUE
                                                         {:kind :btree :name "x" :columns [{:name "a"}]})))))

(deftest invalid-structured-test
  (testing "create rejects a structured map that fails the schema, with a 400"
    (mt/with-temp [:model/Transform {transform-id :id} (temp-transform-spec)]
      (is (thrown-with-msg? Exception #"Invalid index request structured"
                            (impl/create-request! transform-id {:kind :not-a-kind :columns [{:name "a"}]}))))))

(deftest update-test
  (testing "update-request! replaces structured and resets status to :pending"
    (mt/with-temp [:model/Transform {transform-id :id} (temp-transform-spec)]
      (let [{:keys [id]} (impl/create-request! transform-id {:kind :btree :name "u" :columns [{:name "a"}]})
            updated (impl/update-request! id {:kind :btree :name "u" :columns [{:name "b"}]})]
        (is (= "b" (get-in updated [:structured :columns 0 :name])))
        (is (= :pending (:status updated))))
      (testing "updating a missing request returns nil"
        (is (nil? (impl/update-request! Integer/MAX_VALUE {:kind :btree :name "z" :columns [{:name "a"}]})))))))

(deftest delete-test
  (testing "delete-request! removes the row"
    (mt/with-temp [:model/Transform {transform-id :id} (temp-transform-spec)]
      (let [{:keys [id]} (impl/create-request! transform-id {:kind :btree :name "d" :columns [{:name "a"}]})]
        (is (true? (impl/delete-request! id)))
        (is (false? (t2/exists? :model/IndexRequest :id id)))
        (is (false? (impl/delete-request! id)) "deleting again is a no-op")))))
