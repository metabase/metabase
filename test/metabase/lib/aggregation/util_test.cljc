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
  (testing "empty when there are no aggregations"
    (is (= [] (#'lib.aggregation.util/aggregation-column-names (venues-query) 0))))
  (testing "returns the effective :name of each aggregation clause in order"
    (let [query (-> (venues-query)
                    (lib/aggregate (lib/count))
                    (lib/aggregate (lib/sum (meta/field-metadata :venues :price))))]
      (is (= ["count" "sum"]
             (#'lib.aggregation.util/aggregation-column-names query 0)))))
  (testing "deduplicates computed names from siblings without an explicit :name, preserving order"
    (let [query (-> (lib/aggregate (venues-query) (lib/count))
                    (lib/aggregate (lib/count))
                    (update-in [:stages 0 :aggregation 0] lib.options/update-options dissoc :name)
                    (update-in [:stages 0 :aggregation 1] lib.options/update-options dissoc :name))]
      (is (= ["count" "count_2"]
             (#'lib.aggregation.util/aggregation-column-names query 0))))))

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
  (testing "multiple siblings computing to the same base name advance the suffix correctly"
    ;; Two existing `:count` aggregations with no explicit :name — both compute to "count", so the dedup set is
    ;; {"count" "count_2"} and the next addition gets "count_3".
    (let [query (-> (lib/aggregate (venues-query) (lib/count))
                    (lib/aggregate (lib/count))
                    (update-in [:stages 0 :aggregation 0] lib.options/update-options dissoc :name)
                    (update-in [:stages 0 :aggregation 1] lib.options/update-options dissoc :name))]
      (is (= "count_3"
             (:name (lib.options/options
                     (lib.aggregation.util/with-unique-aggregation-name query 0 (lib/count))))))))
  (testing "skips existing indexed :names when assigning the next suffix"
    ;; After normal flow the stage already has aggregations with explicit :name \"count\" and \"count_2\".
    ;; A new count should become \"count_3\", not \"count_2_2\".
    (let [query (-> (venues-query)
                    (lib/aggregate (lib/count))
                    (lib/aggregate (lib/count)))]
      (is (= "count_3"
             (:name (lib.options/options
                     (lib.aggregation.util/with-unique-aggregation-name query 0 (lib/count)))))))))

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
  (testing "returns the replacement unchanged when column-names differ (no auto-rename)"
    (let [query       (-> (venues-query)
                          (lib/aggregate (lib/sum (meta/field-metadata :venues :id)))
                          (lib/aggregate (lib/count)))
          [_ target]  (lib/aggregations query) ; count
          replacement (lib/avg (meta/field-metadata :venues :price))]
      (is (= replacement
             (lib.aggregation.util/with-unique-aggregation-name-after-replacement
               query 0 target replacement))))))
