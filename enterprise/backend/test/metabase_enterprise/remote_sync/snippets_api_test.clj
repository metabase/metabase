(ns metabase-enterprise.remote-sync.snippets-api-test
  "API tests for snippet operations under remote-sync read-only mode.
   Verifies that write operations are blocked when library is synced and mode is read-only."
  (:require
   [clojure.test :refer :all]
   [metabase.collections.test-utils :as collections.tu]
   [metabase.permissions.models.data-permissions :as data-perms]
   [metabase.permissions.models.permissions :as perms]
   [metabase.permissions.models.permissions-group :as perms-group]
   [metabase.test :as mt]
   [metabase.util :as u]
   [toucan2.core :as t2]))

;;; ------------------------------------------- Create Snippet API Tests -------------------------------------------

(deftest create-snippet-blocked-in-read-only-mode-test
  (testing "POST /api/native-query-snippet"
    (testing "Creating a snippet is blocked when library is synced and mode is read-only"
      (mt/with-premium-features #{:snippet-collections}
        (mt/with-non-admin-groups-no-root-collection-for-namespace-perms "snippets"
          (collections.tu/with-library-synced
            (mt/with-temporary-setting-values [remote-sync-type :read-only]
              (mt/with-temp [:model/Collection collection {:name "Test Collection", :namespace "snippets"}]
                (data-perms/set-database-permission! (perms-group/all-users) (mt/id) :perms/create-queries :query-builder-and-native)
                (perms/grant-collection-readwrite-permissions! (perms-group/all-users) collection)
                (let [snippet-name (mt/random-name)
                      response (mt/user-http-request :rasta :post 403 "native-query-snippet"
                                                     {:name          snippet-name
                                                      :content       "SELECT 1"
                                                      :collection_id (:id collection)})]
                  (is (= "You don't have permissions to do that." response)
                      "Should get 403 forbidden when trying to create snippet in read-only mode")
                  (is (not (t2/exists? :model/NativeQuerySnippet :name snippet-name))
                      "Snippet should not have been created"))))))))))

(deftest create-snippet-allowed-in-read-write-mode-test
  (testing "POST /api/native-query-snippet"
    (testing "Creating a snippet is allowed when mode is read-write even when library is synced"
      (mt/with-premium-features #{:snippet-collections}
        (mt/with-non-admin-groups-no-root-collection-for-namespace-perms "snippets"
          (collections.tu/with-library-synced
            (mt/with-temporary-setting-values [remote-sync-type :read-write]
              (mt/with-temp [:model/Collection collection {:name "Test Collection", :namespace "snippets"}]
                (data-perms/set-database-permission! (perms-group/all-users) (mt/id) :perms/create-queries :query-builder-and-native)
                (perms/grant-collection-readwrite-permissions! (perms-group/all-users) collection)
                (let [snippet-name (mt/random-name)]
                  (try
                    (let [response (mt/user-http-request :rasta :post 200 "native-query-snippet"
                                                         {:name          snippet-name
                                                          :content       "SELECT 1"
                                                          :collection_id (:id collection)})]
                      (is (map? response)
                          "Should successfully create snippet in read-write mode")
                      (is (= snippet-name (:name response))
                          "Response should contain the created snippet"))
                    (finally
                      (t2/delete! :model/NativeQuerySnippet :name snippet-name))))))))))))

(deftest create-snippet-allowed-when-library-not-synced-test
  (testing "POST /api/native-query-snippet"
    (testing "Creating a snippet is allowed when library is NOT synced even in read-only mode"
      (mt/with-premium-features #{:snippet-collections}
        (mt/with-non-admin-groups-no-root-collection-for-namespace-perms "snippets"
          (collections.tu/with-library-not-synced
            (mt/with-temporary-setting-values [remote-sync-type :read-only]
              (mt/with-temp [:model/Collection collection {:name "Test Collection", :namespace "snippets"}]
                (data-perms/set-database-permission! (perms-group/all-users) (mt/id) :perms/create-queries :query-builder-and-native)
                (perms/grant-collection-readwrite-permissions! (perms-group/all-users) collection)
                (let [snippet-name (mt/random-name)]
                  (try
                    (let [response (mt/user-http-request :rasta :post 200 "native-query-snippet"
                                                         {:name          snippet-name
                                                          :content       "SELECT 1"
                                                          :collection_id (:id collection)})]
                      (is (map? response)
                          "Should successfully create snippet when library is not synced")
                      (is (= snippet-name (:name response))
                          "Response should contain the created snippet"))
                    (finally
                      (t2/delete! :model/NativeQuerySnippet :name snippet-name))))))))))))

;;; ------------------------------------------- Update Snippet API Tests -------------------------------------------

(deftest update-snippet-blocked-in-read-only-mode-test
  (testing "PUT /api/native-query-snippet/:id"
    (testing "Updating a snippet is blocked when library is synced and mode is read-only"
      (mt/with-premium-features #{:snippet-collections}
        (mt/with-non-admin-groups-no-root-collection-for-namespace-perms "snippets"
          (collections.tu/with-library-synced
            (mt/with-temporary-setting-values [remote-sync-type :read-only]
              (mt/with-temp [:model/Collection collection {:name "Test Collection", :namespace "snippets"}
                             :model/NativeQuerySnippet snippet {:name "Original Name"
                                                                :content "SELECT 1"
                                                                :collection_id (:id collection)}]
                (data-perms/set-database-permission! (perms-group/all-users) (mt/id) :perms/create-queries :query-builder-and-native)
                (perms/grant-collection-readwrite-permissions! (perms-group/all-users) collection)
                (let [response (mt/user-http-request :rasta :put 403
                                                     (format "native-query-snippet/%d" (:id snippet))
                                                     {:name "Updated Name"})]
                  (is (= "You don't have permissions to do that." response)
                      "Should get 403 forbidden when trying to update snippet in read-only mode")
                  (is (= "Original Name" (:name (t2/select-one :model/NativeQuerySnippet :id (:id snippet))))
                      "Snippet name should not have been updated"))))))))))

(deftest update-snippet-allowed-in-read-write-mode-test
  (testing "PUT /api/native-query-snippet/:id"
    (testing "Updating a snippet is allowed when mode is read-write even when library is synced"
      (mt/with-premium-features #{:snippet-collections}
        (mt/with-non-admin-groups-no-root-collection-for-namespace-perms "snippets"
          (collections.tu/with-library-synced
            (mt/with-temporary-setting-values [remote-sync-type :read-write]
              (mt/with-temp [:model/Collection collection {:name "Test Collection", :namespace "snippets"}
                             :model/NativeQuerySnippet snippet {:name "Original Name"
                                                                :content "SELECT 1"
                                                                :collection_id (:id collection)}]
                (data-perms/set-database-permission! (perms-group/all-users) (mt/id) :perms/create-queries :query-builder-and-native)
                (perms/grant-collection-readwrite-permissions! (perms-group/all-users) collection)
                (let [response (mt/user-http-request :rasta :put 200
                                                     (format "native-query-snippet/%d" (:id snippet))
                                                     {:name "Updated Name"})]
                  (is (map? response)
                      "Should successfully update snippet in read-write mode")
                  (is (= "Updated Name" (:name response))
                      "Response should contain the updated name"))))))))))

(deftest update-snippet-allowed-when-library-not-synced-test
  (testing "PUT /api/native-query-snippet/:id"
    (testing "Updating a snippet is allowed when library is NOT synced even in read-only mode"
      (mt/with-premium-features #{:snippet-collections}
        (mt/with-non-admin-groups-no-root-collection-for-namespace-perms "snippets"
          (collections.tu/with-library-not-synced
            (mt/with-temporary-setting-values [remote-sync-type :read-only]
              (mt/with-temp [:model/Collection collection {:name "Test Collection", :namespace "snippets"}
                             :model/NativeQuerySnippet snippet {:name "Original Name"
                                                                :content "SELECT 1"
                                                                :collection_id (:id collection)}]
                (data-perms/set-database-permission! (perms-group/all-users) (mt/id) :perms/create-queries :query-builder-and-native)
                (perms/grant-collection-readwrite-permissions! (perms-group/all-users) collection)
                (let [response (mt/user-http-request :rasta :put 200
                                                     (format "native-query-snippet/%d" (:id snippet))
                                                     {:name "Updated Name"})]
                  (is (map? response)
                      "Should successfully update snippet when library is not synced")
                  (is (= "Updated Name" (:name response))
                      "Response should contain the updated name"))))))))))

;;; ------------------------------------------- Read Snippet API Tests -------------------------------------------

(deftest read-snippet-allowed-in-read-only-mode-test
  (testing "GET /api/native-query-snippet/:id"
    (testing "Reading a snippet is allowed even when library is synced and mode is read-only"
      (mt/with-premium-features #{:snippet-collections}
        (mt/with-non-admin-groups-no-root-collection-for-namespace-perms "snippets"
          (collections.tu/with-library-synced
            (mt/with-temporary-setting-values [remote-sync-type :read-only]
              (mt/with-temp [:model/Collection collection {:name "Test Collection", :namespace "snippets"}
                             :model/NativeQuerySnippet snippet {:name "Test Snippet"
                                                                :content "SELECT 1"
                                                                :collection_id (:id collection)}]
                (data-perms/set-database-permission! (perms-group/all-users) (mt/id) :perms/create-queries :query-builder-and-native)
                (perms/grant-collection-read-permissions! (perms-group/all-users) collection)
                (let [response (mt/user-http-request :rasta :get 200
                                                     (format "native-query-snippet/%d" (:id snippet)))]
                  (is (map? response)
                      "Should successfully read snippet in read-only mode")
                  (is (= "Test Snippet" (:name response))
                      "Response should contain the snippet name"))))))))))

(deftest list-snippets-allowed-in-read-only-mode-test
  (testing "GET /api/native-query-snippet"
    (testing "Listing snippets is allowed even when library is synced and mode is read-only"
      (mt/with-premium-features #{:snippet-collections}
        (mt/with-non-admin-groups-no-root-collection-for-namespace-perms "snippets"
          (collections.tu/with-library-synced
            (mt/with-temporary-setting-values [remote-sync-type :read-only]
              (mt/with-temp [:model/Collection collection {:name "Test Collection", :namespace "snippets"}
                             :model/NativeQuerySnippet snippet {:name "Test Snippet"
                                                                :content "SELECT 1"
                                                                :collection_id (:id collection)}]
                (data-perms/set-database-permission! (perms-group/all-users) (mt/id) :perms/create-queries :query-builder-and-native)
                (perms/grant-collection-read-permissions! (perms-group/all-users) collection)
                (let [response (mt/user-http-request :rasta :get 200 "native-query-snippet")]
                  (is (sequential? response)
                      "Should successfully list snippets in read-only mode")
                  (is (some #(= (u/the-id snippet) (:id %)) response)
                      "Response should include the test snippet"))))))))))

;;; ------------------------------------------- Archive Snippet API Tests -------------------------------------------

(deftest archive-snippet-blocked-in-read-only-mode-test
  (testing "PUT /api/native-query-snippet/:id"
    (testing "Archiving a snippet (setting archived=true) is blocked when library is synced and mode is read-only"
      (mt/with-premium-features #{:snippet-collections}
        (mt/with-non-admin-groups-no-root-collection-for-namespace-perms "snippets"
          (collections.tu/with-library-synced
            (mt/with-temporary-setting-values [remote-sync-type :read-only]
              (mt/with-temp [:model/Collection collection {:name "Test Collection", :namespace "snippets"}
                             :model/NativeQuerySnippet snippet {:name "Test Snippet"
                                                                :content "SELECT 1"
                                                                :collection_id (:id collection)
                                                                :archived false}]
                (data-perms/set-database-permission! (perms-group/all-users) (mt/id) :perms/create-queries :query-builder-and-native)
                (perms/grant-collection-readwrite-permissions! (perms-group/all-users) collection)
                (let [response (mt/user-http-request :rasta :put 403
                                                     (format "native-query-snippet/%d" (:id snippet))
                                                     {:archived true})]
                  (is (= "You don't have permissions to do that." response)
                      "Should get 403 forbidden when trying to archive snippet in read-only mode")
                  (is (false? (:archived (t2/select-one :model/NativeQuerySnippet :id (:id snippet))))
                      "Snippet should not have been archived"))))))))))
