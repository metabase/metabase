(ns metabase-enterprise.library.api-test
  (:require
   [clojure.test :refer :all]
   [metabase.collections.models.collection :as collection]
   [metabase.collections.test-helpers :refer [without-library]]
   [metabase.test :as mt]
   [toucan2.core :as t2]))

(deftest get-library-test
  (mt/with-premium-features #{:data-studio}
    (mt/with-discard-model-updates! [:model/Collection]
      (without-library
       (testing "When there is no library, returns a message but still 200"
         (let [response (mt/user-http-request :crowberto :get 200 "ee/library")]
           (is (= {:message "Library does not exist"} response))))
       (let [_          (collection/create-library-collection!)
             models-id  (t2/select-one-pk :model/Collection :type collection/library-models-collection-type)
             metrics-id (t2/select-one-pk :model/Collection :type collection/library-metrics-collection-type)
             response   (mt/user-http-request :crowberto :get 200 "ee/library")]
         (testing "When library exists, but no content"
           (is (= "Library" (:name response)))
           (is (= ["collection"] (:here response)))
           (is (= [] (:below response))))
         (testing "With content in the library"
           (mt/with-temp [:model/Card _ {:name          "Card in Models"
                                         :collection_id models-id
                                         :type          :model}
                          :model/Card _ {:name          "Card in Metrics"
                                         :collection_id metrics-id
                                         :type          :metric}
                          :model/Card _ {:name          "Other Card in Metrics"
                                         :collection_id metrics-id
                                         :type          :metric}]
             (let [response (mt/user-http-request :crowberto :get 200 "ee/library")]
               (is (= "Library" (:name response)))
               (is (= ["dataset" "metric"] (:below response)))
               (is (= ["collection"] (:here response)))))))))))
