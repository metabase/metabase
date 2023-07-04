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

      (testing "when :embedding is not enabled"
        (premium-features-test/with-premium-features #{}
          (testing "can't set embedding-app-origin"
            (is (= "Embedding is an Enterprise feature. Please upgrade to a paid plan to use this feature."
                   (mt/user-http-request :crowberto :put 402 "setting/embedding-app-origin"
                                         {:value "https://metabase.com"}))))

          (testing "but you can empty the value in case it has been set before"
            (premium-features-test/with-premium-features #{:embedding}
              (setting/set! :embedding-app-origin "https://metabase.com"))
            (mt/user-http-request :crowberto :put 204 "setting/embedding-app-origin"
                                  {:value ""})
            (is (= nil
                   (mt/user-http-request :crowberto :get 204 "setting/embedding-app-origin")))))))))

(deftest set-app-embedding-origin-via-env-test
  (mt/with-temp-env-var-value [mb-embedding-app-origin "https://metabase.com"]
    (testing "getting embedding-app-origin when :embedding is not enabled return nil
             even when the value is set via env"
      (is (nil? (:embedding-app-origin (mt/user-http-request :crowberto :get 200 "session/properties")))))

    (premium-features-test/with-premium-features #{:embedding}
      (testing "getting session properties return the value from env"
        (is (= "https://metabase.com"
               (:embedding-app-origin (mt/user-http-request :crowberto :get 200 "session/properties")))))
      (testing "getting setting key mention this key is from env"
        (is (true? (->> (mt/user-http-request :crowberto :get 200 "setting")
                      (filter #(= (:key %) "embedding-app-origin"))
                      first
                      :is_env_setting)))))))
