(ns metabase-enterprise.snippet-collections.models.native-query-snippet.permissions-test
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.test :as met]
   [metabase.models :refer [Collection NativeQuerySnippet]]
   [metabase.models.collection :as collection]
   [metabase.models.interface :as mi]
   [metabase.models.native-query-snippet.permissions :as snippet.perms]
   [metabase.models.permissions :as perms]
   [metabase.models.permissions-group :as perms-group]
   [metabase.test :as mt]
   [toucan2.tools.with-temp :as t2.with-temp]))

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

(defn- test-with-root-collection-and-collection [f]
  (mt/with-non-admin-groups-no-root-collection-for-namespace-perms "snippets"
    (t2.with-temp/with-temp [Collection collection {:name "Parent Collection", :namespace "snippets"}]
      (doseq [coll [root-collection collection]]
        (t2.with-temp/with-temp [NativeQuerySnippet snippet {:collection_id (:id coll)}]
          (testing (format "in %s\n" (:name coll))
            (f coll snippet)))))))

(deftest read-perms-test
  (testing "read a Snippet"
    (test-with-root-collection-and-collection
     (fn [coll snippet]
       (test-perms!
        :has-perms-for-obj?       #(mi/can-read? snippet)
        :has-perms-for-id?        #(mi/can-read? NativeQuerySnippet (:id snippet))
        :grant-collection-perms!  #(perms/grant-collection-read-permissions! (perms-group/all-users) coll)
        :revoke-collection-perms! #(perms/revoke-collection-permissions! (perms-group/all-users) coll))))))

(deftest create-perms-test
  (testing "create a Snippet"
    (test-with-root-collection-and-collection
     (fn [coll snippet]
       (test-perms!
        :has-perms-for-obj?       #(mi/can-create? NativeQuerySnippet (dissoc snippet :id))
        :grant-collection-perms!  #(perms/grant-collection-readwrite-permissions! (perms-group/all-users) coll)
        :revoke-collection-perms! #(perms/revoke-collection-permissions! (perms-group/all-users) coll))))))

(deftest update-perms-test
  (testing "update a Snippet"
    (test-with-root-collection-and-collection
     (fn [coll snippet]
       (test-perms!
        :has-perms-for-obj?       #(mi/can-write? snippet)
        :has-perms-for-id?        #(mi/can-write? NativeQuerySnippet (:id snippet))
        :grant-collection-perms!  #(perms/grant-collection-readwrite-permissions! (perms-group/all-users) coll)
        :revoke-collection-perms! #(perms/revoke-collection-permissions! (perms-group/all-users) coll))))))
