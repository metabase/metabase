(ns metabase-enterprise.remote-sync.collection-api-test
  (:require
   [clojure.test :refer :all]
   [metabase.collections.models.collection :as collection]
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
        (mt/with-temporary-setting-values [remote-sync-type :development]
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
        (mt/with-temporary-setting-values [remote-sync-type :development]
          (let [response (mt/user-http-request :crowberto :put 200 (str "collection/" (u/the-id collection))
                                               {:type nil})]
            (is (nil? (:type response)))
            ;; Verify it was actually saved with nil type
            (is (nil? (t2/select-one-fn :type :model/Collection :id (:id collection))))))))

    (testing "Cannot update a collection from 'remote-synced' to nil when remote-sync-type is production"
      (mt/with-temp [:model/Collection collection {:name "Remote Collection" :type "remote-synced"}]
        ;; Verify it starts with remote-synced type
        (is (= "remote-synced" (t2/select-one-fn :type :model/Collection :id (:id collection))))
        ;; Update to nil
        (mt/with-temporary-setting-values [remote-sync-type :production]
          (mt/user-http-request :crowberto :put 403 (str "collection/" (u/the-id collection))
                                {:type nil})
          (is (= "remote-synced" (t2/select-one-fn :type :model/Collection :id (:id collection)))))))

    (testing "Can update other properties without changing type"
      (mt/with-temp [:model/Collection collection {:name "Test Collection" :type "remote-synced"}]
        ;; Update name without specifying type
        (mt/with-temporary-setting-values [remote-sync-type :development]
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

(deftest update-collection-type-cascades-to-children-test
  (testing "PUT /api/collection/:id with type change"
    (testing "Updating a collection's type should cascade to all child collections"
      (mt/with-temporary-setting-values [remote-sync-type :development]
        (mt/with-temp [:model/Collection parent {}
                       :model/Collection child-1 {:location (collection/children-location parent)}
                       :model/Collection child-2 {:location (collection/children-location parent)}
                       :model/Collection grandchild {:location (collection/children-location child-1)}]
          ;; Verify initial state - all should have nil type
          (is (nil? (:type (t2/select-one :model/Collection :id (:id parent)))))
          (is (nil? (:type (t2/select-one :model/Collection :id (:id child-1)))))
          (is (nil? (:type (t2/select-one :model/Collection :id (:id child-2)))))
          (is (nil? (:type (t2/select-one :model/Collection :id (:id grandchild)))))

          ;; Update parent collection type to "remote-synced"
          (mt/user-http-request :crowberto :put 200 (str "collection/" (:id parent))
                                {:type "remote-synced"})

          ;; Verify all descendants now have the same type
          (is (= "remote-synced" (:type (t2/select-one :model/Collection :id (:id parent)))))
          (is (= "remote-synced" (:type (t2/select-one :model/Collection :id (:id child-1)))))
          (is (= "remote-synced" (:type (t2/select-one :model/Collection :id (:id child-2)))))
          (is (= "remote-synced" (:type (t2/select-one :model/Collection :id (:id grandchild))))))))))

(deftest update-collection-type-to-nil-cascades-test
  (testing "PUT /api/collection/:id with type change to nil"
    (testing "Changing type from remote-synced to nil should cascade to children"
      (mt/with-temporary-setting-values [remote-sync-type :development]
        (mt/with-temp [:model/Collection parent {:type "remote-synced"}
                       :model/Collection child {:location (collection/children-location parent)
                                                :type "remote-synced"}]
          ;; Verify initial state
          (is (= "remote-synced" (:type (t2/select-one :model/Collection :id (:id parent)))))
          (is (= "remote-synced" (:type (t2/select-one :model/Collection :id (:id child)))))

          ;; Update parent collection type to nil
          (mt/user-http-request :crowberto :put 200 (str "collection/" (:id parent))
                                {:type nil})

          ;; Verify both parent and child now have nil type
          (is (nil? (:type (t2/select-one :model/Collection :id (:id parent)))))
          (is (nil? (:type (t2/select-one :model/Collection :id (:id child))))))))))

(deftest update-collection-type-does-not-affect-unrelated-collections-test
  (testing "PUT /api/collection/:id with type change"
    (testing "Type change should not affect unrelated collections"
      (mt/with-temporary-setting-values [remote-sync-type :development]
        (mt/with-temp [:model/Collection parent {}
                       :model/Collection child {:location (collection/children-location parent)}
                       :model/Collection unrelated {}]
          ;; Update parent collection type
          (mt/user-http-request :crowberto :put 200 (str "collection/" (:id parent))
                                {:type "remote-synced"})

          ;; Verify parent and child have the new type
          (is (= "remote-synced" (:type (t2/select-one :model/Collection :id (:id parent)))))
          (is (= "remote-synced" (:type (t2/select-one :model/Collection :id (:id child)))))

          ;; Verify unrelated collection is unchanged
          (is (nil? (:type (t2/select-one :model/Collection :id (:id unrelated))))))))))

(deftest update-collection-type-only-cascades-when-changed-test
  (testing "PUT /api/collection/:id with same type"
    (testing "Type change cascades only when type actually changes"
      (mt/with-temporary-setting-values [remote-sync-type :development]
        (mt/with-temp [:model/Collection parent {:type "remote-synced"}
                       :model/Collection child {:location (collection/children-location parent)
                                                :type "remote-synced"}]
          ;; Update parent with same type (no actual change)
          (mt/user-http-request :crowberto :put 200 (str "collection/" (:id parent))
                                {:name "Updated Name"
                                 :type "remote-synced"})

          ;; Verify types remain unchanged
          (is (= "remote-synced" (:type (t2/select-one :model/Collection :id (:id parent)))))
          (is (= "remote-synced" (:type (t2/select-one :model/Collection :id (:id child))))))))))

(deftest update-collection-type-cascades-through-multiple-levels-test
  (testing "PUT /api/collection/:id with type change through deep hierarchy"
    (testing "Type change cascades through multiple levels"
      (mt/with-temporary-setting-values [remote-sync-type :development]
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
          (is (= "remote-synced" (:type (t2/select-one :model/Collection :id (:id level4))))))))))

(deftest api-move-collection-into-remote-synced-dependency-checking-success-test
  (testing "PUT /api/collection/:id with parent_id in library succeeds when all dependencies are in library"
    (mt/with-temp [:model/Collection {library-id :id} {:name "Library" :location "/" :type "remote-synced"}
                   :model/Collection {parent-id :id} {:name "Parent" :location (format "/%d/" library-id) :type "remote-synced"}
                   :model/Collection {coll-id :id} {:name "Collection to Move"
                                                    :location "/"
                                                    :type nil}
                   :model/Card {library-card-id :id} {:name "Library Card"
                                                      :collection_id library-id
                                                      :dataset_query (mt/native-query {:query "SELECT 1"})}
                   :model/Card _ {:name "Dependent Card"
                                  :collection_id coll-id
                                  :dataset_query (mt/mbql-query nil {:source-table (str "card__" library-card-id)})}]
      ;; This should succeed because the dependency (library-card) is in a library collection
      (let [response (mt/user-http-request :crowberto :put 200 (str "collection/" coll-id)
                                           {:parent_id parent-id})]
        ;; Verify the collection was moved and became library type
        (is (= "remote-synced" (:type response))
            "Collection should have library type")
        (is (= parent-id (:parent_id response))
            "Collection should be moved to library parent")))))

(deftest api-move-collection-into-remote-synced-dependency-checking-failure-test
  (testing "PUT /api/collection/:id with parent_id in library throws 400 when dependencies exist outside library"
    (mt/with-temp [:model/Collection {non-library-id :id} {:name "Non-Library" :location "/" :type nil}
                   :model/Collection {library-id :id} {:name "Library" :location "/" :type "remote-synced"}
                   :model/Collection {parent-id :id} {:name "Parent" :location (format "/%d/" library-id) :type "remote-synced"}
                   :model/Collection {coll-id :id} {:name "Collection to Move"
                                                    :location "/"
                                                    :type nil}
                   :model/Card {non-library-card-id :id} {:name "Non-Library Card"
                                                          :collection_id non-library-id
                                                          :dataset_query (mt/native-query {:query "SELECT 1"})}
                   :model/Card _ {:name "Dependent Card"
                                  :collection_id coll-id
                                  :dataset_query (mt/mbql-query nil {:source-table (str "card__" non-library-card-id)})}]
      ;; This should return 400 because the dependency (non-library-card) is not in a library collection
      (let [response (mt/user-http-request :crowberto :put 400 (str "collection/" coll-id)
                                           {:parent_id parent-id})]
        ;; Verify error response contains dependency information
        (is (str/includes? (:message response) "non-remote-synced dependencies")
            "Error message should mention non-remote-synced dependencies"))

      ;; Verify the transaction was rolled back - collection should not be moved or changed
      (let [unchanged-coll (t2/select-one :model/Collection :id coll-id)]
        (is (nil? (:type unchanged-coll))
            "Collection type should remain unchanged after failed move")
        (is (= "/" (:location unchanged-coll))
            "Collection location should remain unchanged after failed move")))))

(deftest api-move-collection-into-remote-synced-dependency-checking-transaction-rollback-test
  (testing "PUT /api/collection/:id transaction rollback when dependency check fails after updates"
    (mt/with-temp [:model/Collection {non-library-id :id} {:name "Non-Library" :location "/" :type nil}
                   :model/Collection {library-id :id} {:name "Library" :location "/" :type "remote-synced"}
                   :model/Collection {parent-id :id} {:name "Parent" :location (format "/%d/" library-id) :type "remote-synced"}
                   :model/Collection {coll-id :id} {:name "Collection to Move"
                                                    :location "/"
                                                    :type nil}
                   :model/Collection {child-id :id} {:name "Child Collection"
                                                     :location (format "/%d/" coll-id)
                                                     :type nil}
                   :model/Card {non-library-card-id :id} {:name "Non-Library Card"
                                                          :collection_id non-library-id
                                                          :dataset_query (mt/native-query {:query "SELECT 1"})}
                   :model/Card _ {:name "Dependent Card"
                                  :collection_id coll-id
                                  :dataset_query (mt/mbql-query nil {:source-table (str "card__" non-library-card-id)})}]
      ;; This should return 400 with transaction rollback
      (mt/user-http-request :crowberto :put 400 (str "collection/" coll-id)
                            {:parent_id parent-id})

      ;; Verify the transaction was completely rolled back
      (let [unchanged-coll (t2/select-one :model/Collection :id coll-id)]
        (is (nil? (:type unchanged-coll))
            "Collection type should remain unchanged after transaction rollback")
        (is (= "/" (:location unchanged-coll))
            "Collection location should remain unchanged after transaction rollback"))

      (let [unchanged-child (t2/select-one :model/Collection :id child-id)]
        (is (nil? (:type unchanged-child))
            "Child collection type should remain unchanged after transaction rollback")
        (is (= (format "/%d/" coll-id) (:location unchanged-child))
            "Child collection location should remain unchanged after transaction rollback")))))

(deftest api-move-collection-outside-remote-synced-no-dependency-checking-test
  (testing "PUT /api/collection/:id to non-library parent does not check dependencies"
    (mt/with-temp [:model/Collection {non-library-id :id} {:name "Non-Library" :location "/" :type nil}
                   :model/Collection {parent-id :id} {:name "Parent" :location "/" :type nil}
                   :model/Collection {coll-id :id} {:name "Collection to Move"
                                                    :location "/"
                                                    :type nil}
                   :model/Card {non-library-card-id :id} {:name "Non-Library Card"
                                                          :collection_id non-library-id
                                                          :dataset_query (mt/native-query {:query "SELECT 1"})}
                   :model/Card _ {:name "Dependent Card"
                                  :collection_id coll-id
                                  :dataset_query (mt/mbql-query nil {:source-table (str "card__" non-library-card-id)})}]
      ;; This should succeed because we're not moving into a library collection
      (let [response (mt/user-http-request :crowberto :put 200 (str "collection/" coll-id)
                                           {:parent_id parent-id})]
        ;; Verify the collection was moved but did not become library type
        (is (nil? (:type response))
            "Collection should not have library type")
        (is (= parent-id (:parent_id response))
            "Collection should be moved to new parent")))))
