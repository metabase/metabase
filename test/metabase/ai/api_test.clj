(ns metabase.ai.api-test
  (:require
   [clojure.test :refer :all]
   [metabase.ai.openai :as ai.openai]
   [metabase.permissions.models.permissions :as perms]
   [metabase.test :as mt]))

(set! *warn-on-reflection* true)

(defn- mbql-count-query []
  {:database (mt/id)
   :type     :query
   :query    {:source-table (mt/id :venues)
              :aggregation  [[:count]]}})

(deftest ai-summary-permissions-test
  (testing "POST /api/ai/summary/card/:card-id enforces read permissions"
    (mt/with-non-admin-groups-no-root-collection-perms
      (mt/with-temporary-setting-values [ai-openai-api-key "test-key"]
        (mt/with-temp [:model/Collection {collection-id :id} {:name "Restricted"}
                       :model/Card {card-id :id} {:name "Restricted Card"
                                                  :collection_id collection-id
                                                  :dataset_query (mbql-count-query)
                                                  :display "scalar"}]
          (with-redefs [ai.openai/summarize! (fn [_prompt] {:markdown "ok" :model "test"})]
            (mt/user-http-request :rasta :post 403 (format "ai/summary/card/%d" card-id))))))))

(deftest ai-summary-returns-markdown-test
  (testing "POST /api/ai/summary/card/:card-id returns markdown"
    (mt/with-non-admin-groups-no-root-collection-perms
      (mt/with-temporary-setting-values [ai-openai-api-key "test-key"
                                         ai-openai-model "gpt-test"]
        (mt/with-temp [:model/Collection {collection-id :id} {:name "Readable"}
                       :model/Card {card-id :id} {:name "Readable Card"
                                                  :collection_id collection-id
                                                  :dataset_query (mbql-count-query)
                                                  :display "scalar"}]
          (mt/with-group-for-user [group :rasta {:name "Rasta Group"}]
            (perms/grant-collection-read-permissions! group collection-id)
            (with-redefs [ai.openai/summarize! (fn [_prompt] {:markdown "# Summary" :model "gpt-test"})]
              (let [response (mt/user-http-request :rasta :post 200
                                                   (format "ai/summary/card/%d" card-id))]
                (is (string? (:markdown response)))))))))))
