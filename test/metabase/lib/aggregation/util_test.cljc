(ns metabase.lib.aggregation.util-test
  (:require
   [clojure.test :refer [deftest is testing]]
   [metabase.lib.aggregation.util :as lib.aggregation.util]
   [metabase.lib.core :as lib]
   [metabase.lib.options :as lib.options]
   [metabase.lib.test-metadata :as meta]))

(defn- venues-query []
  (lib/query meta/metadata-provider (meta/table-metadata :venues)))

(deftest ^:parallel aggregation-column-names-test
  (testing "empty set when there are no aggregations"
    (is (= #{} (#'lib.aggregation.util/aggregation-column-names (venues-query) 0))))
  (testing "returns :name of each aggregation clause"
    (let [query (-> (venues-query)
                    (lib/aggregate (lib/count))
                    (lib/aggregate (lib/sum (meta/field-metadata :venues :price))))]
      (is (= #{"count" "sum"}
             (#'lib.aggregation.util/aggregation-column-names query 0)))))
  (testing "except-uuid drops that clause"
    (let [query (-> (venues-query)
                    (lib/aggregate (lib/count))
                    (lib/aggregate (lib/sum (meta/field-metadata :venues :price))))
          [agg1 _] (lib/aggregations query)]
      (is (= #{"sum"}
             (#'lib.aggregation.util/aggregation-column-names query 0 (lib.options/uuid agg1)))))))

(deftest ^:parallel with-unique-aggregation-name-test
  (testing "sets :name to the clause's column-name when no siblings collide"
    (let [query (venues-query)
          named (lib.aggregation.util/with-unique-aggregation-name query 0 (lib/count))]
      (is (= "count" (:name (lib.options/options named))))))
  (testing "deduplicates against existing sibling :names"
    (let [query   (lib/aggregate (venues-query) (lib/sum (meta/field-metadata :venues :id)))
          another (lib/sum (meta/field-metadata :venues :price))]
      (is (= "sum_2"
             (:name (lib.options/options
                     (lib.aggregation.util/with-unique-aggregation-name query 0 another)))))))
  (testing "existing aggregations without an explicit :name still participate in the dedup set via column-name-method"
    (let [query (-> (lib/aggregate (venues-query) (lib/count))
                    (update-in [:stages 0 :aggregation 0] lib.options/update-options dissoc :name))]
      (is (= "count_2"
             (:name (lib.options/options
                     (lib.aggregation.util/with-unique-aggregation-name query 0 (lib/count))))))))
  (testing "except-uuid removes that sibling from the dedup set"
    (let [query    (lib/aggregate (venues-query) (lib/sum (meta/field-metadata :venues :id)))
          [sibling] (lib/aggregations query)
          another  (lib/sum (meta/field-metadata :venues :price))]
      (is (= "sum"
             (:name (lib.options/options
                     (lib.aggregation.util/with-unique-aggregation-name
                       query 0 another (lib.options/uuid sibling)))))))))

(deftest ^:parallel with-unique-aggregation-name-after-replacement-test
  (testing "returns the replacement as-is when it already has :name"
    (let [query       (lib/aggregate (venues-query) (lib/sum (meta/field-metadata :venues :id)))
          [target]    (lib/aggregations query)
          replacement (lib.options/update-options (lib/count) assoc :name "custom")]
      (is (= replacement
             (lib.aggregation.util/with-unique-aggregation-name-after-replacement
               query 0 target replacement)))))
  (testing "preserves the target :name when the column-name matches (ignoring the target's :name)"
    (let [query       (-> (venues-query)
                          (lib/aggregate (lib/sum (meta/field-metadata :venues :id)))
                          (lib/aggregate (lib/sum (meta/field-metadata :venues :price))))
          [_ target]  (lib/aggregations query)  ; :name "sum_2", column-name-method "sum"
          replacement (lib/sum (meta/field-metadata :venues :latitude))]
      (is (= "sum_2"
             (:name (lib.options/options
                     (lib.aggregation.util/with-unique-aggregation-name-after-replacement
                       query 0 target replacement)))))))
  (testing "regenerates a unique :name when column-names differ"
    (let [query       (-> (venues-query)
                          (lib/aggregate (lib/sum (meta/field-metadata :venues :id)))
                          (lib/aggregate (lib/count)))
          [_ target]  (lib/aggregations query) ; count
          replacement (lib/avg (meta/field-metadata :venues :price))]
      (is (= "avg"
             (:name (lib.options/options
                     (lib.aggregation.util/with-unique-aggregation-name-after-replacement
                       query 0 target replacement))))))))
