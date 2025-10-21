(ns metabase-enterprise.embedding-hub.api-test
  (:require
   [clojure.test :refer :all]
   [metabase.test :as mt]))

(deftest has-user-created-models-test
  (testing "has-user-created-models? correctly handles multiple sample collections (metabase#64627)"
    (mt/with-premium-features #{:embedding}
      (mt/with-temp [:model/Collection sample-collection-1 {:name "Sample Collection 1" :is_sample true}
                     :model/Collection sample-collection-2 {:name "Sample Collection 2" :is_sample true}
                     :model/Card user-model {:name "User Model"
                                             :type "model"
                                             :archived false
                                             :collection_id nil
                                             :dataset_query {:database (mt/id)
                                                             :type :query
                                                             :query {:source-table (mt/id :venues)}}}
                     :model/Card _sample-model-1 {:name "Sample Model 1"
                                                  :type "model"
                                                  :archived false
                                                  :collection_id (:id sample-collection-1)
                                                  :dataset_query {:database (mt/id)
                                                                  :type :query
                                                                  :query {:source-table (mt/id :venues)}}}
                     :model/Card _sample-model-2 {:name "Sample Model 2"
                                                  :type "model"
                                                  :archived false
                                                  :collection_id (:id sample-collection-2)
                                                  :dataset_query {:database (mt/id)
                                                                  :type :query
                                                                  :query {:source-table (mt/id :venues)}}}]
        (testing "returns true when there is a model not in any sample collection"
          (let [response (mt/user-http-request :crowberto :get 200 "/ee/embedding-hub/checklist")]
            (is (true? (:create-models response))
                "Should detect the user model with nil collection_id")))

        (testing "returns false when all models are in sample collections"
          ;; Temporarily archive the user model so only sample collection models remain active
          (mt/with-temp-vals-in-db :model/Card (:id user-model) {:archived true}
            (let [response (mt/user-http-request :crowberto :get 200 "/ee/embedding-hub/checklist")]
              (is (false? (:create-models response))
                  "Should exclude models in both sample collections"))))))))
