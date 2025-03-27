(ns metabase-enterprise.advanced-config.file.api-keys-test
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.advanced-config.file :as advanced-config.file]
   [metabase-enterprise.advanced-config.file.api-keys :as api-keys]
   [metabase.models.api-key :as api-key]
   [metabase.models.user :as user]
   [metabase.premium-features-test :as premium-features-test]
   [metabase.test :as mt]
   [metabase.util.log :as log]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(use-fixtures :each (fn [thunk]
                      (binding [advanced-config.file/*supported-versions* {:min 1, :max 1}]
                        (mt/with-premium-features #{:config-text-file}
                          (thunk)))))

(defn- write-config! [config]
  (spit "config.yml" (yaml/generate-string config)))

(defn- cleanup-config! []
  (u/ignore-exceptions
    (doseq [api-key (t2/select :model/ApiKey)]
      (t2/delete! :model/ApiKey :id (:id api-key)))
    (doseq [user (t2/select :model/User :type :api-key)]
      (t2/delete! :model/User :id (:id user)))
    (.delete (java.io.File. "config.yml"))))

(defn- api-key-exists? [name]
  (t2/exists? :model/ApiKey :name name))

(defn- api-key-user-exists? [name]
  (t2/exists? :model/User :first_name name :type :api-key))

(deftest api-keys-config-test
  (mt/with-premium-features #{:config-text-file}
    (mt/with-temp [:model/User _ {:email "admin@test.com"
                                  :first_name "Admin"
                                  :is_superuser true}]
      (testing "should create API keys from config"
        (try
          (write-config!
           {:version 1
            :config {:api-keys [{:name "Test API Key"
                                 :key "mb_testapikey123"
                                 :creator "admin@test.com"
                                 :group "admin"}
                                {:name "All Users API Key"
                                 :key "mb_differentapikey456"
                                 :creator "admin@test.com"
                                 :group "all-users"}]}})
          (binding [advanced-config.file/*config* {:version 1
                                          :config {:api-keys [{:name "Test API Key"
                                                               :key "mb_testapikey123"
                                                               :creator "admin@test.com"
                                                               :group "admin"}
                                                              {:name "All Users API Key"
                                                               :key "mb_differentapikey456"
                                                               :creator "admin@test.com"
                                                               :group "all-users"}]}}]
            (is (= :ok (advanced-config.file/initialize!)))
            (testing "API keys should be created"
              (is (api-key-exists? "Test API Key"))
              (is (api-key-exists? "All Users API Key")))
            (testing "API key users should be created"
              (is (api-key-user-exists? "Test API Key"))
              (is (api-key-user-exists? "All Users API Key"))))
          (finally
            (cleanup-config!))))

      (testing "should fail if API keys have the same prefix"
        (try
          (write-config!
           {:version 1
            :config {:api-keys [{:name "First API Key"
                                 :key "mb_sameprefix_123"
                                 :creator "admin@test.com"
                                 :group "admin"}]}})
          (binding [advanced-config.file/*config* {:version 1
                                          :config {:api-keys [{:name "First API Key"
                                                               :key "mb_sameprefix123"
                                                               :creator "admin@test.com"
                                                               :group "admin"}
                                                              {:name "Second API Key"
                                                               :key "mb_sameprefix456"
                                                               :creator "admin@test.com"
                                                               :group "admin"}]}}]
            (is (thrown-with-msg?
                 clojure.lang.ExceptionInfo
                 #"API key with prefix 'mb_same' already exists\. Keys must have unique prefixes\."
                 (advanced-config.file/initialize!))))
          (finally
            (cleanup-config!))))

      (testing "should fail if creator is not an admin"
        (try
          (mt/with-temp [:model/User _ {:email "regular@test.com"
                                        :first_name "Regular"
                                        :is_superuser false}]
            (binding [advanced-config.file/*config* {:version 1
                                            :config {:api-keys [{:name "Test API Key"
                                                                 :key "mb_1testapikey123"
                                                                 :creator "regular@test.com"
                                                                 :group "admin"}]}}]
              (is (thrown-with-msg?
                   clojure.lang.ExceptionInfo
                   #"User with email regular@test.com is not an admin"
                   (advanced-config.file/initialize!)))))
          (finally
            (cleanup-config!))))

      (testing "should fail if creator doesn't exist"
        (try
          (binding [advanced-config.file/*config* {:version 1
                                          :config {:api-keys [{:name "Test API Key"
                                                               :key "mb_2testapikey123"
                                                               :creator "nonexistent@test.com"
                                                               :group "admin"}]}}]
            (is (thrown-with-msg?
                 clojure.lang.ExceptionInfo
                 #"User with email nonexistent@test.com not found"
                 (advanced-config.file/initialize!))))
          (finally
            (cleanup-config!))))

      (testing "should skip existing API keys"
        (try
          (binding [advanced-config.file/*config* {:version 1
                                          :config {:api-keys [{:name "Test API Key"
                                                               :key "mb_3testapikey123"
                                                               :creator "admin@test.com"
                                                               :group "admin"}]}}]
            (advanced-config.file/initialize!)
            (let [first-key (t2/select-one :model/ApiKey :name "Test API Key")
                  _ (binding [advanced-config.file/*config* {:version 1
                                                    :config {:api-keys [{:name "Test API Key"
                                                                         :key "mb_4testapikey123"
                                                                         :creator "admin@test.com"
                                                                         :group "admin"}]}}]
                      (advanced-config.file/initialize!))
                  second-key (t2/select-one :model/ApiKey :name "Test API Key")]
              (is (= (:id first-key) (:id second-key)))))
          (finally
            (cleanup-config!))))

      (testing "should validate group values"
        (try
          (binding [advanced-config.file/*config* {:version 1
                                          :config {:api-keys [{:name "Test API Key"
                                                               :key "mb_5testapikey123"
                                                               :creator "admin@test.com"
                                                               :group "invalid-group"}]}}]
            (is (thrown? clojure.lang.ExceptionInfo
                         (advanced-config.file/initialize!))))
          (finally
            (cleanup-config!)))))))

(defn- api-key-fixture
  "A test fixture that removes all API keys from the database after the test has run."
  [f]
  (try
    (f)
    (finally
      (t2/delete! :model/ApiKey :name [:like "Test API Key %"])
      (t2/delete! :model/User :email [:like "%api-key-user-%"]))))

(deftest ^:parallel api-key-validation-test
  (testing "Validate API key format"
    (let [validate-api-key #'api-keys/validate-api-key]
      (testing "Valid API keys don't throw exceptions"
        (is (nil? (validate-api-key "mb_12345678901234567890"))))
        
      (testing "Invalid API keys should throw detailed exceptions"
        (is (thrown-with-msg? Exception #"API key must start with 'mb_'"
                             (validate-api-key "invalid_key")))
        (is (thrown-with-msg? Exception #"API key must start with 'mb_'"
                             (validate-api-key "123456789012345")))))))

(deftest ^:parallel api-key-name-check-first-test
  (mt/with-log-level :info
    (testing "Check existing key by name first"
      (premium-features-test/with-premium-features #{:config-text-file}
        (with-redefs [advanced-config.file/config (constantly
                                                  {:version 1
                                                   :config
                                                   {:api-keys
                                                    [{:name "Test API Key 1"
                                                      :key "mb_12345678901234567890"
                                                      :creator (:email (mt/fetch-user :crowberto))
                                                      :group "admin"}]}})]
          (mt/with-log-messages [log-messages]
            ;; Initialize the API key
            (advanced-config.file/initialize!)
            ;; Try to initialize it again
            (advanced-config.file/initialize!)
            (is (= 1 (t2/count :model/ApiKey :name "Test API Key 1")))
            (is (some #(re-matches #".*API key with name \"Test API Key 1\" already exists, skipping.*" %)
                     (map str log-messages)))))))))

(deftest ^:parallel api-key-env-var-test
  (mt/with-log-level :info
    (testing "Environment variable substitution before validation"
      (premium-features-test/with-premium-features #{:config-text-file}
        (mt/with-temp-env-var-value {:api_key_for_test "mb_12345678901234567890"}
          (with-redefs [advanced-config.file/config (constantly
                                                    {:version 1
                                                     :config
                                                     {:api-keys
                                                      [{:name "Test API Key 2"
                                                        :key "{{ env api_key_for_test }}"
                                                        :creator (:email (mt/fetch-user :crowberto))
                                                        :group "admin"}]}})]
            (mt/with-log-messages [log-messages]
              ;; This would fail before our fix because it would try to validate "{{ env api_key_for_test }}"
              ;; directly instead of the resolved value
              (advanced-config.file/initialize!)
              (is (= 1 (t2/count :model/ApiKey :name "Test API Key 2")))
              (is (some #(re-matches #".*Creating new API key \"Test API Key 2\".*" %)
                       (map str log-messages))))))))))
