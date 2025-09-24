(ns metabase-enterprise.remote-sync.collection-api-test
  (:require
   [clojure.test :refer :all]
   [metabase.test :as mt]
   [metabase.util :as u]
   [toucan2.core :as t2]))

(deftest create-collection-with-type-test
  (testing "POST /api/collection"
    (testing "Can create a collection with type 'remote-synced'"
      (mt/with-model-cleanup [:model/Collection]
        (let [response (mt/user-http-request :crowberto :post 200 "collection"
                                             {:name "Remote Synced Collection"
                                              :type "remote-synced"})]
          (is (= "remote-synced" (:type response)))
          (is (= "Remote Synced Collection" (:name response)))
          ;; Verify it was actually saved with the correct type
          (is (= "remote-synced" (t2/select-one-fn :type :model/Collection :id (:id response)))))))

    (testing "Can create a collection with type nil (normal collection)"
      (mt/with-model-cleanup [:model/Collection]
        (let [response (mt/user-http-request :crowberto :post 200 "collection"
                                             {:name "Normal Collection"
                                              :type nil})]
          (is (nil? (:type response)))
          (is (= "Normal Collection" (:name response)))
          ;; Verify it was actually saved with nil type
          (is (nil? (t2/select-one-fn :type :model/Collection :id (:id response)))))))

    (testing "Can create a collection without specifying type (defaults to nil)"
      (mt/with-model-cleanup [:model/Collection]
        (let [response (mt/user-http-request :crowberto :post 200 "collection"
                                             {:name "Default Type Collection"})]
          (is (nil? (:type response)))
          (is (= "Default Type Collection" (:name response)))
          ;; Verify it was actually saved with nil type
          (is (nil? (t2/select-one-fn :type :model/Collection :id (:id response)))))))

    (testing "Can create a collection without a specific type (defaults to parent)"
      (mt/with-model-cleanup [:model/Collection]
        (mt/with-temporary-setting-values [remote-sync-type "export"]
          (mt/with-temp [:model/Collection {parent-id :id} {:name "Parent collection"
                                                            :type "remote-synced"}]
            (let [response (mt/user-http-request :crowberto :post 200 "collection"
                                                 {:name "Default Type Collection"
                                                  :parent_id parent-id})]
              (is (= "remote-synced" (:type response)))
              (is (= "Default Type Collection" (:name response)))
              ;; Verify it was actually saved with parent type
              (is (= "remote-synced" (t2/select-one-fn :type :model/Collection :id (:id response)))))))))))

(deftest update-collection-type-test
  (testing "PUT /api/collection/:id"
    (testing "Can update a collection to have type 'remote-synced'"
      (mt/with-temp [:model/Collection collection {:name "Test Collection" :type nil}]
        ;; Verify it starts with nil type
        (is (nil? (t2/select-one-fn :type :model/Collection :id (:id collection))))
        ;; Update to remote-synced
        (let [response (mt/user-http-request :crowberto :put 200 (str "collection/" (u/the-id collection))
                                             {:type "remote-synced"})]
          (is (= "remote-synced" (:type response)))
          ;; Verify it was actually saved with the correct type
          (is (= "remote-synced" (t2/select-one-fn :type :model/Collection :id (:id collection)))))))

    (testing "Can update a collection from 'remote-synced' to nil"
      (mt/with-temp [:model/Collection collection {:name "Remote Collection" :type "remote-synced"}]
        ;; Verify it starts with remote-synced type
        (is (= "remote-synced" (t2/select-one-fn :type :model/Collection :id (:id collection))))
        ;; Update to nil
        (mt/with-temporary-setting-values [remote-sync-type "export"]
          (let [response (mt/user-http-request :crowberto :put 200 (str "collection/" (u/the-id collection))
                                               {:type nil})]
            (is (nil? (:type response)))
            ;; Verify it was actually saved with nil type
            (is (nil? (t2/select-one-fn :type :model/Collection :id (:id collection))))))))

    (testing "Cannot update a collection from 'remote-synced' to nil when remote-sync-type is import"
      (mt/with-temp [:model/Collection collection {:name "Remote Collection" :type "remote-synced"}]
        ;; Verify it starts with remote-synced type
        (is (= "remote-synced" (t2/select-one-fn :type :model/Collection :id (:id collection))))
        ;; Update to nil
        (mt/with-temporary-setting-values [remote-sync-type "import"]
          (mt/user-http-request :crowberto :put 403 (str "collection/" (u/the-id collection))
                                {:type nil})
          (is (= "remote-synced" (t2/select-one-fn :type :model/Collection :id (:id collection)))))))

    (testing "Can update other properties without changing type"
      (mt/with-temp [:model/Collection collection {:name "Test Collection" :type "remote-synced"}]
        ;; Update name without specifying type
        (mt/with-temporary-setting-values [remote-sync-type "export"]
          (let [response (mt/user-http-request :crowberto :put 200 (str "collection/" (u/the-id collection))
                                               {:name "Updated Name"})]
            (is (= "Updated Name" (:name response)))
            (is (= "remote-synced" (:type response)))
            ;; Verify type wasn't changed
            (is (= "remote-synced" (t2/select-one-fn :type :model/Collection :id (:id collection)))))))

      (mt/with-temp [:model/Collection collection {:name "Normal Collection" :type nil}]
        ;; Update name without specifying type (nil type)
        (let [response (mt/user-http-request :crowberto :put 200 (str "collection/" (u/the-id collection))
                                             {:name "Updated Normal"})]
          (is (= "Updated Normal" (:name response)))
          (is (nil? (:type response)))
          ;; Verify type wasn't changed
          (is (nil? (t2/select-one-fn :type :model/Collection :id (:id collection)))))))))
