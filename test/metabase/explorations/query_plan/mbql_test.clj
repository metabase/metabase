(ns metabase.explorations.query-plan.mbql-test
  (:require
   [clojure.test :refer :all]
   [metabase.explorations.query-plan.mbql :as qp.mbql]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.query-processor.core :as qp]
   [metabase.test :as mt]))

(set! *warn-on-reflection* true)

(defn- products-query []
  (let [mp (mt/metadata-provider)]
    (-> (lib/query mp (lib.metadata/table mp (mt/id :products)))
        (lib/aggregate (lib/count)))))

(deftest apply-filter-path-empty-test
  (testing "an empty filter path leaves the query unchanged"
    (let [q (products-query)]
      (is (= (lib/filters q) (lib/filters (qp.mbql/apply-filter-path q [])))))))

(deftest apply-filter-path-equality-test
  (testing "a non-nil value adds an = filter that actually scopes the rows"
    (let [target  ["field" {} (mt/id :products :category)]
          q       (products-query)
          total   (-> q qp/process-query (get-in [:data :rows]) ffirst)
          gadgets (-> (qp.mbql/apply-filter-path q [{:target target :value "Gadget"}])
                      qp/process-query (get-in [:data :rows]) ffirst)]
      (is (= 1 (count (lib/filters (qp.mbql/apply-filter-path q [{:target target :value "Gadget"}])))))
      (is (pos? gadgets))
      (is (< gadgets total) "the filter removes non-Gadget rows"))))

(deftest apply-filter-path-nil-is-null-test
  (testing "a nil value inverts to is-null, not = NULL"
    (let [target ["field" {} (mt/id :products :category)]
          q      (products-query)
          filt   (first (lib/filters (qp.mbql/apply-filter-path q [{:target target :value nil}])))]
      (is (= :is-null (first filt))
          "nil → is-null so the (empty) child selects its rows rather than zero"))))

(deftest apply-filter-path-conjunction-test
  (testing "multiple steps accumulate as a conjunction"
    (let [q (products-query)
          path [{:target ["field" {} (mt/id :products :category)] :value "Gadget"}
                {:target ["field" {} (mt/id :products :vendor)]   :value "Sallie Mayert"}]]
      (is (= 2 (count (lib/filters (qp.mbql/apply-filter-path q path))))))))
