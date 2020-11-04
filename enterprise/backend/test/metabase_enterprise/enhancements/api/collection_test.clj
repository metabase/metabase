(ns metabase-enterprise.enhancements.api.collection-test
  (:require [clojure.test :refer :all]
            [metabase
             [models :refer [NativeQuerySnippet]]
             [test :as mt]]
            [metabase.models
             [collection :as collection]
             [permissions :as perms]
             [permissions-group :as group]]
            [metabase.public-settings.metastore-test :as metastore-test]))

(deftest ee-disabled-snippets-graph-test
  (testing "GET /api/collection/root/items?namespace=snippets"
    (mt/with-non-admin-groups-no-root-collection-for-namespace-perms "snippets"
      (mt/with-temp NativeQuerySnippet [snippet]
        (letfn [(can-see-snippet? []
                  (let [response ((mt/user->client :rasta) :get "collection/root/items?namespace=snippets")]
                    (boolean (some (fn [a-snippet]
                                     (= (:id snippet) (:id a-snippet)))
                                   response))))]
          (testing "\nIf we have a valid EE token, we should only see Snippets in the Root Collection with valid perms"
            (metastore-test/with-metastore-token-features #{:enhancements}
              (is (= false
                     (can-see-snippet?)))
              (perms/grant-collection-read-permissions! (group/all-users) (assoc collection/root-collection :namespace "snippets"))
              (is (= true
                     (can-see-snippet?)))))
          (testing "\nIf we do not have a valid EE token, all Snippets should come back from the graph regardless of our perms"
            (metastore-test/with-metastore-token-features #{}
              (is (= true
                     (can-see-snippet?)))
              (perms/revoke-collection-permissions! (group/all-users) (assoc collection/root-collection :namespace "snippets"))
              (is (= true
                     (can-see-snippet?))))))))))
