(ns metabase.lib.aggregation.util-test
  (:require
   [clojure.test :refer [deftest is testing]]
   [metabase.lib.aggregation.util :as lib.aggregation.util]
   [metabase.lib.core :as lib]
   [metabase.lib.options :as lib.options]
   [metabase.lib.test-metadata :as meta]
   [metabase.lib.test-util :as lib.tu]))

(defn- strip-name [clause]
  (lib.options/update-options clause dissoc :name))

(deftest ^:parallel unique-aggregation-name-test
  (let [query (lib.tu/venues-query)]
    (testing "first aggregation gets 'aggregation'"
      (is (= "aggregation"
             (lib.aggregation.util/unique-aggregation-name nil))))
    (testing "second gets 'aggregation_2'"
      (let [query (lib/aggregate query (lib/count))]
        (is (= "aggregation_2"
               (lib.aggregation.util/unique-aggregation-name (lib/aggregations query))))))
    (testing "third gets 'aggregation_3'"
      (let [query (-> query
                      (lib/aggregate (lib/count))
                      (lib/aggregate (lib/sum (meta/field-metadata :venues :price))))]
        (is (= "aggregation_3"
               (lib.aggregation.util/unique-aggregation-name (lib/aggregations query))))))
    (testing "fills gaps after removal"
      (let [query (-> query
                      (lib/aggregate (lib/count))
                      (lib/aggregate (lib/count))
                      (lib/aggregate (lib/count)))
            query (lib/remove-clause query (first (lib/aggregations query)))]
        (is (= ["aggregation_2" "aggregation_3"]
               (mapv lib.options/clause-name (lib/aggregations query))))
        (is (= "aggregation"
               (lib.aggregation.util/unique-aggregation-name (lib/aggregations query))))))
    (testing "existing clauses without :name are ignored for dedup"
      (let [raw-query (-> (lib.tu/venues-query)
                          (lib/aggregate (lib/count))
                          (lib/aggregate (lib/count))
                          (update-in [:stages 0 :aggregation] #(mapv strip-name %)))
            existing  (lib/aggregations raw-query)]
        (is (= "aggregation"
               (lib.aggregation.util/unique-aggregation-name existing)))))))
