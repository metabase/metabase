(ns metabase.query-processor.middleware.expand-aggregations-test
  (:require
   [clojure.test :refer [deftest is testing]]
   [medley.core :as m]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.lib.options :as lib.options]
   [metabase.lib.test-util :as lib.tu]
   [metabase.query-processor.test :as qp]
   [metabase.test :as mt])
  (:import
   (clojure.lang ExceptionInfo)))

(defn- expand-aggregations-test-find-col [query col-name]
  (->> (lib/aggregable-columns query nil)
       (m/find-first (comp #{col-name} :display-name))))

(defn- expand-aggregaations-test-find-sum-of-total [query]
  (expand-aggregations-test-find-col query "Sum of Total"))

(defn- expand-aggregations-test-query []
  (let [mp (mt/metadata-provider)]
    (as-> (lib/query mp (lib.metadata/table mp (mt/id :orders))) $
      (lib/aggregate $ (lib/sum (lib.metadata/field mp (mt/id :orders :total))))
      (lib/aggregate $ (lib/with-expression-name (lib/* 2 (expand-aggregaations-test-find-sum-of-total $)) "2*sum")))))

(deftest ^:parallel expand-aggregations-test
  (let [query (expand-aggregations-test-query)]
    (testing "simple reference"
      (is (= {:columns ["sum" "2*sum"]
              :rows [[1510617.7 3021235.4]]}
             (mt/formatted-rows+column-names [2.0 2.0] (qp/process-query query)))))))

(deftest ^:parallel expand-aggregations-test-2
  (let [query (expand-aggregations-test-query)]
    (testing "multiple references"
      (is (= {:columns ["sum" "2*sum" "3*sum"]
              :rows [[1510617.7 3021235.4 4531853.1]]}
             (let [query (lib/aggregate query (lib/with-expression-name (lib/* 3 (expand-aggregaations-test-find-sum-of-total query)) "3*sum"))]
               (mt/formatted-rows+column-names [2.0 2.0 2.0] (qp/process-query query))))))))

(deftest ^:parallel expand-aggregations-test-3
  (let [query (expand-aggregations-test-query)]
    (testing "multiple reference levels"
      (is (= {:columns ["sum" "2*sum" "6*sum"]
              :rows [[1510617.7 3021235.4 9063706.2]]}
             (let [query (lib/aggregate query (lib/with-expression-name (lib/* 3 (expand-aggregations-test-find-col query "2*sum")) "6*sum"))]
               (mt/formatted-rows+column-names [2.0 2.0 2.0] (qp/process-query query))))))))

(deftest ^:parallel expand-aggregations-test-4
  (let [query (expand-aggregations-test-query)]
    (testing "combined references"
      (let [query (as-> query $query
                    (lib/aggregate $query (lib/with-expression-name (lib/* 3 (expand-aggregations-test-find-col $query "2*sum")) "6*sum"))
                    (lib/aggregate $query (lib/with-expression-name
                                            (lib/+ (expand-aggregations-test-find-col $query "2*sum")
                                                   (expand-aggregations-test-find-col $query "6*sum"))
                                            "8*sum")))]
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
                                  (qp/process-query query)))))))))

(deftest ^:parallel expand-aggregations-test-5
  (testing "in card"
    (let [query (expand-aggregations-test-query)
          mp    (lib.tu/mock-metadata-provider
                 (:lib/metadata query)
                 {:cards [{:id            1
                           :dataset-query query
                           :database-id   (mt/id)
                           :name          "Orders, Sum of Total and double Sum of Total"}]})
          query (lib/query mp (lib.metadata/card mp 1))]
      (is (= {:columns ["sum" "2*sum"]
              :rows    [[1510617.7 3021235.4]]}
             (mt/formatted-rows+column-names [2.0 2.0] (qp/process-query query)))))))

(deftest ^:parallel expand-aggregations-metric-test
  (testing "metrics can be referenced"
    (let [mp           (mt/metadata-provider)
          find-col     (fn [query col-name]
                         (->> (lib/aggregable-columns query nil)
                              (m/find-first (comp #{col-name} :display-name))))
          metric-query (-> (lib/query mp (lib.metadata/table mp (mt/id :orders)))
                           (lib/aggregate (lib/sum (lib.metadata/field mp (mt/id :orders :total)))))
          mp           (lib.tu/mock-metadata-provider
                        mp
                        {:cards [{:id            1
                                  :dataset-query metric-query
                                  :database-id   (mt/id)
                                  :name          "Order Total"
                                  :type          :metric}]})
          query        (-> (lib/query mp (lib.metadata/table mp (mt/id :orders)))
                           (lib/aggregate (lib.metadata/metric mp 1))
                           (as-> $query (lib/aggregate $query (lib/with-expression-name
                                                                (lib/* 2 (find-col $query "Order Total"))
                                                                "2*total"))))]
      (is (= {:columns ["sum" "2*total"]
              :rows    [[1510617.7 3021235.4]]}
             (mt/formatted-rows+column-names [2.0 2.0] (qp/process-query query)))))))

(deftest ^:parallel expand-aggregations-preserve-name-test
  (let [mp (mt/metadata-provider)
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

;;; Aggregations that reference an earlier aggregation, used in a follow-up stage.

(defn- nested-aggregations-query
  "Orders with `Foo` = min of Subtotal and `Bar` = `Foo` + average of Tax, optionally broken out by month."
  [{:keys [breakout?]}]
  (let [mp (mt/metadata-provider)]
    (as-> (lib/query mp (lib.metadata/table mp (mt/id :orders))) $
      (lib/aggregate $ (lib/with-expression-name (lib/min (lib.metadata/field mp (mt/id :orders :subtotal))) "Foo"))
      (lib/aggregate $ (lib/with-expression-name
                         (lib/+ (expand-aggregations-test-find-col $ "Foo")
                                (lib/avg (lib.metadata/field mp (mt/id :orders :tax))))
                         "Bar"))
      (cond-> $
        breakout? (lib/breakout (lib/with-temporal-bucket
                                  (lib.metadata/field mp (mt/id :orders :created_at))
                                  :month))))))

(defn- unnested-aggregations-rows
  "The rows of [[nested-aggregations-query]] computed without an aggregation reference: [breakout... foo bar]."
  [{:keys [breakout?]}]
  (let [mp    (mt/metadata-provider)
        query (cond-> (-> (lib/query mp (lib.metadata/table mp (mt/id :orders)))
                          (lib/aggregate (lib/min (lib.metadata/field mp (mt/id :orders :subtotal))))
                          (lib/aggregate (lib/avg (lib.metadata/field mp (mt/id :orders :tax)))))
                breakout? (lib/breakout (lib/with-temporal-bucket
                                          (lib.metadata/field mp (mt/id :orders :created_at))
                                          :month)))]
    (for [row (mt/rows (qp/process-query query))
          :let [[foo avg-tax] (take-last 2 row)]]
      (concat (drop-last 2 row) [foo (+ foo avg-tax)]))))

(defn- find-stage-column [query col-name]
  (m/find-first (comp #{col-name} :display-name) (lib/visible-columns query)))

(defn- approx= [x y]
  (< (abs (- x y)) 1e-6))

(defn- approx-rows= [expected actual]
  (and (= (count expected) (count actual))
       (every? true? (map (fn [expected-row actual-row]
                            (and (= (count expected-row) (count actual-row))
                                 (every? true? (map #(if (number? %1) (approx= %1 %2) (= %1 %2))
                                                    expected-row actual-row))))
                          expected actual))))

(deftest ^:parallel nested-aggregations-results-test
  (doseq [breakout? [false true]]
    (testing (str "breakout? " breakout?)
      (let [rows (mt/rows (qp/process-query (nested-aggregations-query {:breakout? breakout?})))]
        (is (seq rows))
        (is (approx-rows= (unnested-aggregations-rows {:breakout? breakout?}) rows))))))

(deftest ^:parallel nested-aggregations-in-follow-up-stage-expression-test
  (doseq [breakout? [false true]]
    (testing (str "breakout? " breakout?)
      (let [query  (as-> (lib/append-stage (nested-aggregations-query {:breakout? breakout?})) $
                     (lib/expression $ "Sum" (lib/+ (find-stage-column $ "Foo") (find-stage-column $ "Bar"))))
            result (qp/process-query query)]
        (is (= (cond->> ["Foo" "Bar" "Sum"]
                 breakout? (cons "Created At: Month"))
               (map :display_name (mt/cols result))))
        (is (approx-rows= (for [row (unnested-aggregations-rows {:breakout? breakout?})
                                :let [[foo bar] (take-last 2 row)]]
                            (concat row [(+ foo bar)]))
                          (mt/rows result)))))))

(deftest ^:parallel nested-aggregations-in-follow-up-stage-filter-test
  (let [query    (as-> (lib/append-stage (nested-aggregations-query {:breakout? true})) $
                   (lib/filter $ (lib/between (find-stage-column $ "Bar") 5 20)))
        expected (filter (fn [row] (<= 5 (last row) 20))
                         (unnested-aggregations-rows {:breakout? true}))]
    (is (seq expected))
    (is (< (count expected) (count (unnested-aggregations-rows {:breakout? true}))))
    (is (approx-rows= expected (mt/rows (qp/process-query query))))))

(deftest ^:parallel nested-aggregations-in-order-by-test
  (testing "the summarize step sorts by an aggregation that references another one"
    (let [query (as-> (nested-aggregations-query {:breakout? true}) $
                  (lib/order-by $ (m/find-first (comp #{"Bar"} :display-name) (lib/orderable-columns $))))]
      (is (approx-rows= (sort-by last (unnested-aggregations-rows {:breakout? true}))
                        (mt/rows (qp/process-query query)))))))

(deftest ^:parallel nested-aggregations-in-follow-up-stage-summarize-test
  (let [query (-> (nested-aggregations-query {:breakout? true})
                  lib/append-stage
                  (lib/aggregate (lib/count)))]
    (is (= [[(count (unnested-aggregations-rows {:breakout? true}))]]
           (mt/formatted-rows [int] (qp/process-query query))))))

(deftest ^:parallel nested-aggregations-in-follow-up-stage-join-test
  (let [mp          (mt/metadata-provider)
        products    (lib.metadata/table mp (mt/id :products))
        product-id  (lib.metadata/field mp (mt/id :products :id))
        price-by-id (into {} (mt/rows (qp/process-query
                                       (-> (lib/query mp products)
                                           (lib/with-fields [product-id
                                                             (lib.metadata/field mp (mt/id :products :price))])))))]
    (doseq [breakout? [false true]]
      (testing (str "breakout? " breakout?)
        (let [query  (as-> (lib/append-stage (nested-aggregations-query {:breakout? breakout?})) $
                       (lib/join $ (-> (lib/join-clause products [(lib/= (find-stage-column $ "Foo")
                                                                         (lib.metadata/field mp (mt/id :products :price)))])
                                       (lib/with-join-fields [product-id]))))
              result (qp/process-query query)
              rows   (mt/rows result)]
          (is (= (cond->> ["Foo" "Bar" "Products - Foo → ID"]
                   breakout? (cons "Created At: Month"))
                 (map :display_name (mt/cols result))))
          (testing "every joined product has the price of the row's Foo"
            (is (some (comp some? last) rows))
            (doseq [row   rows
                    :let  [id (last row)]
                    :when (some? id)]
              (is (approx= (nth row (- (count row) 3)) (price-by-id id))))))))))

(defn- same-named-aggregations-query []
  (let [mp (mt/metadata-provider)]
    (as-> (lib/query mp (lib.metadata/table mp (mt/id :orders))) $
      (lib/aggregate $ (lib/with-expression-name (lib/+ (lib/count) 1) "Count"))
      (lib/aggregate $ (lib/with-expression-name (lib/+ (expand-aggregations-test-find-col $ "Count") 1) "Count"))
      (lib/breakout $ (lib/with-temporal-bucket (lib.metadata/field mp (mt/id :orders :created_at)) :month)))))

(deftest ^:parallel same-named-aggregations-test
  (testing "the second Count references the first one"
    (let [rows (mt/rows (qp/process-query (same-named-aggregations-query)))]
      (is (seq rows))
      (is (every? (fn [[_month count-1 count-2]] (= (inc count-1) count-2)) rows))))
  (testing "swapping the aggregations swaps the columns but not the values"
    (let [query             (same-named-aggregations-query)
          [count-1 count-2] (lib/aggregations query)
          rows              (mt/rows (qp/process-query query))
          swapped-rows      (mt/rows (qp/process-query (lib/swap-clauses query 0 count-1 count-2)))]
      (is (= (map (fn [[month c1 c2]] [month c2 c1]) rows)
             swapped-rows)))))

(deftest ^:parallel same-named-aggregations-in-follow-up-stage-filter-test
  (let [query                     (lib/append-stage (same-named-aggregations-query))
        [count-1-col count-2-col] (filter (comp #{"Count"} :display-name) (lib/filterable-columns query))
        query                     (-> query
                                      (lib/filter (lib/<= count-1-col 2.5))
                                      (lib/filter (lib/>= count-2-col 2.5)))
        expected                  (filter (fn [[_month count-1 count-2]] (and (<= count-1 2.5) (>= count-2 2.5)))
                                          (mt/rows (qp/process-query (same-named-aggregations-query))))]
    (testing "each filter applies to its own Count"
      (is (seq expected))
      (is (= expected (mt/rows (qp/process-query query)))))
    (testing "swapping the aggregations keeps each filter on its own Count"
      (let [[count-1 count-2] (lib/aggregations query 0)
            swapped           (lib/swap-clauses query 0 count-1 count-2)]
        (is (= (map (fn [[month c1 c2]] [month c2 c1]) expected)
               (mt/rows (qp/process-query swapped))))))))
