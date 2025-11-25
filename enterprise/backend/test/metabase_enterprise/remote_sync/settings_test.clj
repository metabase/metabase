(ns metabase-enterprise.remote-sync.settings-test
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.remote-sync.settings :as settings]
   [metabase.collections.models.collection :as collections]
   [metabase.collections.models.collection.root :as collection.root]
   [metabase.remote-sync.core :as remote-sync]
   [metabase.settings.core :as setting]
   [metabase.test :as mt]
   [toucan2.core :as t2]))

(deftest check-and-update-remote-settings
  (let [full-token "full_token_value"
        other-token "other_token_value"
        obfuscated-token (setting/obfuscate-value full-token)
        default-settings
        {:remote-sync-url "file://my/url.git"
         :remote-sync-type :read-only
         :remote-sync-branch "test-branch"
         :remote-sync-token nil}]
    (with-redefs [settings/check-git-settings! (fn [{:keys [remote-sync-token]}]
                                                 ;; git should always be checked with a nil or full token
                                                 (is (or (nil? remote-sync-token) (#{full-token other-token} remote-sync-token)))
                                                 true)]
      (mt/with-temporary-setting-values [:remote-sync-token nil
                                         :remote-sync-url nil
                                         :remote-sync-type nil
                                         :remote-sync-branch nil]
        (testing "Allows setting with no token"
          (settings/check-and-update-remote-settings! (assoc default-settings :remote-sync-token nil))
          (is (= "file://my/url.git" (settings/remote-sync-url)))
          (is (= :read-only (settings/remote-sync-type)))
          (is (= "test-branch" (settings/remote-sync-branch)))
          (is (true? (settings/remote-sync-enabled)))
          (is (= nil (settings/remote-sync-token))))
        (testing "Updating with a full token saves it"
          (settings/check-and-update-remote-settings! (assoc default-settings :remote-sync-token full-token))
          (is (= full-token (settings/remote-sync-token))))
        (testing "Updating with an obfuscated token does not update it"
          (settings/check-and-update-remote-settings! (assoc default-settings :remote-sync-token obfuscated-token))
          (is (= full-token (settings/remote-sync-token))))
        (testing "Updating with a different full token saves it"
          (settings/check-and-update-remote-settings! (assoc default-settings :remote-sync-token other-token))
          (is (= other-token (settings/remote-sync-token))))
        (testing "Updating with nil token clears it out"
          (settings/check-and-update-remote-settings! (assoc default-settings :remote-sync-token nil))
          (is (= nil (settings/remote-sync-token))))))))

(deftest cannot-set-remote-sync-type-to-invalid-value
  (is (thrown-with-msg? clojure.lang.ExceptionInfo
                        #"Remote-sync-type set to an unsupported value"
                        (settings/remote-sync-type! :invalid-type))))

(deftest remote-sync-enabled-test
  (mt/with-temporary-setting-values [:remote-sync-url nil]
    (is (false? (settings/remote-sync-enabled))))
  (mt/with-temporary-setting-values [:remote-sync-url "file://my/repo.git"]
    (is (true? (settings/remote-sync-enabled)))))

;;; ------------------------------------------------- Tenant Collections Remote Sync Setting -------------------------------------------------

(deftest tenant-collections-remote-sync-enabled-default-test
  (testing "tenant-collections-remote-sync-enabled defaults to false"
    (mt/with-temporary-setting-values [settings/tenant-collections-remote-sync-enabled nil]
      (is (false? (settings/tenant-collections-remote-sync-enabled))))))

(deftest tenant-collections-remote-sync-enabled-can-be-toggled-test
  (testing "tenant-collections-remote-sync-enabled can be set to true and false"
    (mt/with-temporary-setting-values [settings/tenant-collections-remote-sync-enabled false]
      (is (false? (settings/tenant-collections-remote-sync-enabled)))
      (settings/tenant-collections-remote-sync-enabled! true)
      (is (true? (settings/tenant-collections-remote-sync-enabled)))
      (settings/tenant-collections-remote-sync-enabled! false)
      (is (false? (settings/tenant-collections-remote-sync-enabled))))))

(deftest tenant-collections-remote-sync-enabled-affects-remote-synced-collection-test
  (testing "When tenant-collections-remote-sync-enabled is ON, tenant collections are treated as remote-synced"
    (mt/with-premium-features #{:tenants}
      (mt/with-temporary-setting-values [use-tenants true
                                         settings/tenant-collections-remote-sync-enabled false]
        (mt/with-temp [:model/Collection {tenant-coll-id :id} {:name "Tenant Collection"
                                                               :namespace collections/shared-tenant-ns}]
          (let [tenant-coll (t2/select-one :model/Collection :id tenant-coll-id)]
            (testing "With setting OFF, tenant collection is NOT remote-synced"
              (is (false? (collections/remote-synced-collection? tenant-coll))))
            (testing "With setting ON, tenant collection IS remote-synced"
              (mt/with-temporary-setting-values [settings/tenant-collections-remote-sync-enabled true]
                (is (true? (collections/remote-synced-collection? tenant-coll)))))))))))

(deftest tenant-collections-remote-sync-enabled-does-not-affect-regular-collections-test
  (testing "tenant-collections-remote-sync-enabled does not affect regular collections"
    (mt/with-premium-features #{:tenants}
      (mt/with-temporary-setting-values [use-tenants true
                                         settings/tenant-collections-remote-sync-enabled true]
        (mt/with-temp [:model/Collection {regular-coll-id :id} {:name "Regular Collection"
                                                                :namespace nil}]
          (let [regular-coll (t2/select-one :model/Collection :id regular-coll-id)]
            (is (false? (collections/remote-synced-collection? regular-coll)))))))))

(deftest tenant-collections-remote-sync-enabled-defenterprise-getter-test
  (testing "tenant-collections-remote-sync-enabled? defenterprise function returns setting value"
    (mt/with-premium-features #{:tenants}
      (mt/with-temporary-setting-values [use-tenants true
                                         settings/tenant-collections-remote-sync-enabled false]
        (is (false? (remote-sync/tenant-collections-remote-sync-enabled?))))
      (mt/with-temporary-setting-values [use-tenants true
                                         settings/tenant-collections-remote-sync-enabled true]
        (is (true? (remote-sync/tenant-collections-remote-sync-enabled?)))))))

(deftest tenant-collections-root-collection-is-remote-synced-test
  (testing "Root collection for shared-tenant-collection namespace reflects is_remote_synced based on setting"
    (mt/with-premium-features #{:tenants}
      (mt/with-temporary-setting-values [use-tenants true
                                         settings/tenant-collections-remote-sync-enabled false]
        (let [root-coll (collection.root/root-collection-with-ui-details :shared-tenant-collection)]
          (testing "With setting OFF, root collection is_remote_synced is false"
            (is (false? (:is_remote_synced root-coll))))))
      (mt/with-temporary-setting-values [use-tenants true
                                         settings/tenant-collections-remote-sync-enabled true]
        (let [root-coll (collection.root/root-collection-with-ui-details :shared-tenant-collection)]
          (testing "With setting ON, root collection is_remote_synced is true"
            (is (true? (:is_remote_synced root-coll)))))))))

(deftest other-namespace-root-collections-not-affected-test
  (testing "Root collections for other namespaces are not affected by tenant-collections-remote-sync-enabled"
    (mt/with-premium-features #{:tenants}
      (mt/with-temporary-setting-values [use-tenants true
                                         settings/tenant-collections-remote-sync-enabled true]
        (testing "Default namespace root collection does not have is_remote_synced"
          (let [root-coll (collection.root/root-collection-with-ui-details nil)]
            (is (nil? (:is_remote_synced root-coll)))))
        (testing "Snippets namespace root collection does not have is_remote_synced"
          (let [root-coll (collection.root/root-collection-with-ui-details :snippets)]
            (is (nil? (:is_remote_synced root-coll)))))))))
