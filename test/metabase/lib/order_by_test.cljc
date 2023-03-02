(ns metabase.lib.order-by-test
  (:require
   [clojure.test :refer [deftest is testing]]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.lib.test-metadata :as meta])
  #?(:cljs (:require [metabase.test-runner.assert-exprs.approximately-equal])))

(deftest ^:parallel order-by-test
  (is (=? {:database (meta/id)
           :type     :pipeline
           :stages   [{:lib/type     :mbql.stage/mbql
                       :source-table (meta/id :venues)
                       :order-by     [[:asc
                                       {:lib/uuid string?}
                                       [:field (meta/id :venues :id) {:lib/uuid string?}]]]}]}
          (-> (lib/query meta/metadata "VENUES")
              (lib/order-by (lib/field "VENUES" "ID"))))))

(deftest ^:parallel threading-test
  (is (=? {:database (meta/id)
           :type     :pipeline
           :stages   [{:lib/type     :mbql.stage/mbql
                       :source-table (meta/id :venues)
                       :order-by     [[:asc
                                       {:lib/uuid string?}
                                       [:field (meta/id :venues :id) {:lib/uuid string?}]]]}]}
          (-> (lib/query meta/metadata "VENUES")
              (lib/order-by (lib/field "VENUES" "ID"))
              (dissoc :lib/metadata)))))

(deftest ^:parallel threading-with-direction-test
  (is (=? {:database (meta/id)
           :type     :pipeline
           :stages   [{:lib/type     :mbql.stage/mbql
                       :source-table (meta/id :venues)
                       :order-by     [[:desc
                                       {:lib/uuid string?}
                                       [:field (meta/id :venues :id) {:lib/uuid string?}]]]}]}
          (-> (lib/query meta/metadata "VENUES")
              (lib/order-by (lib/field "VENUES" "ID") :desc)
              (dissoc :lib/metadata)))))

(deftest ^:parallel specific-stage-test
  (is (=? {:lib/type :mbql/query
           :database 1
           :type     :pipeline
           :stages   [{:lib/type     :mbql.stage/mbql
                       :lib/options  {:lib/uuid string?}
                       :source-table (meta/id :venues)}
                      {:lib/type    :mbql.stage/mbql
                       :lib/options {:lib/uuid string?}
                       :order-by    [[:asc
                                      {:lib/uuid string?}
                                      [:field
                                       (meta/id :venues :id)
                                       {:lib/uuid string?}]]]}
                      {:lib/type    :mbql.stage/mbql
                       :lib/options {:lib/uuid string?}}]}
          (-> (lib/query meta/metadata {:database 1
                                        :type     :query
                                        :query    {:source-query {:source-query {:source-table (meta/id :venues)}}}})
              (lib/order-by 1 (lib/field "VENUES" "ID") :asc)
              (dissoc :lib/metadata)))))

(deftest ^:parallel order-by-field-metadata-test
  (testing "Should be able to create an order by using raw Field metadata"
    (is (=? [:asc
             {:lib/uuid string?}
             [:field (meta/id :venues :id) {:lib/uuid string?}]]
            (lib/order-by-clause {} -1 (lib.metadata/field-metadata meta/metadata "VENUES" "ID"))))))

(deftest ^:parallel append-order-by-field-metadata-test
  (testing "Should be able to add an order by using raw Field metadata"
    (let [query     (lib/query meta/metadata "CATEGORIES")
          venues-id (lib.metadata/field-metadata query "VENUES" "ID")]
      (is (=? {:database (meta/id)
               :stages   [{:lib/type     :mbql.stage/mbql
                           :source-table (meta/id :categories)
                           :order-by     [[:asc
                                           {:lib/uuid string?}
                                           [:field (meta/id :venues :id) {:lib/uuid string?}]]]}]}
              (-> query
                  (lib/order-by venues-id)
                  (dissoc :lib/metadata)))))))

(deftest ^:parallel order-bys-test
  (is (=? [[:asc
            {:lib/uuid string?}
            [:field (meta/id :venues :id) {:lib/uuid string?}]]]
          (-> (lib/query meta/metadata "VENUES")
              (lib/order-by (lib/field "VENUES" "ID"))
              lib/order-bys))))
