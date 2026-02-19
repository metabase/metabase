(ns metabase-enterprise.snippet-collections.models.native-query-snippet.permissions-test
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.test :as met]
   [metabase.collections.models.collection :as collection]
   [metabase.collections.test-utils :as collections.tu]
   [metabase.models.interface :as mi]
   [metabase.native-query-snippets.models.native-query-snippet.permissions :as snippet.perms]
   [metabase.permissions.models.data-permissions :as data-perms]
   [metabase.permissions.models.permissions :as perms]
   [metabase.permissions.models.permissions-group :as perms-group]
   [metabase.test :as mt]
   [toucan2.core :as t2]))

(def ^:private root-collection (assoc collection/root-collection :name "Root Collection", :namespace "snippets"))

(defn- test-perms! [& {:keys [has-perms-for-obj? has-perms-for-id? grant-collection-perms! revoke-collection-perms!]}]
  (letfn [(test-perms* [expected]
            (mt/with-test-user :rasta
              (when has-perms-for-obj?
                (testing "has perms for object?"
                  (is (= expected
                         (has-perms-for-obj?)))))
              (when has-perms-for-id?
                (testing "has perms for model + ID?"
                  (is (= expected
                         (has-perms-for-id?)))))))]
    (testing "if EE perms aren't enabled: "
      (mt/with-premium-features #{}
        (testing "should NOT be allowed if you don't have native perms for at least one DB"
          (with-redefs [snippet.perms/has-any-native-permissions? (constantly false)]
            (test-perms* false)))
        (testing "should be allowed if you have native perms for at least one DB"
          (with-redefs [snippet.perms/has-any-native-permissions? (constantly true)]
            (test-perms* true)))))

    (testing "if EE perms are enabled: "
      (mt/with-premium-features #{:snippet-collections}
        (with-redefs [snippet.perms/has-any-native-permissions? (constantly true)]
          (testing "should be allowed if you have collection perms, native perms for at least one DB, and are not sandboxed"
            (grant-collection-perms!)
            (test-perms* true))
          (testing "should NOT be allowed if you do not have collection perms"
            (revoke-collection-perms!)
            (test-perms* false)
            (grant-collection-perms!))
          (testing "should NOT be allowed if you are sandboxed"
            (met/with-gtaps! {:gtaps {:venues {:query (mt/mbql-query venues)}}}
              (test-perms* false))))
        (with-redefs [snippet.perms/has-any-native-permissions? (constantly false)]
          (testing "should NOT be allowed if you do not have native query perms for at least one DB"
            (test-perms* false)))))))

(defn- test-with-root-collection-and-collection! [f]
  (mt/with-non-admin-groups-no-root-collection-for-namespace-perms "snippets"
    (mt/with-temp [:model/Collection collection {:name "Parent Collection", :namespace "snippets"}]
      (doseq [coll [root-collection collection]]
        (mt/with-temp [:model/NativeQuerySnippet snippet {:collection_id (:id coll)}]
          (testing (format "in %s\n" (:name coll))
            (f coll snippet)))))))

(deftest read-perms-test
  (testing "read a Snippet"
    (test-with-root-collection-and-collection!
     (fn [coll snippet]
       (test-perms!
        :has-perms-for-obj?       #(mi/can-read? snippet)
        :has-perms-for-id?        #(mi/can-read? :model/NativeQuerySnippet (:id snippet))
        :grant-collection-perms!  #(perms/grant-collection-read-permissions! (perms-group/all-users) coll)
        :revoke-collection-perms! #(perms/revoke-collection-permissions! (perms-group/all-users) coll))))))

(deftest create-perms-test
  (testing "create a Snippet"
    (test-with-root-collection-and-collection!
     (fn [coll snippet]
       (test-perms!
        :has-perms-for-obj?       #(mi/can-create? :model/NativeQuerySnippet (dissoc snippet :id))
        :grant-collection-perms!  #(perms/grant-collection-readwrite-permissions! (perms-group/all-users) coll)
        :revoke-collection-perms! #(perms/revoke-collection-permissions! (perms-group/all-users) coll))))))

(deftest update-perms-test
  (testing "update a Snippet"
    (test-with-root-collection-and-collection!
     (fn [coll snippet]
       (test-perms!
        :has-perms-for-obj?       #(mi/can-write? snippet)
        :has-perms-for-id?        #(mi/can-write? :model/NativeQuerySnippet (:id snippet))
        :grant-collection-perms!  #(perms/grant-collection-readwrite-permissions! (perms-group/all-users) coll)
        :revoke-collection-perms! #(perms/revoke-collection-permissions! (perms-group/all-users) coll))))))

;;; ------------------------------------------- Remote Sync Read-Only Mode Tests -------------------------------------------

(deftest remote-sync-read-only-write-perms-test
  (testing "Snippets are NOT writable when library is synced and mode is read-only"
    (mt/with-premium-features #{:snippet-collections}
      (collections.tu/with-library-synced
        (mt/with-temporary-setting-values [remote-sync-type :read-only]
          (mt/with-non-admin-groups-no-root-collection-for-namespace-perms "snippets"
            (mt/with-temp [:model/Collection collection {:name "Test Collection", :namespace "snippets"}
                           :model/NativeQuerySnippet snippet {:collection_id (:id collection)}]
              (data-perms/set-database-permission! (perms-group/all-users) (mt/id) :perms/create-queries :query-builder-and-native)
              (perms/grant-collection-readwrite-permissions! (perms-group/all-users) collection)
              (mt/with-test-user :rasta
                (is (false? (mi/can-write? snippet))
                    "Snippet should NOT be writable in read-only mode when library is synced")))))))))

(deftest remote-sync-read-only-create-perms-test
  (testing "Snippets cannot be created when library is synced and mode is read-only"
    (mt/with-premium-features #{:snippet-collections}
      (collections.tu/with-library-synced
        (mt/with-temporary-setting-values [remote-sync-type :read-only]
          (mt/with-non-admin-groups-no-root-collection-for-namespace-perms "snippets"
            (mt/with-temp [:model/Collection collection {:name "Test Collection", :namespace "snippets"}]
              (data-perms/set-database-permission! (perms-group/all-users) (mt/id) :perms/create-queries :query-builder-and-native)
              (perms/grant-collection-readwrite-permissions! (perms-group/all-users) collection)
              (mt/with-test-user :rasta
                (is (false? (mi/can-create? :model/NativeQuerySnippet {:collection_id (:id collection)}))
                    "Snippet should NOT be creatable in read-only mode when library is synced")))))))))

(deftest remote-sync-read-only-update-perms-test
  (testing "Snippets cannot be updated when library is synced and mode is read-only"
    (mt/with-premium-features #{:snippet-collections}
      (collections.tu/with-library-synced
        (mt/with-temporary-setting-values [remote-sync-type :read-only]
          (mt/with-non-admin-groups-no-root-collection-for-namespace-perms "snippets"
            (mt/with-temp [:model/Collection collection {:name "Test Collection", :namespace "snippets"}
                           :model/NativeQuerySnippet snippet {:collection_id (:id collection)}]
              (data-perms/set-database-permission! (perms-group/all-users) (mt/id) :perms/create-queries :query-builder-and-native)
              (perms/grant-collection-readwrite-permissions! (perms-group/all-users) collection)
              (mt/with-test-user :rasta
                (is (false? (mi/can-update? snippet {:name "New Name"}))
                    "Snippet should NOT be updatable in read-only mode when library is synced")))))))))

(deftest remote-sync-read-only-read-perms-still-allowed-test
  (testing "Snippets are still readable when library is synced and mode is read-only"
    (mt/with-premium-features #{:snippet-collections}
      (collections.tu/with-library-synced
        (mt/with-temporary-setting-values [remote-sync-type :read-only]
          (mt/with-non-admin-groups-no-root-collection-for-namespace-perms "snippets"
            (mt/with-temp [:model/Collection collection {:name "Test Collection", :namespace "snippets"}
                           :model/NativeQuerySnippet snippet {:collection_id (:id collection)}]
              (data-perms/set-database-permission! (perms-group/all-users) (mt/id) :perms/create-queries :query-builder-and-native)
              (perms/grant-collection-read-permissions! (perms-group/all-users) collection)
              (mt/with-test-user :rasta
                (is (true? (mi/can-read? snippet))
                    "Snippet should still be readable in read-only mode")))))))))

(deftest remote-sync-read-write-mode-allows-edits-test
  (testing "Snippets ARE writable when mode is read-write even when library is synced"
    (mt/with-premium-features #{:snippet-collections}
      (collections.tu/with-library-synced
        (mt/with-temporary-setting-values [remote-sync-type :read-write]
          (mt/with-non-admin-groups-no-root-collection-for-namespace-perms "snippets"
            (mt/with-temp [:model/Collection collection {:name "Test Collection", :namespace "snippets"}
                           :model/NativeQuerySnippet snippet {:collection_id (:id collection)}]
              (data-perms/set-database-permission! (perms-group/all-users) (mt/id) :perms/create-queries :query-builder-and-native)
              (perms/grant-collection-readwrite-permissions! (perms-group/all-users) collection)
              (mt/with-test-user :rasta
                (is (true? (mi/can-write? snippet))
                    "Snippet should be writable in read-write mode")))))))))

(deftest remote-sync-library-not-synced-allows-edits-test
  (testing "Snippets ARE writable in read-only mode when library is NOT synced"
    (mt/with-premium-features #{:snippet-collections}
      (collections.tu/with-library-not-synced
        (mt/with-temporary-setting-values [remote-sync-type :read-only]
          (mt/with-non-admin-groups-no-root-collection-for-namespace-perms "snippets"
            (mt/with-temp [:model/Collection collection {:name "Test Collection", :namespace "snippets"}
                           :model/NativeQuerySnippet snippet {:collection_id (:id collection)}]
              (data-perms/set-database-permission! (perms-group/all-users) (mt/id) :perms/create-queries :query-builder-and-native)
              (perms/grant-collection-readwrite-permissions! (perms-group/all-users) collection)
              (mt/with-test-user :rasta
                (is (true? (mi/can-write? snippet))
                    "Snippet should be writable when library is NOT synced")))))))))

;;; ------------------------------------------ Batched Hydration Tests ------------------------------------------

(deftest batched-hydrate-can-write-remote-sync-test
  (testing "batched-hydrate :can_write respects remote-sync read-only mode"
    (mt/with-premium-features #{:snippet-collections}
      (collections.tu/with-library-synced
        (mt/with-temporary-setting-values [remote-sync-type :read-only]
          (mt/with-non-admin-groups-no-root-collection-for-namespace-perms "snippets"
            (mt/with-temp [:model/Collection collection {:name "Test Collection", :namespace "snippets"}
                           :model/NativeQuerySnippet snippet1 {:name "snippet1" :content "SELECT 1" :collection_id (:id collection)}
                           :model/NativeQuerySnippet snippet2 {:name "snippet2" :content "SELECT 2" :collection_id (:id collection)}
                           :model/NativeQuerySnippet snippet3 {:name "snippet3" :content "SELECT 3" :collection_id (:id collection)}]
              (data-perms/set-database-permission! (perms-group/all-users) (mt/id) :perms/create-queries :query-builder-and-native)
              (perms/grant-collection-readwrite-permissions! (perms-group/all-users) collection)
              (mt/with-test-user :rasta
                (let [snippets (mt/with-current-user nil
                                 (t2/select :model/NativeQuerySnippet :id [:in [(:id snippet1) (:id snippet2) (:id snippet3)]]))
                      hydrated (t2/hydrate snippets :can_write)]
                  (testing "all snippets should have :can_write = false in read-only mode"
                    (is (every? #(false? (:can_write %)) hydrated)
                        "Snippets should NOT be writable in read-only mode when library is synced")))))))))))

(deftest batched-hydrate-can-write-read-write-mode-test
  (testing "batched-hydrate :can_write allows writes in read-write mode"
    (mt/with-premium-features #{:snippet-collections}
      (collections.tu/with-library-synced
        (mt/with-temporary-setting-values [remote-sync-type :read-write]
          (mt/with-non-admin-groups-no-root-collection-for-namespace-perms "snippets"
            (mt/with-temp [:model/Collection collection {:name "Test Collection", :namespace "snippets"}
                           :model/NativeQuerySnippet snippet1 {:name "snippet1" :content "SELECT 1" :collection_id (:id collection)}
                           :model/NativeQuerySnippet snippet2 {:name "snippet2" :content "SELECT 2" :collection_id (:id collection)}]
              (data-perms/set-database-permission! (perms-group/all-users) (mt/id) :perms/create-queries :query-builder-and-native)
              (perms/grant-collection-readwrite-permissions! (perms-group/all-users) collection)
              (mt/with-test-user :rasta
                (let [snippets (mt/with-current-user nil
                                 (t2/select :model/NativeQuerySnippet :id [:in [(:id snippet1) (:id snippet2)]]))
                      hydrated (t2/hydrate snippets :can_write)]
                  (testing "all snippets should have :can_write = true in read-write mode"
                    (is (every? :can_write hydrated)
                        "Snippets should be writable in read-write mode")))))))))))

(deftest batched-hydrate-can-write-library-not-synced-test
  (testing "batched-hydrate :can_write allows writes when library is not synced"
    (mt/with-premium-features #{:snippet-collections}
      (collections.tu/with-library-not-synced
        (mt/with-temporary-setting-values [remote-sync-type :read-only]
          (mt/with-non-admin-groups-no-root-collection-for-namespace-perms "snippets"
            (mt/with-temp [:model/Collection collection {:name "Test Collection", :namespace "snippets"}
                           :model/NativeQuerySnippet snippet1 {:name "snippet1" :content "SELECT 1" :collection_id (:id collection)}
                           :model/NativeQuerySnippet snippet2 {:name "snippet2" :content "SELECT 2" :collection_id (:id collection)}]
              (data-perms/set-database-permission! (perms-group/all-users) (mt/id) :perms/create-queries :query-builder-and-native)
              (perms/grant-collection-readwrite-permissions! (perms-group/all-users) collection)
              (mt/with-test-user :rasta
                (let [snippets (mt/with-current-user nil
                                 (t2/select :model/NativeQuerySnippet :id [:in [(:id snippet1) (:id snippet2)]]))
                      hydrated (t2/hydrate snippets :can_write)]
                  (testing "all snippets should have :can_write = true when library is not synced"
                    (is (every? :can_write hydrated)
                        "Snippets should be writable when library is NOT synced")))))))))))
