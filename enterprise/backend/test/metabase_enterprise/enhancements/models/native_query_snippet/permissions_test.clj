(ns metabase-enterprise.enhancements.models.native-query-snippet.permissions-test
  (:require [clojure.test :refer :all]
            [metabase.models :refer [Collection NativeQuerySnippet]]
            [metabase.models.collection :as collection]
            [metabase.models.interface :as mi]
            [metabase.models.permissions :as perms]
            [metabase.models.permissions-group :as perms-group]
            [metabase.public-settings.premium-features-test :as premium-features-test]
            [metabase.test :as mt]))

(def ^:private root-collection (assoc collection/root-collection :name "Root Collection", :namespace "snippets"))

(defn- test-perms [& {:keys [has-perms-for-obj? has-perms-for-id? grant-collection-perms!]}]
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
    (testing "should be allowed if EE perms aren't enabled"
      (premium-features-test/with-premium-features #{}
        (test-perms* true)))
    (premium-features-test/with-premium-features #{:enhancements}
      (testing "should NOT be allowed if EE perms are enabled and you do not have perms"
        (test-perms* false))
      (testing "should be allowed if you have perms"
        (grant-collection-perms!)
        (test-perms* true)))))

(defn- test-with-root-collection-and-collection [f]
  (mt/with-non-admin-groups-no-root-collection-for-namespace-perms "snippets"
    (mt/with-temp Collection [collection {:name "Parent Collection", :namespace "snippets"}]
      (doseq [coll [root-collection collection]]
        (mt/with-temp NativeQuerySnippet [snippet {:collection_id (:id coll)}]
          (testing (format "in %s\n" (:name coll))
            (f coll snippet)))))))

(deftest read-perms-test
  (testing "read a Snippet"
    (test-with-root-collection-and-collection
     (fn [coll snippet]
       (test-perms
        :has-perms-for-obj?      #(mi/can-read? snippet)
        :has-perms-for-id?       #(mi/can-read? NativeQuerySnippet (:id snippet))
        :grant-collection-perms! #(perms/grant-collection-read-permissions! (perms-group/all-users) coll))))))

(deftest create-perms-test
  (testing "create a Snippet"
    (test-with-root-collection-and-collection
     (fn [coll snippet]
       (test-perms
        :has-perms-for-object?   #(mi/can-create? NativeQuerySnippet (dissoc snippet :id))
        :grant-collection-perms! #(perms/grant-collection-readwrite-permissions! (perms-group/all-users) coll))))))

(deftest update-perms-test
  (testing "update a Snippet"
    (test-with-root-collection-and-collection
     (fn [coll snippet]
       (test-perms
        :has-perms-for-obj?      #(mi/can-write? snippet)
        :has-perms-for-id?       #(mi/can-write? NativeQuerySnippet (:id snippet))
        :grant-collection-perms! #(perms/grant-collection-readwrite-permissions! (perms-group/all-users) coll))))))
