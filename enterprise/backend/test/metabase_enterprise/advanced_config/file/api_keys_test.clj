(ns metabase-enterprise.advanced-config.file.api-keys-test
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.advanced-config.file :as config.file]
   [metabase.test :as mt]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(use-fixtures :each (fn [thunk]
                      (binding [config.file/*supported-versions* {:min 1, :max 1}]
                        (mt/with-premium-features #{:config-text-file}
                          (mt/with-model-cleanup [:model/User]
                            (mt/with-model-cleanup [:model/ApiKey]
                              (thunk)))))))

(defn- api-key-exists? [name]
  (t2/exists? :model/ApiKey :name name))

(defn- api-key-user-exists? [name]
  (t2/exists? :model/User :first_name name :type :api-key))

(deftest create-api-keys-test
  (binding [config.file/*config* {:version 1
                                  :config {:api-keys [{:name "Test API Key"
                                                       :key "mb_testapikey123"
                                                       :creator (:email (mt/fetch-user :crowberto))
                                                       :group "admin"}
                                                      {:name "All Users API Key"
                                                       :key "mb_differentapikey456"
                                                       :creator (:email (mt/fetch-user :crowberto))
                                                       :group "all-users"}]}}]
    (is (= :ok (config.file/initialize!)))
    (testing "API keys should be created"
      (is (api-key-exists? "Test API Key"))
      (is (api-key-exists? "All Users API Key")))
    (testing "API key users should be created"
      (is (api-key-user-exists? "Test API Key"))
      (is (api-key-user-exists? "All Users API Key")))))

(deftest duplicate-api-key-prefix-test
  (binding [config.file/*config* {:version 1
                                  :config {:api-keys [{:name "First API Key"
                                                       :key "mb_sameprefix123"
                                                       :creator (:email (mt/fetch-user :crowberto))
                                                       :group "admin"}
                                                      {:name "Second API Key"
                                                       :key "mb_sameprefix456"
                                                       :creator (:email (mt/fetch-user :crowberto))
                                                       :group "admin"}]}}]
    (is (thrown-with-msg?
         clojure.lang.ExceptionInfo
         #"API key with prefix 'mb_same' already exists\. Keys must have unique prefixes\."
         (config.file/initialize!)))))

(deftest non-admin-creator-test
  (binding [config.file/*config* {:version 1
                                  :config {:api-keys [{:name "Test API Key"
                                                       :key "mb_1testapikey123"
                                                       :creator (:email (mt/fetch-user :rasta))
                                                       :group "admin"}]}}]
    (is (thrown-with-msg?
         clojure.lang.ExceptionInfo
         #"User with email rasta@metabase.com is not an admin"
         (config.file/initialize!)))))

(deftest nonexistent-creator-test
  (binding [config.file/*config* {:version 1
                                  :config {:api-keys [{:name "Test API Key"
                                                       :key "mb_2testapikey123"
                                                       :creator "nonexistent@test.com"
                                                       :group "admin"}]}}]
    (is (thrown-with-msg?
         clojure.lang.ExceptionInfo
         #"User with email nonexistent@test.com not found"
         (config.file/initialize!)))))

(deftest skip-existing-api-keys-test
  (binding [config.file/*config* {:version 1
                                  :config {:api-keys [{:name "Test API Key"
                                                       :key "mb_3testapikey123"
                                                       :creator (:email (mt/fetch-user :crowberto))
                                                       :group "admin"}]}}]
    (config.file/initialize!)
    (let [first-key (t2/select-one :model/ApiKey :name "Test API Key")
          _ (binding [config.file/*config* {:version 1
                                            :config {:api-keys [{:name "Test API Key"
                                                                 :key "mb_4testapikey123"
                                                                 :creator "admin@test.com"
                                                                 :group "admin"}]}}]
              (config.file/initialize!))
          second-key (t2/select-one :model/ApiKey :name "Test API Key")]
      (is (= (:id first-key) (:id second-key))))))

(deftest validate-group-values-test
  (mt/with-temp [:model/User _ {:email "admin@test.com"
                                :first_name "Admin"
                                :is_superuser true}]
    (binding [config.file/*config* {:version 1
                                    :config {:api-keys [{:name "Test API Key"
                                                         :key "mb_5testapikey123"
                                                         :creator "admin@test.com"
                                                         :group "invalid-group"}]}}]
      (is (thrown? clojure.lang.ExceptionInfo
                   (config.file/initialize!))))))

(deftest env-var-api-key-test
  (mt/with-temp-env-var-value! ["MB_API_KEY_FROM_ENV" "mb_envvariablekey123"]
    (binding [config.file/*config* {:version 1
                                    :config {:api-keys [{:name "ENV API Key"
                                                         :key "{{env API_KEY_FROM_ENV}}"
                                                         :creator (:email (mt/fetch-user :crowberto))
                                                         :group "admin"}]}}
              config.file/*env*    (assoc @#'config.file/*env* :api-key-from-env "mb_envvariablekey123")]
      (is (= :ok (config.file/initialize!)))
      (testing "API key should be created from env var"
        (is (api-key-exists? "ENV API Key"))))))

(deftest validate-env-var-api-key-format-test
  (binding [config.file/*config* {:version 1
                                  :config {:api-keys [{:name "Invalid ENV API Key"
                                                       :key "{{env INVALID_API_KEY}}"
                                                       :creator (:email (mt/fetch-user :crowberto))
                                                       :group "admin"}]}}
            config.file/*env*    (assoc @#'config.file/*env* :invalid-api-key "invalid_key_format")]
    (is (thrown-with-msg?
         clojure.lang.ExceptionInfo
         #"Invalid API key format"
         (config.file/initialize!)))))

(deftest skip-existing-api-keys-with-same-prefix-test
  ;; First, create an API key with a specific name
  (binding [config.file/*config* {:version 1
                                  :config {:api-keys [{:name "Duplicate Name Key"
                                                       :key "mb_original123"
                                                       :creator (:email (mt/fetch-user :crowberto))
                                                       :group "admin"}]}}]
    (config.file/initialize!)
    (testing "Original API key is created"
      (is (api-key-exists? "Duplicate Name Key"))
      (let [original-key (t2/select-one :model/ApiKey :name "Duplicate Name Key")
            original-key-prefix (:key_prefix original-key)]

        ;; Now attempt to create another key with the same name but different prefix
        (binding [config.file/*config* {:version 1
                                        :config {:api-keys [{:name "Duplicate Name Key"
                                                             :key "mb_different456" ;; different key with different prefix
                                                             :creator "admin@test.com"
                                                             :group "admin"}]}}]
          (config.file/initialize!)
          (testing "Second key with same name is skipped (no error about duplicate prefix)"
            (let [key-after-attempt (t2/select-one :model/ApiKey :name "Duplicate Name Key")]
              (is (= (:id original-key) (:id key-after-attempt)))
              (is (= original-key-prefix (:key_prefix key-after-attempt))))))))))
