(ns metabase.api.advanced-computation.preview-embed-test
  (:require [clojure.test :refer :all]
            [metabase.api.advanced-computation.common-test :as common]
            [metabase.api.embed-test :as embed-test]
            [metabase.test :as mt]
            [metabase.test.util :as tu]
            [metabase.util :as u]))

(defn- preview-embed-card-query-url [card & [additional-token-params]]
  (str "advanced_computation/preview_embed/pivot/card/"
       (embed-test/card-token card (merge {:_embedding_params {}} additional-token-params))
       "/query"))

(deftest preview-embed-query-test
  (mt/test-drivers common/applicable-drivers
    (mt/dataset sample-dataset
      (testing "GET /api/advanced_computation/preview_embed/pivot/card/:token/query"
        (testing "successful preview"
          (let [result (embed-test/with-embedding-enabled-and-new-secret-key
                         (common/with-temp-card [card]
                           (mt/user-http-request :crowberto :get 202 (preview-embed-card-query-url card))))
                rows   (mt/rows result)]
            (is (nil? (:row_count result))) ;; row_count isn't included in public endpoints
            (is (= "completed" (:status result)))
            (is (= 6 (count (get-in result [:data :cols]))))
            (is (= 2273 (count rows)))))

        (testing "should fail if user is not an admin"
          (is (= "You don't have permissions to do that."
                 (embed-test/with-embedding-enabled-and-new-secret-key
                   (common/with-temp-card [card]
                     (mt/user-http-request :rasta :get 403 (preview-embed-card-query-url card)))))))

        (testing "should fail if embedding is disabled"
          (is (= "Embedding is not enabled."
                 (tu/with-temporary-setting-values [enable-embedding false]
                   (embed-test/with-new-secret-key
                     (common/with-temp-card [card]
                       (mt/user-http-request :crowberto :get 400 (preview-embed-card-query-url card))))))))

        (testing "should fail if embedding is enabled and the wrong key is used"
          (is (= "Message seems corrupt or manipulated."
                 (embed-test/with-embedding-enabled-and-new-secret-key
                   (common/with-temp-card [card]
                     (mt/user-http-request :crowberto :get 400 (embed-test/with-new-secret-key (preview-embed-card-query-url card))))))))))))

(defn- preview-embed-dashcard-url {:style/indent 1} [dashcard & [additional-token-params]]
  (str "advanced_computation/preview_embed/pivot/dashboard/"
       (embed-test/dash-token (:dashboard_id dashcard) (merge {:_embedding_params {}}
                                                              additional-token-params))
       "/dashcard/" (u/get-id dashcard)
       "/card/" (:card_id dashcard)))

(deftest preview-embed-card-id-test
  (mt/test-drivers common/applicable-drivers
    (mt/dataset sample-dataset
      (testing "GET /api/advanced_computation/preview_embed/pivot/dashboard/:token/dashcard/:dashcard-id/card/:card-id"
        (testing "successful preview"
          (let [result (embed-test/with-embedding-enabled-and-new-secret-key
                         (common/with-temp-dashcard [dashcard]
                           (mt/user-http-request :crowberto :get 202 (preview-embed-dashcard-url dashcard))))
                rows   (mt/rows result)]
            (is (nil? (:row_count result))) ;; row_count isn't included in public endpoints
            (is (= "completed" (:status result)))
            (is (= 6 (count (get-in result [:data :cols]))))
            (is (= 2273 (count rows)))))

       (testing "should fail if user is not an admin"
          (is (= "You don't have permissions to do that."
                 (embed-test/with-embedding-enabled-and-new-secret-key
                   (common/with-temp-dashcard [dashcard]
                     (mt/user-http-request :rasta :get 403 (preview-embed-dashcard-url dashcard)))))))

        (testing "should fail if embedding is disabled"
          (is (= "Embedding is not enabled."
                 (tu/with-temporary-setting-values [enable-embedding false]
                   (embed-test/with-new-secret-key
                     (common/with-temp-dashcard [dashcard]
                       (mt/user-http-request :crowberto :get 400 (preview-embed-dashcard-url dashcard))))))))

        (testing "should fail if embedding is enabled and the wrong key is used"
          (is (= "Message seems corrupt or manipulated."
                 (embed-test/with-embedding-enabled-and-new-secret-key
                   (common/with-temp-dashcard [dashcard]
                     (mt/user-http-request :crowberto :get 400 (embed-test/with-new-secret-key (preview-embed-dashcard-url dashcard))))))))))))
