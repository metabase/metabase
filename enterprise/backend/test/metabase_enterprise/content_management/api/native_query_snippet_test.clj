(ns backend.test.metabase-enterprise.content-management.api.native-query-snippet-test
  (:require
   [clojure.test :refer :all]
   [metabase.models :refer [Collection NativeQuerySnippet]]
   [metabase.models.collection :as collection]
   [metabase.public-settings.premium-features-test
    :as premium-features-test]
   [metabase.test :as mt]))

(deftest snippet-collection-items-test
  (testing "GET /api/collection/:id/items"
    (testing "Snippet collections should be returned on EE with the content-management feature flag, rather than
             returning all nested snippets as a flat list"
      (premium-features-test/with-premium-features #{:content-management}
        (mt/with-temp* [Collection         [collection {:namespace "snippets", :name "My Snippet Collection"}]
                        Collection         [sub-collection {:namespace "snippets"
                                                            :name      "Nested Snippet Collection"
                                                            :location  (collection/location-path collection)}]
                        NativeQuerySnippet [snippet {:collection_id (:id collection), :name "My Snippet"}]
                        NativeQuerySnippet [_ {:collection_id (:id sub-collection)
                                               :name          "Nested Snippet"}]]
          (is (partial=
               [{:id (:id snippet), :name "My Snippet"}
                {:id (:id sub-collection), :name "Nested Snippet Collection"}]
               (:data (mt/user-http-request :rasta :get 200 (format "collection/%d/items" (:id collection)))))))))))
