(ns metabase-enterprise.embedding.api.setting-test
  (:require
   [clojure.test :refer :all]
   [metabase.models.setting :as setting]
   [metabase.public-settings.premium-features-test :as premium-features-test]
   [metabase.test :as mt]))

(deftest set-app-embedding-origin-test
  (mt/discard-setting-changes [embedding-app-origin]
    (testing "PUT /api/setting/embedding-app-origin"
      (testing "when :embedding is enabled"
        (premium-features-test/with-premium-features #{:embedding}
          (testing "only admins can update it"
            (mt/user-http-request :crowberto :put 204 "setting/embedding-app-origin"
                                  {:value "https://metabase.com"})
            (is (= "https://metabase.com"
                   (mt/user-http-request :crowberto :get 200 "setting/embedding-app-origin"))))

          (testing "non-adminds get 403"
            (is (= "You don't have permissions to do that."
                   (mt/user-http-request :rasta :put 403 "setting/embedding-app-origin"
                                         {:value "https://metabase.com"}))))))

      (testing "when :embedding is disabled"
        (premium-features-test/with-premium-features #{}
          (testing "can't set embedding-app-origin"
            (is (= "Embedding is an enterprise feature. Please upgrade to a paid plan to use this feature."
                   (mt/user-http-request :crowberto :put 402 "setting/embedding-app-origin"
                                         {:value "https://metabase.com"}))))

          (testing "but you can empty the value in case it has been set before"
            (premium-features-test/with-premium-features #{:embedding}
              (setting/set! :embedding-app-origin "https://metabase.com"))
            (mt/user-http-request :crowberto :put 204 "setting/embedding-app-origin"
                                  {:value ""})
            (is (= nil
                   (mt/user-http-request :crowberto :get 204 "setting/embedding-app-origin")))))))))
