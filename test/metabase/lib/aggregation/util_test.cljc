(ns metabase.lib.aggregation.util-test
  (:require
   [clojure.test :refer [deftest is testing]]
   [metabase.lib.aggregation.util :as lib.aggregation.util]
   [metabase.lib.core :as lib]
   [metabase.lib.options :as lib.options]
   [metabase.lib.test-metadata :as meta]
   [metabase.lib.test-util :as lib.tu]))

(deftest ^:parallel unique-aggregation-name-test
  (let [query (lib.tu/venues-query)]
    (testing "first aggregation gets the base column name"
      (is (= "count"
             (lib.aggregation.util/unique-aggregation-name query -1 nil (lib/count)))))
    (testing "second aggregation with the same name gets deduplicated"
      (let [query (lib/aggregate query (lib/count))]
        (is (= "count_2"
               (lib.aggregation.util/unique-aggregation-name
                query -1 (lib/aggregations query) (lib/count))))))
    (testing "different aggregation types get their own names"
      (let [query (lib/aggregate query (lib/count))]
        (is (= "sum"
               (lib.aggregation.util/unique-aggregation-name
                query -1 (lib/aggregations query)
                (lib/sum (meta/field-metadata :venues :price)))))))
    (testing "three identical aggregations get sequential names"
      (let [query (-> query
                      (lib/aggregate (lib/count))
                      (lib/aggregate (lib/count)))]
        (is (= "count_2_2"
               (lib.aggregation.util/unique-aggregation-name
                query -1 (lib/aggregations query) (lib/count))))))
    (testing "existing clauses without :name are treated as if named"
      (let [strip-name  (fn [clause] (lib.options/update-options clause dissoc :name))
            raw-query   (-> (lib.tu/venues-query)
                            (lib/aggregate (lib/sum (meta/field-metadata :venues :price)))
                            (lib/aggregate (lib/sum (meta/field-metadata :venues :price)))
                            (update-in [:stages 0 :aggregation] #(mapv strip-name %)))
            existing    (lib/aggregations raw-query)]
        (testing "unnamed sums are treated as named for dedup"
          (is (= "sum_2_2"
                 (lib.aggregation.util/unique-aggregation-name
                  raw-query -1 existing
                  (lib/sum (meta/field-metadata :venues :price))))))
        (testing "a count doesn't conflict"
          (is (= "count"
                 (lib.aggregation.util/unique-aggregation-name
                  raw-query -1 existing (lib/count)))))))
    (testing "explicit :name on existing clauses is respected"
      (let [query (-> query
                      (lib/aggregate (lib/count))
                      (lib/aggregate (lib/sum (meta/field-metadata :venues :price))))]
        (is (= "sum_2"
               (lib.aggregation.util/unique-aggregation-name
                query -1 (lib/aggregations query)
                (lib/sum (meta/field-metadata :venues :price)))))))))
