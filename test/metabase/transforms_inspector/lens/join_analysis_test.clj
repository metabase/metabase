(ns ^:mb/driver-tests metabase.transforms-inspector.lens.join-analysis-test
  (:require
   [clojure.test :refer :all]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.query-processor.preprocess :as qp.preprocess]
   [metabase.test :as mt]
   [metabase.transforms-inspector.lens.join-analysis :as join-analysis]
   [metabase.transforms.util :as transforms.util]))

(set! *warn-on-reflection* true)

(comment join-analysis/keep-me)

;;; -------------------------------------------------- Native (HoneySQL) tests --------------------------------------------------

(deftest build-native-join-step-hsql-single-condition-test
  (testing "single-condition left join uses COUNT(CASE WHEN condition THEN 1 END)"
    (let [joins [{:strategy       :left-join
                  :join-table     :products
                  :join-condition [:= :orders.product_id :products.id]}]]
      (is (= {:select   [[[:count :*]] [[:count [:case [:= :orders.product_id :products.id] [:inline 1]]]]]
              :from     [:orders]
              :join-by  [:left-join [:products [:= :orders.product_id :products.id]]]}
             (#'join-analysis/build-native-join-step-hsql :orders joins))))))

(deftest build-native-join-step-hsql-multi-condition-test
  (testing "multi-condition left join uses the full AND condition in CASE WHEN"
    (let [condition [:and [:= :t1.id :t2.id] [:= :t1.foo :t2.foo]]
          joins     [{:strategy       :left-join
                      :join-table     :t2
                      :join-condition condition}]]
      (is (= {:select   [[[:count :*]] [[:count [:case condition [:inline 1]]]]]
              :from     [:t1]
              :join-by  [:left-join [:t2 condition]]}
             (#'join-analysis/build-native-join-step-hsql :t1 joins))))))

(deftest build-native-join-step-hsql-right-join-test
  (testing "right join also uses CASE WHEN condition"
    (let [joins [{:strategy       :right-join
                  :join-table     :products
                  :join-condition [:= :orders.product_id :products.id]}]]
      (is (= {:select   [[[:count :*]] [[:count [:case [:= :orders.product_id :products.id] [:inline 1]]]]]
              :from     [:orders]
              :join-by  [:right-join [:products [:= :orders.product_id :products.id]]]}
             (#'join-analysis/build-native-join-step-hsql :orders joins))))))

;;; -------------------------------------------------- MBQL tests --------------------------------------------------

(defn- preprocess-query-with-join
  "Build and preprocess a query with a single left join between orders and products."
  []
  (let [mp (mt/metadata-provider)]
    (-> (lib/query mp (lib.metadata/table mp (mt/id :orders)))
        (lib/join (-> (lib/join-clause
                       (lib.metadata/table mp (mt/id :products))
                       [(lib/= (lib.metadata/field mp (mt/id :orders :product_id))
                               (-> (lib.metadata/field mp (mt/id :products :id))
                                   (lib/with-join-alias "Products")))])
                      (lib/with-join-alias "Products")
                      (lib/with-join-fields :all)))
        transforms.util/massage-sql-query
        qp.preprocess/preprocess)))

(defn- preprocess-query-with-multi-condition-join
  "Build and preprocess a query with a multi-condition left join."
  []
  (let [mp (mt/metadata-provider)]
    (-> (lib/query mp (lib.metadata/table mp (mt/id :orders)))
        (lib/join (-> (lib/join-clause
                       (lib.metadata/table mp (mt/id :products))
                       [(lib/= (lib.metadata/field mp (mt/id :orders :product_id))
                               (-> (lib.metadata/field mp (mt/id :products :id))
                                   (lib/with-join-alias "Products")))
                        (lib/> (lib.metadata/field mp (mt/id :orders :quantity))
                               (-> (lib.metadata/field mp (mt/id :products :rating))
                                   (lib/with-join-alias "Products")))])
                      (lib/with-join-alias "Products")
                      (lib/with-join-fields :all)))
        transforms.util/massage-sql-query
        qp.preprocess/preprocess)))

(deftest make-join-step-query-mbql-single-condition-test
  (mt/test-drivers (mt/normal-drivers-with-feature :left-join)
    (testing "single-condition left join produces two aggregations: COUNT(*) and COUNT(CASE ...)"
      (let [preprocessed (preprocess-query-with-join)
            join         (first (lib/joins preprocessed 0))
            result       (#'join-analysis/make-join-step-query-mbql preprocessed 1 join)
            aggs         (lib/aggregations result 0)]
        (is (= 2 (count aggs))
            "should have COUNT(*) and COUNT(CASE WHEN condition THEN 1 END)")))))

(deftest make-join-step-query-mbql-multi-condition-test
  (mt/test-drivers (mt/normal-drivers-with-feature :left-join)
    (testing "multi-condition left join still produces two aggregations"
      (let [preprocessed (preprocess-query-with-multi-condition-join)
            join         (first (lib/joins preprocessed 0))
            result       (#'join-analysis/make-join-step-query-mbql preprocessed 1 join)
            aggs         (lib/aggregations result 0)]
        (is (= 2 (count aggs))
            "multi-condition join should still produce COUNT(*) + COUNT(CASE WHEN ... AND ... THEN 1 END)")))))
