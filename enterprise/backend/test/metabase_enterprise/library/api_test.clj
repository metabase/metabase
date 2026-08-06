(ns metabase-enterprise.library.api-test
  (:require
   [clojure.test :refer :all]
   [metabase.collections.models.collection :as collection]
   [metabase.collections.test-utils :refer [without-library]]
   [metabase.test :as mt]
   [toucan2.core :as t2]))

(deftest create-library-endpoint-test
  (mt/with-premium-features #{:library}
    (mt/with-discard-model-updates! [:model/Collection]
      (without-library
       (testing "non-data-analysts cannot create the library"
         (mt/user-http-request :rasta :post 403 "ee/library"))
       (testing "POST /ee/library creates the Library root + Data/Metrics subcollections"
         (let [response (mt/user-http-request :crowberto :post 200 "ee/library")]
           (is (= "Library" (:name response)))
           (is (some? (t2/select-one-pk :model/Collection :type collection/library-data-collection-type)))
           (is (some? (t2/select-one-pk :model/Collection :type collection/library-metrics-collection-type)))))
       (testing "a second call rejects with 400 'Library already exists'"
         (is (= "Library already exists"
                (mt/user-http-request :crowberto :post 400 "ee/library"))))))))

(deftest get-library-test
  (mt/with-premium-features #{:library}
    (mt/with-discard-model-updates! [:model/Collection]
      (without-library
       (testing "When there is no library, returns a message but still 200"
         (let [response (mt/user-http-request :crowberto :get 200 "ee/library")]
           (is (= {:data nil} response))))
       (let [_          (collection/create-library-collection!)
             data-id    (t2/select-one-pk :model/Collection :type collection/library-data-collection-type)
             metrics-id (t2/select-one-pk :model/Collection :type collection/library-metrics-collection-type)
             response   (mt/user-http-request :crowberto :get 200 "ee/library")]
         (testing "When library exists, but no content"
           (is (= "Library" (:name response)))
           (is (= ["collection"] (:here response)))
           (is (= [] (:below response))))
         (testing "With content in the library"
           (mt/with-temp [:model/Table _ {:display_name  "Table in Data"
                                          :collection_id data-id
                                          :is_published  true}
                          :model/Card _  {:name          "Card in Metrics"
                                          :collection_id metrics-id
                                          :type          :metric}
                          :model/Card _  {:name          "Other Card in Metrics"
                                          :collection_id metrics-id
                                          :type          :metric}]
             (let [response (mt/user-http-request :crowberto :get 200 "ee/library")]
               (is (= "Library" (:name response)))
               (is (= ["metric" "table"] (:below response)))
               (is (= ["collection"] (:here response)))))))))))

;;; ------------------------------------------ remote-sync worktrees ------------------------------------------

(defn- worktree-library-fixture
  "A worktree holding a checked-out Library, with `Data` under it remapped to the main app's `Data` collection."
  [wt-id main-data-id f]
  (mt/with-temp [:model/Collection wt-library {:name        "Library"
                                               :location    "/"
                                               :type        collection/library-collection-type
                                               :worktree_id wt-id}
                 :model/Collection wt-data    {:name        "Data"
                                               :location    (format "/%d/" (:id wt-library))
                                               :type        collection/library-data-collection-type
                                               :worktree_id wt-id}]
    (t2/insert! :model/WorktreeRemapping
                {:worktree_id      wt-id
                 :type             "Collection"
                 :source_entity_id (t2/select-one-fn :entity_id :model/Collection :id main-data-id)
                 :local_entity_id  (:entity_id wt-data)})
    (f {:library wt-library :data wt-data})))

(deftest library-collection-lookup-ignores-worktrees-test
  (mt/with-premium-features #{:library}
    (mt/with-discard-model-updates! [:model/Collection]
      (without-library
       (mt/with-temp [:model/Worktree   {wt-id :id}  {}
                      :model/Collection wt-library   {:name        "Library"
                                                      :location    "/"
                                                      :type        collection/library-collection-type
                                                      :worktree_id wt-id}]
         (testing "a worktree's Library is not the main app's"
           (is (nil? (collection/library-collection)))
           (is (= (:id wt-library) (:id (collection/library-collection wt-id)))))
         (testing "GET /ee/library does not hand a worktree's Library back as the main app's"
           (is (= {:data nil} (mt/user-http-request :crowberto :get 200 "ee/library"))))
         (testing "and neither does GET /ee/library/tree"
           (is (= [] (mt/user-http-request :crowberto :get 200 "ee/library/tree")))))))))

(deftest get-worktree-library-test
  (mt/with-premium-features #{:library}
    (mt/with-discard-model-updates! [:model/Collection]
      (without-library
       (mt/with-temp [:model/Worktree {wt-id :id} {}]
         (testing "a worktree with no Library of its own returns an empty response"
           (is (= {:data nil} (mt/user-http-request :crowberto :get 200 "ee/library" :worktree-id wt-id))))
         (testing "an unknown worktree 404s rather than falling back to the main app"
           (is (= "Not found."
                  (mt/user-http-request :crowberto :get 404 "ee/library" :worktree-id 99999999))))
         (testing "worktree-id is admin-only"
           (is (= "You don't have permissions to do that."
                  (mt/user-http-request :rasta :get 403 "ee/library" :worktree-id wt-id))))
         (let [main-library (collection/create-library-collection!)
               main-data-id (t2/select-one-pk :model/Collection
                                              :type collection/library-data-collection-type
                                              :location (format "/%d/" (:id main-library)))]
           (worktree-library-fixture
            wt-id main-data-id
            (fn [{wt-library :library}]
              (testing "worktree-id gets that worktree's Library, not the main app's"
                (is (= (:id wt-library)
                       (:id (mt/user-http-request :crowberto :get 200 "ee/library" :worktree-id wt-id)))))
              (testing "and the main-app call still gets the main app's"
                (is (= (:id main-library)
                       (:id (mt/user-http-request :crowberto :get 200 "ee/library")))))
              (testing "the tree is scoped the same way"
                (is (= #{(:id wt-library)}
                       (into #{} (map :id) (mt/user-http-request :crowberto :get 200 "ee/library/tree"
                                                                 :worktree-id wt-id))))
                (is (= #{(:id main-library)}
                       (into #{} (map :id) (mt/user-http-request :crowberto :get 200 "ee/library/tree")))))
              (testing "published tables under the main-app collection count as `below` the worktree's Library"
                (mt/with-temp [:model/Table _ {:display_name  "Published in Data"
                                               :collection_id main-data-id
                                               :is_published  true}]
                  (is (= ["table"]
                         (:below (mt/user-http-request :crowberto :get 200 "ee/library"
                                                       :worktree-id wt-id))))))))))))))

(deftest disallow-cross-type-collection-move-via-api-test
  (mt/with-premium-features #{:library}
    (mt/with-temp [:model/Collection data-parent    {:name "Data Parent"    :type collection/library-data-collection-type}
                   :model/Collection metrics-parent {:name "Metrics Parent" :type collection/library-metrics-collection-type}
                   :model/Collection data-child     {:name "Data Child"     :type collection/library-data-collection-type
                                                     :location (str "/" (:id data-parent) "/")}
                   :model/Collection metrics-child  {:name "Metrics Child"  :type collection/library-metrics-collection-type
                                                     :location (str "/" (:id metrics-parent) "/")}]
      (testing "Moving a library-data collection into a library-metrics parent returns 400"
        (let [response (mt/user-http-request :crowberto :put 400 (str "collection/" (:id data-child))
                                             {:parent_id (:id metrics-parent)})]
          (is (some? response))))
      (testing "Moving a library-metrics collection into a library-data parent returns 400"
        (let [response (mt/user-http-request :crowberto :put 400 (str "collection/" (:id metrics-child))
                                             {:parent_id (:id data-parent)})]
          (is (some? response)))))))
