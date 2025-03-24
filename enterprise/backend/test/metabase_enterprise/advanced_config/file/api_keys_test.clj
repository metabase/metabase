(ns metabase-enterprise.advanced-config.file.api-keys-test
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.advanced-config.file :as config.file]
   [metabase.test :as mt]
   [metabase.util :as u]
   [metabase.util.yaml :as yaml]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(use-fixtures :each (fn [thunk]
                      (binding [config.file/*supported-versions* {:min 1, :max 1}]
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
          (binding [config.file/*config* {:version 1
                                          :config {:api-keys [{:name "Test API Key"
                                                               :key "mb_testapikey123"
                                                               :creator "admin@test.com"
                                                               :group "admin"}
                                                              {:name "All Users API Key"
                                                               :key "mb_differentapikey456"
                                                               :creator "admin@test.com"
                                                               :group "all-users"}]}}]
            (is (= :ok (config.file/initialize!)))
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
          (binding [config.file/*config* {:version 1
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
                 (config.file/initialize!))))
          (finally
            (cleanup-config!))))

      (testing "should fail if creator is not an admin"
        (try
          (mt/with-temp [:model/User _ {:email "regular@test.com"
                                        :first_name "Regular"
                                        :is_superuser false}]
            (binding [config.file/*config* {:version 1
                                            :config {:api-keys [{:name "Test API Key"
                                                                 :key "mb_1testapikey123"
                                                                 :creator "regular@test.com"
                                                                 :group "admin"}]}}]
              (is (thrown-with-msg?
                   clojure.lang.ExceptionInfo
                   #"User with email regular@test.com is not an admin"
                   (config.file/initialize!)))))
          (finally
            (cleanup-config!))))

      (testing "should fail if creator doesn't exist"
        (try
          (binding [config.file/*config* {:version 1
                                          :config {:api-keys [{:name "Test API Key"
                                                               :key "mb_2testapikey123"
                                                               :creator "nonexistent@test.com"
                                                               :group "admin"}]}}]
            (is (thrown-with-msg?
                 clojure.lang.ExceptionInfo
                 #"User with email nonexistent@test.com not found"
                 (config.file/initialize!))))
          (finally
            (cleanup-config!))))

      (testing "should skip existing API keys"
        (try
          (binding [config.file/*config* {:version 1
                                          :config {:api-keys [{:name "Test API Key"
                                                               :key "mb_3testapikey123"
                                                               :creator "admin@test.com"
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
              (is (= (:id first-key) (:id second-key)))))
          (finally
            (cleanup-config!))))

      (testing "should validate group values"
        (try
          (binding [config.file/*config* {:version 1
                                          :config {:api-keys [{:name "Test API Key"
                                                               :key "mb_5testapikey123"
                                                               :creator "admin@test.com"
                                                               :group "invalid-group"}]}}]
            (is (thrown? clojure.lang.ExceptionInfo
                         (config.file/initialize!))))
          (finally
            (cleanup-config!)))))))
