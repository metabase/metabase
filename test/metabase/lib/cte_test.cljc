(ns metabase.lib.cte-test
  (:require
   [clojure.test :refer [deftest is testing]]
   [metabase.lib.core :as lib]
   [metabase.lib.test-util :as lib.tu]
   [metabase.util.malli.registry :as mr]))

(deftest ^:parallel cte-definition-schema-test
  (testing "a valid CTE definition validates"
    (is (mr/validate :metabase.lib.schema/cte-definition
                     {:lib/type :mbql/cte
                      :lib/uuid (str (random-uuid))
                      :cte-name "events_base"
                      :query    (lib.tu/venues-query)})))
  (testing "missing :cte-name is rejected"
    (is (not (mr/validate :metabase.lib.schema/cte-definition
                          {:lib/type :mbql/cte
                           :lib/uuid (str (random-uuid))
                           :query    (lib.tu/venues-query)})))))

(deftest ^:parallel ctes-unique-names-test
  (let [body (lib.tu/venues-query)
        a    {:lib/type :mbql/cte :lib/uuid (str (random-uuid)) :cte-name "a" :query body}
        a'   {:lib/type :mbql/cte :lib/uuid (str (random-uuid)) :cte-name "a" :query body}
        b    {:lib/type :mbql/cte :lib/uuid (str (random-uuid)) :cte-name "b" :query body}]
    (testing "distinct names validate"
      (is (mr/validate :metabase.lib.schema/ctes [a b])))
    (testing "an empty vector validates"
      (is (mr/validate :metabase.lib.schema/ctes [])))
    (testing "duplicate names are rejected"
      (is (not (mr/validate :metabase.lib.schema/ctes [a a']))))))

(deftest ^:parallel wrap-as-cte-test
  (let [wrapped (-> (lib.tu/venues-query) (lib/wrap-as-cte "events_base"))]
    (testing "the CTE is registered under its name"
      (is (= "events_base" (:cte-name (lib/cte-by-name wrapped "events_base")))))
    (testing "stage 0 reads from the CTE by its minted uuid"
      (let [cte-uuid (:lib/uuid (lib/cte-by-name wrapped "events_base"))]
        (is (= cte-uuid (-> wrapped :stages first :source-cte)))))
    (testing "the inner body is stripped of :ctes"
      (is (not (contains? (-> wrapped :ctes first :query) :ctes))))
    (testing "cte-by-name returns nil for unknown names"
      (is (nil? (lib/cte-by-name wrapped "nope"))))
    (testing "the result validates as a query"
      (is (mr/validate :metabase.lib.schema/query wrapped)))))

(deftest ^:parallel wrap-as-cte-carries-existing-ctes-test
  (testing "wrapping a query that already has CTEs keeps them on the outer and adds the new one"
    (let [twice (-> (lib.tu/venues-query)
                    (lib/wrap-as-cte "a")
                    (lib/wrap-as-cte "b"))]
      (is (= ["a" "b"] (mapv :cte-name (lib/ctes twice))))
      (testing "the new outer's stage 0 points at the new CTE"
        (is (= (:lib/uuid (lib/cte-by-name twice "b"))
               (-> twice :stages first :source-cte)))))))

(deftest ^:parallel join-clause-carries-ctes-test
  (testing "lib/join-clause on a query with :ctes copies them to the resulting join"
    (let [wrapped (-> (lib.tu/venues-query) (lib/wrap-as-cte "a"))
          join    (lib/join-clause wrapped
                                   [(lib/= (lib.tu/field-clause :venues :id)
                                           (lib.tu/field-clause :venues :id))])]
      (is (= ["a"] (mapv :cte-name (:ctes join))))
      (is (= (-> wrapped :stages first :source-cte)
             (-> join :stages first :source-cte))))))

(deftest ^:parallel source-cte-mutually-exclusive-test
  (let [wrapped (-> (lib.tu/venues-query) (lib/wrap-as-cte "a"))
        stage0  (-> wrapped :stages first)]
    (testing "stage 0 with both :source-cte and :source-table is rejected"
      (is (not (mr/validate :metabase.lib.schema/query
                            (assoc-in wrapped [:stages 0] (assoc stage0 :source-table 1))))))))
