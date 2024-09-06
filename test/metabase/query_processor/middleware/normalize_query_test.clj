(ns metabase.query-processor.middleware.normalize-query-test
  (:require
   [clojure.test :refer :all]
   [metabase.lib.test-metadata :as meta]
   [metabase.query-processor.middleware.normalize-query :as normalize-query]
   [metabase.query-processor.store :as qp.store]))

(deftest ^:parallel normalize-test
  (testing "handle legacy queries as they look when coming in from REST API"
    (qp.store/with-metadata-provider meta/metadata-provider
      (is (=? {:database     (meta/id)
               :lib/type     :mbql/query
               :lib/metadata meta/metadata-provider
               :stages       [{:lib/type     :mbql.stage/mbql
                               :source-table (meta/id :venues)
                               :fields       [[:field {:lib/uuid string?} (meta/id :venues :id)]
                                              [:field {:lib/uuid string?} (meta/id :venues :name)]]}]}
              (normalize-query/normalize-preprocessing-middleware
               {:database (meta/id)
                :type     "query"
                :query    {:source-table (meta/id :venues)
                           :fields       [["field" (meta/id :venues :id) nil]
                                          ["field" (meta/id :venues :name) nil]]}}))))))

(deftest ^:parallel normalize-dedups-order-bys-test
  (testing "order-by clauses are deduped"
    (qp.store/with-metadata-provider meta/metadata-provider
      (is (=? {:database     (meta/id)
               :lib/type     :mbql/query
               :lib/metadata meta/metadata-provider
               :stages       [{:lib/type     :mbql.stage/mbql
                               :source-table (meta/id :venues)
                               :fields       [[:field {:lib/uuid string?} (meta/id :venues :id)]]
                               :order-by     [[:asc
                                               {:lib/uuid string?}
                                               [:field
                                                {:lib/uuid string?
                                                 :base-type :type/BigInteger
                                                 :effective-type :type/BigInteger}
                                                (meta/id :venues :id)]]]}]}
              (normalize-query/normalize-preprocessing-middleware
               {:database (meta/id)
                :type     "query"
                :query    {:source-table (meta/id :venues)
                           :fields       [["field" (meta/id :venues :id) nil]]
                           :order-by     [[:asc ["field" (meta/id :venues :id)]]
                                          [:asc ["field" (meta/id :venues :id)]]]}}))))))
