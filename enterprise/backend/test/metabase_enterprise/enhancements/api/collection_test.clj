(ns metabase-enterprise.enhancements.api.collection-test
  (:require
   [clojure.test :refer :all]
   [metabase.models :refer [NativeQuerySnippet]]
   [metabase.models.collection :as collection]
   [metabase.models.permissions :as perms]
   [metabase.models.permissions-group :as perms-group]
   [metabase.test :as mt]
   [toucan2.tools.with-temp :as t2.with-temp]))

(deftest ee-disabled-snippets-graph-test
  (testing "GET /api/collection/root/items?namespace=snippets"
    (mt/with-non-admin-groups-no-root-collection-for-namespace-perms "snippets"
      (t2.with-temp/with-temp [NativeQuerySnippet snippet]
        (letfn [(can-see-snippet? []
                  (let [response (:data (mt/user-http-request :rasta :get "collection/root/items?namespace=snippets"))]
                    (boolean (some (fn [a-snippet]
                                     (= (:id snippet) (:id a-snippet)))
                                   response))))]
          (testing "\nIf we have a valid EE token, we should only see Snippets in the Root Collection with valid perms"
            (mt/with-premium-features #{:enhancements}
              (is (false? (can-see-snippet?)))
              (perms/grant-collection-read-permissions! (perms-group/all-users) (assoc collection/root-collection :namespace "snippets"))
              (is (true? (can-see-snippet?)))))
          (testing "\nIf we do not have a valid EE token, all Snippets should come back from the graph regardless of our perms"
            (mt/with-premium-features #{}
              (is (true? (can-see-snippet?)))
              (perms/revoke-collection-permissions! (perms-group/all-users) (assoc collection/root-collection :namespace "snippets"))
              (is (true? (can-see-snippet?))))))))))
