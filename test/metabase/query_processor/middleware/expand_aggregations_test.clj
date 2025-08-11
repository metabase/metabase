(ns metabase.query-processor.middleware.expand-aggregations-test
  (:require
   [clojure.test :refer [deftest is testing]]
   [medley.core :as m]
   [metabase.lib-be.metadata.jvm :as lib.metadata.jvm]
   [metabase.lib.convert :as lib.convert]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.lib.options :as lib.options]
   [metabase.query-processor :as qp]
   [metabase.test :as mt])
  (:import (clojure.lang ExceptionInfo)))

(deftest ^:parallel expand-aggregations-test
  (let [mp (lib.metadata.jvm/application-database-metadata-provider (mt/id))
        find-col (fn [query col-name]
                   (->> (lib/aggregable-columns query nil)
                        (m/find-first (comp #{col-name} :display-name))))
        find-sum-of-total (fn [query]
                            (find-col query "Sum of Total"))
        query (as-> (lib/query mp (lib.metadata/table mp (mt/id :orders))) $
                (lib/aggregate $ (lib/sum (lib.metadata/field mp (mt/id :orders :total))))
                (lib/aggregate $ (lib/with-expression-name (lib/* 2 (find-sum-of-total $)) "2*sum")))]
    (testing "simple reference"
      (is (= {:columns ["sum" "2*sum"]
              :rows [[1510617.7 3021235.4]]}
             (mt/formatted-rows+column-names [2.0 2.0] (qp/process-query query)))))
    (testing "multiple references"
      (is (= {:columns ["sum" "2*sum" "3*sum"]
              :rows [[1510617.7 3021235.4 4531853.1]]}
             (let [query (lib/aggregate query (lib/with-expression-name (lib/* 3 (find-sum-of-total query)) "3*sum"))]
               (mt/formatted-rows+column-names [2.0 2.0 2.0] (qp/process-query query))))))
    (testing "multiple reference levels"
      (is (= {:columns ["sum" "2*sum" "6*sum"]
              :rows [[1510617.7 3021235.4 9063706.2]]}
             (let [query (lib/aggregate query (lib/with-expression-name (lib/* 3 (find-col query "2*sum")) "6*sum"))]
               (mt/formatted-rows+column-names [2.0 2.0 2.0] (qp/process-query query))))))
    (testing "combined references"
      (let [query (lib/aggregate query (lib/with-expression-name (lib/* 3 (find-col query "2*sum")) "6*sum"))
            query (lib/aggregate query (lib/with-expression-name
                                         (lib/+ (find-col query "2*sum") (find-col query "6*sum"))
                                         "8*sum"))]
        (is (= {:columns ["sum" "2*sum" "6*sum" "8*sum"]
                :rows [[1510617.7 3021235.4 9063706.2 12084941.6]]}
               (mt/formatted-rows+column-names [2.0 2.0 2.0 2.0] (qp/process-query query))))
        (testing "cyclic definition"
          (let [sum8-id (-> (get-in query [:stages 0 :aggregation 3])
                            lib.options/uuid)
                query (assoc-in query [:stages 0 :aggregation 1 3 2] sum8-id)]
            (is (thrown-with-msg? ExceptionInfo #"cyclic aggregation definition"
                                  (qp/process-query query)))))
        (testing "dangling reference"
          (let [dangling-ref (str (random-uuid))
                query (assoc-in query [:stages 0 :aggregation 1 3 2] dangling-ref)]
            ;; this does not reach the expand-aggregations middleware, because the schema check fails earlier
            (is (thrown-with-msg? ExceptionInfo (re-pattern (str "no aggregation with uuid " dangling-ref))
                                  (qp/process-query query)))))))
    (testing "in card"
      (mt/with-temp [:model/Card card {:dataset_query (lib.convert/->legacy-MBQL query)
                                       :database_id (mt/id)
                                       :name "Orders, Sum of Total and double Sum of Total"}]
        (let [query (lib/query mp (lib.metadata/card mp (:id card)))]
          (is (= {:columns ["sum" "2*sum"]
                  :rows [[1510617.7 3021235.4]]}
                 (mt/formatted-rows+column-names [2.0 2.0] (qp/process-query query)))))))))

(deftest ^:parallel expand-aggregations-metric-test
  (let [mp (lib.metadata.jvm/application-database-metadata-provider (mt/id))
        find-col (fn [query col-name]
                   (->> (lib/aggregable-columns query nil)
                        (m/find-first (comp #{col-name} :display-name))))
        metric-query (-> (lib/query mp (lib.metadata/table mp (mt/id :orders)))
                         (lib/aggregate (lib/sum (lib.metadata/field mp (mt/id :orders :total)))))]
    (testing "metrics can be referenced"
      (mt/with-temp [:model/Card metric {:dataset_query (lib.convert/->legacy-MBQL metric-query)
                                         :database_id (mt/id)
                                         :name "Order Total"
                                         :type :metric}]
        (let [query (-> (lib/query mp (lib.metadata/table mp (mt/id :orders)))
                        (lib/aggregate (lib.metadata/metric mp (:id metric))))
              query (lib/aggregate query (lib/with-expression-name
                                           (lib/* 2 (find-col query "Order Total"))
                                           "2*total"))]
          (is (= {:columns ["sum" "2*total"]
                  :rows [[1510617.7 3021235.4]]}
                 (mt/formatted-rows+column-names [2.0 2.0] (qp/process-query query)))))))))

(deftest ^:parallel expand-aggregations-preserve-name-test
  (let [mp (lib.metadata.jvm/application-database-metadata-provider (mt/id))
        find-col (fn [query col-name]
                   (->> (lib/aggregable-columns query nil)
                        (m/find-first (comp #{col-name} :display-name))))
        query (as-> (lib/query mp (lib.metadata/table mp (mt/id :orders))) $
                (lib/aggregate $ (lib/with-expression-name
                                   (lib/sum (lib.metadata/field mp (mt/id :orders :total)))
                                   "Custom Sum"))
                (lib/aggregate $ (lib/with-expression-name (lib/ref (find-col $ "Custom Sum")) "Derived")))]
    (testing "names are preserved"
      (is (= {:columns ["Custom Sum" "Derived"]
              :rows [[1510617.7 1510617.7]]}
             (mt/formatted-rows+column-names [2.0 2.0] (qp/process-query query)))))))
