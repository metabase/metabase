(ns metabase-enterprise.library.api-test
  (:require
   [clojure.test :refer :all]
   [metabase.collections.models.collection :as collection]
   [metabase.collections.test-utils :refer [without-library]]
   [metabase.test :as mt]
   [toucan2.core :as t2]))

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
