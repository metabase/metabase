(ns metabase-enterprise.remote-sync.collection-api-test
  (:require
   [clojure.string :as str]
   [clojure.test :refer :all]
   [metabase-enterprise.remote-sync.settings :as settings]
   [metabase.collections.models.collection :as collection]
   [metabase.test :as mt]
   [metabase.util :as u]
   [toucan2.core :as t2]))

(use-fixtures :each
  (fn [f]
    (mt/with-temporary-setting-values [settings/remote-sync-type :development]
      (f))))

(deftest create-collection-with-remote-synced-type-test
  (testing "POST /api/collection"
    (testing "Can create a collection with type 'remote-synced'"
      (mt/with-model-cleanup [:model/Collection]
        (let [response (mt/user-http-request :crowberto :post 200 "collection"
                                             {:name "Remote Synced Collection"
                                              :type "remote-synced"})]
          (is (= "remote-synced" (:type response)))
          (is (= "Remote Synced Collection" (:name response)))
          ;; Verify it was actually saved with the correct type
          (is (= "remote-synced" (t2/select-one-fn :type :model/Collection :id (:id response)))))))))

(deftest create-collection-with-nil-type-test
  (testing "POST /api/collection"
    (testing "Can create a collection with type nil (normal collection)"
      (mt/with-model-cleanup [:model/Collection]
        (let [response (mt/user-http-request :crowberto :post 200 "collection"
                                             {:name "Normal Collection"
                                              :type nil})]
          (is (nil? (:type response)))
          (is (= "Normal Collection" (:name response)))
          ;; Verify it was actually saved with nil type
          (is (nil? (t2/select-one-fn :type :model/Collection :id (:id response)))))))))

(deftest create-collection-without-type-test
  (testing "POST /api/collection"
    (testing "Can create a collection without specifying type (defaults to nil)"
      (mt/with-model-cleanup [:model/Collection]
        (let [response (mt/user-http-request :crowberto :post 200 "collection"
                                             {:name "Default Type Collection"})]
          (is (nil? (:type response)))
          (is (= "Default Type Collection" (:name response)))
          ;; Verify it was actually saved with nil type
          (is (nil? (t2/select-one-fn :type :model/Collection :id (:id response)))))))))

(deftest create-collection-inherits-parent-type-test
  (testing "POST /api/collection"
    (testing "Child collection inherits parent's type"
      (mt/with-model-cleanup [:model/Collection]
        (let [parent (mt/user-http-request :crowberto :post 200 "collection"
                                           {:name "Parent"
                                            :type "remote-synced"})
              child (mt/user-http-request :crowberto :post 200 "collection"
                                          {:name "Child"
                                           :parent_id (:id parent)})]
          (is (= "remote-synced" (:type child)))
          (is (= "remote-synced" (t2/select-one-fn :type :model/Collection :id (:id child)))))))))

(deftest update-collection-to-remote-synced-type-test
  (testing "PUT /api/collection/:id"
    (testing "Can update an existing collection to be remote-synced"
      (mt/with-model-cleanup [:model/Collection]
        (let [collection (mt/user-http-request :crowberto :post 200 "collection"
                                               {:name "Normal Collection"})
              updated (mt/user-http-request :crowberto :put 200 (str "collection/" (:id collection))
                                            {:type "remote-synced"})]
          (is (= "remote-synced" (:type updated)))
          (is (= "remote-synced" (t2/select-one-fn :type :model/Collection :id (:id collection)))))))))

(deftest update-collection-from-remote-synced-to-nil-in-development-test
  (testing "PUT /api/collection/:id"
    (testing "Can update a remote-synced collection to nil type in development mode"
      (mt/with-model-cleanup [:model/Collection]
        (let [collection (mt/user-http-request :crowberto :post 200 "collection"
                                               {:name "Remote Synced Collection"
                                                :type "remote-synced"})
              updated (mt/user-http-request :crowberto :put 200 (str "collection/" (:id collection))
                                            {:type nil})]
          (is (nil? (:type updated)))
          (is (nil? (t2/select-one-fn :type :model/Collection :id (:id collection)))))))))

(deftest update-collection-from-remote-synced-to-nil-in-production-fails-test
  (testing "PUT /api/collection/:id"
    (testing "Cannot update a remote-synced collection to nil type in production mode"
      (mt/with-temporary-setting-values [settings/remote-sync-type :production]
        (mt/with-model-cleanup [:model/Collection]
          (let [collection (mt/user-http-request :crowberto :post 200 "collection"
                                                 {:name "Remote Synced Collection"
                                                  :type "remote-synced"})]
            (is (= "You don't have permissions to do that."
                   (mt/user-http-request :crowberto :put 403 (str "collection/" (:id collection))
                                         {:type nil})))))))))

(deftest update-collection-name-preserves-remote-synced-type-test
  (testing "PUT /api/collection/:id"
    (testing "Updating name preserves remote-synced type"
      (mt/with-model-cleanup [:model/Collection]
        (let [collection (mt/user-http-request :crowberto :post 200 "collection"
                                               {:name "Remote Synced"
                                                :type "remote-synced"})
              updated (mt/user-http-request :crowberto :put 200 (str "collection/" (:id collection))
                                            {:name "Updated Name"})]
          (is (= "remote-synced" (:type updated)))
          (is (= "remote-synced" (t2/select-one-fn :type :model/Collection :id (:id collection)))))))))

(deftest update-collection-name-preserves-nil-type-test
  (testing "PUT /api/collection/:id"
    (testing "Can update other properties without changing nil type"
      (mt/with-temp [:model/Collection collection {:name "Normal Collection" :type nil}]
        ;; Update name without specifying type (nil type)
        (let [response (mt/user-http-request :crowberto :put 200 (str "collection/" (u/the-id collection))
                                             {:name "Updated Normal"})]
          (is (= "Updated Normal" (:name response)))
          (is (nil? (:type response)))
          ;; Verify type wasn't changed
          (is (nil? (t2/select-one-fn :type :model/Collection :id (:id collection)))))))))

(deftest update-collection-type-cascades-to-children-test
  (testing "PUT /api/collection/:id"
    (testing "Updating parent collection type cascades to children"
      (mt/with-model-cleanup [:model/Collection]
        (let [parent (mt/user-http-request :crowberto :post 200 "collection"
                                           {:name "Parent"})
              child1 (mt/user-http-request :crowberto :post 200 "collection"
                                           {:name "Child 1"
                                            :parent_id (:id parent)})
              child2 (mt/user-http-request :crowberto :post 200 "collection"
                                           {:name "Child 2"
                                            :parent_id (:id parent)})
              grandchild (mt/user-http-request :crowberto :post 200 "collection"
                                               {:name "Grandchild"
                                                :parent_id (:id child1)})]
          ;; Update parent to remote-synced
          (mt/user-http-request :crowberto :put 200 (str "collection/" (:id parent))
                                {:type "remote-synced"})
          ;; Verify all descendants got the type
          (is (= "remote-synced" (t2/select-one-fn :type :model/Collection :id (:id parent))))
          (is (= "remote-synced" (t2/select-one-fn :type :model/Collection :id (:id child1))))
          (is (= "remote-synced" (t2/select-one-fn :type :model/Collection :id (:id child2))))
          (is (= "remote-synced" (t2/select-one-fn :type :model/Collection :id (:id grandchild)))))))))

(deftest update-collection-type-to-nil-cascades-test
  (testing "PUT /api/collection/:id"
    (testing "Updating parent collection type to nil cascades to children"
      (mt/with-model-cleanup [:model/Collection]
        (let [parent (mt/user-http-request :crowberto :post 200 "collection"
                                           {:name "Parent"
                                            :type "remote-synced"})
              child (mt/user-http-request :crowberto :post 200 "collection"
                                          {:name "Child"
                                           :parent_id (:id parent)})]
          ;; Verify both start as remote-synced
          (is (= "remote-synced" (t2/select-one-fn :type :model/Collection :id (:id parent))))
          (is (= "remote-synced" (t2/select-one-fn :type :model/Collection :id (:id child))))
          ;; Update parent to nil
          (mt/user-http-request :crowberto :put 200 (str "collection/" (:id parent))
                                {:type nil})
          ;; Verify both are now nil
          (is (nil? (t2/select-one-fn :type :model/Collection :id (:id parent))))
          (is (nil? (t2/select-one-fn :type :model/Collection :id (:id child)))))))))

(deftest update-collection-type-does-not-affect-unrelated-collections-test
  (testing "PUT /api/collection/:id"
    (testing "Updating a collection's type does not affect unrelated collections"
      (mt/with-model-cleanup [:model/Collection]
        (let [collection1 (mt/user-http-request :crowberto :post 200 "collection"
                                                {:name "Collection 1"})
              collection2 (mt/user-http-request :crowberto :post 200 "collection"
                                                {:name "Collection 2"})]
          ;; Update collection1 to remote-synced
          (mt/user-http-request :crowberto :put 200 (str "collection/" (:id collection1))
                                {:type "remote-synced"})
          ;; Verify collection1 was updated
          (is (= "remote-synced" (t2/select-one-fn :type :model/Collection :id (:id collection1))))
          ;; Verify collection2 was NOT affected
          (is (nil? (t2/select-one-fn :type :model/Collection :id (:id collection2)))))))))

(deftest update-collection-type-only-cascades-when-changed-test
  (testing "PUT /api/collection/:id"
    (testing "Type cascade only happens when type actually changes"
      (mt/with-model-cleanup [:model/Collection]
        (let [parent (mt/user-http-request :crowberto :post 200 "collection"
                                           {:name "Parent"
                                            :type "remote-synced"})
              child (mt/user-http-request :crowberto :post 200 "collection"
                                          {:name "Child"
                                           :parent_id (:id parent)})]
          ;; Update parent with same type (no change)
          (mt/user-http-request :crowberto :put 200 (str "collection/" (:id parent))
                                {:type "remote-synced"})
          ;; Verify both still have remote-synced type
          (is (= "remote-synced" (t2/select-one-fn :type :model/Collection :id (:id parent))))
          (is (= "remote-synced" (t2/select-one-fn :type :model/Collection :id (:id child)))))))))

(deftest update-collection-type-cascades-through-multiple-levels-test
  (testing "PUT /api/collection/:id with type change through deep hierarchy"
    (testing "Type change cascades through multiple levels"
      (mt/with-temp [:model/Collection level1 {}
                     :model/Collection level2 {:location (collection/children-location level1)}
                     :model/Collection level3 {:location (collection/children-location level2)}
                     :model/Collection level4 {:location (collection/children-location level3)}]
        ;; Update level1 type
        (mt/user-http-request :crowberto :put 200 (str "collection/" (:id level1))
                              {:type "remote-synced"})

        ;; Verify all levels have the new type
        (is (= "remote-synced" (:type (t2/select-one :model/Collection :id (:id level1)))))
        (is (= "remote-synced" (:type (t2/select-one :model/Collection :id (:id level2)))))
        (is (= "remote-synced" (:type (t2/select-one :model/Collection :id (:id level3)))))
        (is (= "remote-synced" (:type (t2/select-one :model/Collection :id (:id level4)))))))))

(deftest api-move-collection-into-remote-synced-dependency-checking-success-test
  (testing "PUT /api/collection/:id - move collection into remote-synced"
    (testing "Moving a collection into remote-synced parent succeeds when no remote-sync violations"
      (mt/with-model-cleanup [:model/Collection]
        (let [remote-parent (mt/user-http-request :crowberto :post 200 "collection"
                                                  {:name "Remote Parent"
                                                   :type "remote-synced"})
              regular-collection (mt/user-http-request :crowberto :post 200 "collection"
                                                       {:name "Regular Collection"})
              response (mt/user-http-request :crowberto :put 200 (str "collection/" (:id regular-collection))
                                             {:parent_id (:id remote-parent)})]
          (is (= (:id remote-parent) (:parent_id response)))
          (is (= "remote-synced" (:type response)))
          (is (= "remote-synced" (t2/select-one-fn :type :model/Collection :id (:id regular-collection)))))))))

(deftest api-move-collection-into-remote-synced-dependency-checking-failure-test
  (testing "PUT /api/collection/:id - move collection into remote-synced"
    (testing "Moving a collection into remote-synced parent fails when remote-sync violations exist"
      (mt/with-model-cleanup [:model/Collection :model/Card]
        (let [remote-parent (mt/user-http-request :crowberto :post 200 "collection"
                                                  {:name "Remote Parent"
                                                   :type "remote-synced"})
              regular-collection (mt/user-http-request :crowberto :post 200 "collection"
                                                       {:name "Regular Collection"})]
          (mt/with-temp [:model/Card {up-card-id :id} {:dataset_query (mt/mbql-query venues)}
                         :model/Card _ {:collection_id (:id regular-collection)
                                        :dataset_query (mt/mbql-query nil {:source-table (str "card__" up-card-id)})}]
            ;; Try to move regular-collection into remote-parent - should fail
            (let [response (mt/user-http-request :crowberto :put 400 (str "collection/" (:id regular-collection))
                                                 {:parent_id (:id remote-parent)})]
              (is (str/includes? (str response) "remote-synced"))
              ;; Verify collection wasn't moved
              (is (nil? (t2/select-one-fn :parent_id :model/Collection :id (:id regular-collection))))
              (is (nil? (t2/select-one-fn :type :model/Collection :id (:id regular-collection)))))))))))

(deftest api-move-collection-into-remote-synced-dependency-checking-transaction-rollback-test
  (testing "PUT /api/collection/:id - move collection into remote-synced"
    (testing "Transaction rollback on dependency check failure leaves database unchanged"
      (mt/with-model-cleanup [:model/Collection :model/Card]
        (let [remote-parent (mt/user-http-request :crowberto :post 200 "collection"
                                                  {:name "Remote Parent"
                                                   :type "remote-synced"})
              regular-collection (mt/user-http-request :crowberto :post 200 "collection"
                                                       {:name "Regular Collection"})
              child-collection (mt/user-http-request :crowberto :post 200 "collection"
                                                     {:name "Child Collection"
                                                      :parent_id (:id regular-collection)})]
          (mt/with-temp [:model/Card {up-card-id :id} {:dataset_query (mt/mbql-query venues)}
                         :model/Card _ {:collection_id (:id child-collection)
                                        :dataset_query (mt/mbql-query nil {:source-table (str "card__" up-card-id)})}]
            ;; Try to move regular-collection into remote-parent - should fail
            (mt/user-http-request :crowberto :put 400 (str "collection/" (:id regular-collection))
                                  {:parent_id (:id remote-parent)})

            ;; Verify NEITHER regular-collection NOR child-collection types changed
            (is (nil? (t2/select-one-fn :parent_id :model/Collection :id (:id regular-collection))))
            (is (nil? (t2/select-one-fn :type :model/Collection :id (:id regular-collection))))
            (is (nil? (t2/select-one-fn :type :model/Collection :id (:id child-collection))))))))))

(deftest api-move-collection-outside-remote-synced-no-dependency-checking-test
  (testing "PUT /api/collection/:id - move collection out of remote-synced"
    (testing "Moving a collection OUT of remote-synced parent does not check dependencies"
      (mt/with-model-cleanup [:model/Collection :model/Card]
        (let [remote-parent (mt/user-http-request :crowberto :post 200 "collection"
                                                  {:name "Remote Parent"
                                                   :type "remote-synced"})
              child-collection (mt/user-http-request :crowberto :post 200 "collection"
                                                     {:name "Child Collection"
                                                      :parent_id (:id remote-parent)})]
          ;; Child inherits remote-synced type
          (is (= "remote-synced" (t2/select-one-fn :type :model/Collection :id (:id child-collection))))

          ;; Create a card in child without document_id
          (mt/with-temp [:model/Card _ {:collection_id (:id child-collection)
                                        :document_id nil}]
            ;; Move child OUT of remote-parent (to root) - should succeed even with violation
            (let [response (mt/user-http-request :crowberto :put 200 (str "collection/" (:id child-collection))
                                                 {:parent_id nil})]
              (is (nil? (:parent_id response)))
              (is (nil? (:type response)))
              ;; Verify collection was actually moved and type changed
              (is (nil? (t2/select-one-fn :parent_id :model/Collection :id (:id child-collection))))
              (is (nil? (t2/select-one-fn :type :model/Collection :id (:id child-collection)))))))))))
