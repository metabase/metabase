(ns metabase-enterprise.library.api-test
  (:require
   [clojure.test :refer :all]
   [metabase.collections.models.collection :as collection]
   [metabase.collections.test-utils :refer [without-library]]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]
   [toucan2.core :as t2]))

(use-fixtures :once (fixtures/initialize :db :test-users))

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
               (is (= ["collection"] (:here response))))))
         (testing "Inactive (deactivated) tables should NOT appear in library :below"
           (mt/with-temp [:model/Table _ {:display_name  "Inactive Table in Data"
                                          :collection_id data-id
                                          :is_published  true
                                          :active        false}]
             (let [response (mt/user-http-request :crowberto :get 200 "ee/library")]
               (is (= [] (:below response))
                   "Deactivated published table should not show up in library :below")))))))))

(deftest deactivated-published-tables-not-shown-in-library-test
  (testing "Deactivated published tables should not appear in collection items (GET /api/collection/:id/items)"
    (mt/with-premium-features #{:library}
      (mt/with-discard-model-updates! [:model/Collection]
        (without-library
         (collection/create-library-collection!)
         (let [data-id (t2/select-one-pk :model/Collection :type collection/library-data-collection-type)]
           (mt/with-temp [:model/Table {table-id :id} {:display_name  "Published Active Table"
                                                       :collection_id data-id
                                                       :is_published  true
                                                       :active        true}]
             (testing "Active published table appears in collection items"
               (let [items (:data (mt/user-http-request :crowberto :get 200
                                                        (str "collection/" data-id "/items")
                                                        :models "table"))]
                 (is (= 1 (count items)))
                 (is (= table-id (:id (first items))))))
             (testing "After deactivation, table no longer appears in collection items"
               (t2/update! :model/Table table-id {:active false})
               (let [items (:data (mt/user-http-request :crowberto :get 200
                                                        (str "collection/" data-id "/items")
                                                        :models "table"))]
                 (is (= 0 (count items))
                     "Deactivated published table should not be in collection items"))))))))))
