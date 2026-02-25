(ns ^:mb/driver-tests metabase.transforms-inspector.query-analysis-test
  (:require
   [clojure.test :refer :all]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.test :as mt]
   [metabase.transforms-inspector.query-analysis :as query-analysis]))

(set! *warn-on-reflection* true)

(deftest analyze-mbql-query-multi-stage-returns-nil-test
  (testing "analyze-mbql-query returns nil for multi-stage queries"
    (let [mp    (mt/metadata-provider)
          query (-> (lib/query mp (lib.metadata/table mp (mt/id :orders)))
                    lib/append-stage)
          transform {:source {:type :query :query query}
                     :name   "multi-stage-test"}]
      (is (nil? (query-analysis/analyze-mbql-query transform))))))

(deftest analyze-mbql-query-single-stage-returns-result-test
  (mt/test-drivers (mt/normal-drivers-with-feature :left-join)
    (testing "analyze-mbql-query returns result for single-stage queries"
      (let [mp    (mt/metadata-provider)
            query (-> (lib/query mp (lib.metadata/table mp (mt/id :orders)))
                      (lib/join (-> (lib/join-clause
                                     (lib.metadata/table mp (mt/id :products))
                                     [(lib/= (lib.metadata/field mp (mt/id :orders :product_id))
                                             (-> (lib.metadata/field mp (mt/id :products :id))
                                                 (lib/with-join-alias "Products")))])
                                    (lib/with-join-alias "Products")
                                    (lib/with-join-fields :all))))
            transform {:source {:type :query :query query}
                       :name   "single-stage-test"}
            result    (query-analysis/analyze-mbql-query transform)]
        (is (some? result))
        (is (some? (:preprocessed-query result)))
        (is (= 1 (count (:join-structure result))))
        (is (some? (:visited-fields result)))))))
