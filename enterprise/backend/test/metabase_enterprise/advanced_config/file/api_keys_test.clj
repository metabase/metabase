(ns metabase-enterprise.advanced-config.file.api-keys-test
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.advanced-config.file :as config.file]
   [metabase.models.api-key :refer [ApiKey]]
   [metabase.models.user :refer [User]]
   [metabase.public-settings.premium-features-test :as premium-features-test]
   [metabase.test :as mt]
   [metabase.util :as u]
   [metabase.util.yaml :as yaml]
   [toucan2.core :as t2]
   [toucan2.tools.with-temp :as t2.with-temp]))

(defn- write-config! [config]
  (spit "config.yml" (yaml/generate-string config)))

(defn- cleanup-config! []
  (u/ignore-exceptions
    (doseq [api-key (t2/select ApiKey)]
      (t2/delete! ApiKey :id (:id api-key)))
    (doseq [user (t2/select User :type :api-key)]
      (t2/delete! User :id (:id user)))
    (.delete (java.io.File. "config.yml"))))

(defn- api-key-exists? [name]
  (boolean (t2/select-one ApiKey :name name)))

(defn- api-key-user-exists? [name]
  (boolean (t2/select-one User :first_name name :type :api-key)))

(deftest api-keys-config-test
  (mt/with-temp-env-var-value [mb-config-file-path "config.yml"]
    (premium-features-test/with-premium-features #{:config-text-file}
      (t2.with-temp/with-temp [User {:email "admin@test.com"
                                    :first_name "Admin"
                                    :is_superuser true}]
        (testing "should create API keys from config"
          (try
            (write-config!
             {:version 1
              :config {:api-keys [{:name "Test API Key"
                                 :key "test_api_key_123"
                                 :creator "admin@test.com"
                                 :group "admin"
                                 :description "Test API key"}
                                {:name "All Users API Key"
                                 :key "test_api_key_456"
                                 :creator "admin@test.com"
                                 :group "all-users"}]}})
            (is (= :ok (config.file/initialize!)))
            (testing "API keys should be created"
              (is (api-key-exists? "Test API Key"))
              (is (api-key-exists? "All Users API Key")))
            (testing "API key users should be created"
              (is (api-key-user-exists? "Test API Key"))
              (is (api-key-user-exists? "All Users API Key")))
            (testing "API key should have correct properties"
              (let [api-key (t2/select-one ApiKey :name "Test API Key")]
                (is (string? (:key_prefix api-key)))
                (is (= "Test API key" (:description api-key)))))
            (finally
              (cleanup-config!))))

        (testing "should fail if creator is not an admin"
          (try
            (t2.with-temp/with-temp [User {:email "regular@test.com"
                                          :first_name "Regular"
                                          :is_superuser false}]
              (write-config!
               {:version 1
                :config {:api-keys [{:name "Test API Key"
                                   :key "test_api_key_123"
                                   :creator "regular@test.com"
                                   :group "admin"}]}})
              (is (thrown-with-msg?
                   clojure.lang.ExceptionInfo
                   #"User with email regular@test.com is not an admin"
                   (config.file/initialize!))))
            (finally
              (cleanup-config!))))

        (testing "should fail if creator doesn't exist"
          (try
            (write-config!
             {:version 1
              :config {:api-keys [{:name "Test API Key"
                                 :key "test_api_key_123"
                                 :creator "nonexistent@test.com"
                                 :group "admin"}]}})
            (is (thrown-with-msg?
                 clojure.lang.ExceptionInfo
                 #"User with email nonexistent@test.com not found"
                 (config.file/initialize!)))
            (finally
              (cleanup-config!))))

        (testing "should skip existing API keys"
          (try
            (write-config!
             {:version 1
              :config {:api-keys [{:name "Test API Key"
                                 :key "test_api_key_123"
                                 :creator "admin@test.com"
                                 :group "admin"}]}})
            (config.file/initialize!)
            (let [first-key (t2/select-one ApiKey :name "Test API Key")
                  _ (config.file/initialize!)
                  second-key (t2/select-one ApiKey :name "Test API Key")]
              (is (= (:id first-key) (:id second-key))))
            (finally
              (cleanup-config!))))

        (testing "should validate group values"
          (try
            (write-config!
             {:version 1
              :config {:api-keys [{:name "Test API Key"
                                 :key "test_api_key_123"
                                 :creator "admin@test.com"
                                 :group "invalid-group"}]}})
            (is (thrown? clojure.lang.ExceptionInfo
                        (config.file/initialize!)))
            (finally
              (cleanup-config!))))))))) 
              